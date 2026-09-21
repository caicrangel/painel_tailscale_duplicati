#!/bin/bash
#
# check-mounts.sh — verificação de pontos de montagem antes do backup.
#
# O que mudou em relação à versão que enviava direto para o Telegram:
#   • a checagem e a REMONTAGEM continuam aqui (precisam de root e das
#     syscalls de mount — isso não tem como sair da máquina);
#   • o relatório vai para o painel, que guarda o histórico, mostra na tela da
#     máquina, alerta quando falha E alerta quando a verificação PARA de chegar;
#   • o token do bot do Telegram sai daqui: uma credencial a menos espalhada
#     por máquina de cliente. O painel envia a mensagem.
#
# Uso: crontab do root, alguns minutos antes do horário do backup.
#   50 18 * * * /opt/scripts/check-mounts.sh
#
set -u

# ==================== CONFIGURAÇÃO ====================
# Formato: "PONTO_DE_MONTAGEM|FSTYPE_ESPERADO"
# Origem e opções de montagem vêm do /etc/fstab.
MOUNTS=(
  "/mnt/server_cbh|cifs"
  #"/mnt/outro-share|nfs4"
)

# Endereço do painel na tailnet e o token de ingestão DO CLIENTE
# (o mesmo usado no --send-http-url do Duplicati).
PAINEL_URL="${PAINEL_URL:-http://100.x.y.z:3000}"
PAINEL_TOKEN="${PAINEL_TOKEN:-}"

MIN_ITENS=2         # itens mínimos no ponto para o conteúdo ser considerado válido
LOG="/var/log/check-mounts.log"
TIMEOUT=15          # segundos até considerar o mount travado
TENTATIVAS=3
INTERVALO=10
BOOT_RECENTE=3600   # alerta se o boot foi há menos que isto (segundos)
# ======================================================

mkdir -p "$(dirname "$LOG")"
log() { echo "$(date '+%F %T') | $*" | tee -a "$LOG"; }

# Execução única: evita sobreposição entre chamadas do cron
exec 9>/var/lock/check-mounts.lock
if ! flock -n 9; then
  log "AVISO: outra instância em execução. Saindo."
  exit 0
fi

# ---------- utilidades ----------
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g'; }
acessivel() { timeout "$TIMEOUT" ls "$1" >/dev/null 2>&1; }
fstype_atual() { findmnt -no FSTYPE --target "$1" 2>/dev/null; }

populado() {
  local N
  N=$(timeout "$TIMEOUT" ls -A "$1" 2>/dev/null | head -n $((MIN_ITENS + 1)) | wc -l)
  [ "$N" -ge "$MIN_ITENS" ]
}

montar() {
  local DST="$1"
  for (( i=1; i<=TENTATIVAS; i++ )); do
    log "Tentativa $i/$TENTATIVAS: mount $DST"
    if mount "$DST" >>"$LOG" 2>&1 && acessivel "$DST"; then
      log "OK: $DST montado e acessível."
      return 0
    fi
    [ "$i" -lt "$TENTATIVAS" ] && sleep "$INTERVALO"
  done
  return 1
}

# ---------- verificação ----------
INICIO=$(date +%s)
INICIO_ISO=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
FALHAS=0
REMONTADOS=0
PONTOS_JSON=""

adicionar_ponto() {
  # $1 path · $2 status · $3 fstype esperado · $4 fstype atual · $5 detalhe · $6 df
  local DF_SIZE="" DF_USED="" DF_AVAIL="" DF_PCT=""
  if [ -n "${6:-}" ]; then
    read -r DF_SIZE DF_USED DF_AVAIL DF_PCT <<< "$6"
  fi
  local ITEM
  ITEM=$(printf '{"path":"%s","status":"%s","fstypeExpected":"%s","fstypeActual":"%s","detail":"%s","size":"%s","used":"%s","avail":"%s","usePercent":"%s"}' \
    "$(json_escape "$1")" "$2" "$(json_escape "${3:-}")" "$(json_escape "${4:-}")" \
    "$(json_escape "${5:-}")" "$DF_SIZE" "$DF_USED" "$DF_AVAIL" "$DF_PCT")
  PONTOS_JSON="${PONTOS_JSON:+$PONTOS_JSON,}$ITEM"
}

log "=== Início da verificação ==="

for LINHA in "${MOUNTS[@]}"; do
  IFS='|' read -r DST FSTYPE <<< "$LINHA"

  if ! grep -qE "^[^#].*[[:space:]]${DST}[[:space:]]" /etc/fstab; then
    log "ERRO: $DST não possui entrada no /etc/fstab."
    adicionar_ponto "$DST" "FAILED" "$FSTYPE" "" "sem entrada no /etc/fstab"
    FALHAS=$((FALHAS + 1))
    continue
  fi

  STATUS="OK"

  if ! mountpoint -q "$DST"; then
    log "AVISO: $DST NÃO está montado."
    if montar "$DST"; then
      STATUS="REMOUNTED"
      REMONTADOS=$((REMONTADOS + 1))
    else
      log "ERRO: falha ao montar $DST."
      adicionar_ponto "$DST" "FAILED" "$FSTYPE" "" "falha ao montar após ${TENTATIVAS} tentativas"
      FALHAS=$((FALHAS + 1))
      continue
    fi
  elif ! acessivel "$DST"; then
    log "AVISO: $DST montado porém inacessível. Remontando..."
    umount -f "$DST" >>"$LOG" 2>&1 || umount -l "$DST" >>"$LOG" 2>&1
    sleep 3
    if montar "$DST"; then
      STATUS="REMOUNTED"
      REMONTADOS=$((REMONTADOS + 1))
    else
      log "ERRO: $DST continua inacessível."
      adicionar_ponto "$DST" "FAILED" "$FSTYPE" "$(fstype_atual "$DST")" "montado porém inacessível (timeout de I/O)"
      FALHAS=$((FALHAS + 1))
      continue
    fi
  fi

  ATUAL=$(fstype_atual "$DST")

  if [ "$ATUAL" != "$FSTYPE" ]; then
    log "ERRO: $DST é '${ATUAL:-desconhecido}', esperado '$FSTYPE'."
    adicionar_ponto "$DST" "FAILED" "$FSTYPE" "${ATUAL:-desconhecido}" "tipo de sistema de arquivos inesperado"
    FALHAS=$((FALHAS + 1))
  elif ! populado "$DST"; then
    log "ERRO: $DST com menos de $MIN_ITENS itens."
    adicionar_ponto "$DST" "FAILED" "$FSTYPE" "$ATUAL" "menos de ${MIN_ITENS} itens — conteúdo suspeito"
    FALHAS=$((FALHAS + 1))
  else
    log "OK: $DST validado ($FSTYPE, conteúdo presente)."
    DF=$(timeout "$TIMEOUT" df -h --output=size,used,avail,pcent "$DST" 2>/dev/null | tail -1 | tr -s ' ')
    adicionar_ponto "$DST" "$STATUS" "$FSTYPE" "$ATUAL" "" "$DF"
  fi
done

# ---------- resultado ----------
if [ "$FALHAS" -ne 0 ]; then
  RESULTADO="FAILED"
  log "RESULTADO: FALHA. O backup não deve rodar."
elif [ "$REMONTADOS" -ne 0 ]; then
  RESULTADO="RECOVERED"
  log "RESULTADO: OK (com remontagem)."
else
  RESULTADO="OK"
  log "RESULTADO: OK."
fi

BOOT_ISO=""
BOOT_RECENTE_FLAG="false"
if BOOT=$(uptime -s 2>/dev/null) && [ -n "$BOOT" ]; then
  BOOT_ISO=$(date -u -d "$BOOT" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)
  SEG=$(( $(date +%s) - $(date -d "$BOOT" +%s 2>/dev/null || date +%s) ))
  [ "$SEG" -lt "$BOOT_RECENTE" ] && BOOT_RECENTE_FLAG="true"
fi

DURACAO=$(( $(date +%s) - INICIO ))

PAYLOAD=$(printf '{"host":"%s","startedAt":"%s","durationSeconds":%d,"result":"%s","bootAt":"%s","bootRecent":%s,"points":[%s]}' \
  "$(json_escape "$(hostname)")" "$INICIO_ISO" "$DURACAO" "$RESULTADO" "$BOOT_ISO" "$BOOT_RECENTE_FLAG" "$PONTOS_JSON")

# ---------- envio ao painel ----------
if [ -z "$PAINEL_TOKEN" ]; then
  log "AVISO: PAINEL_TOKEN não definido. Relatório não enviado."
else
  HTTP=$(curl -sS -m 20 -o /tmp/painel_resp.$$ -w '%{http_code}' \
    -X POST "${PAINEL_URL%/}/api/ingest/mounts/${PAINEL_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-raw "$PAYLOAD" 2>>"$LOG") || HTTP="000"

  if [ "$HTTP" = "202" ] || [ "$HTTP" = "200" ]; then
    log "Painel: relatório enviado."
  else
    log "ERRO: painel retornou HTTP $HTTP -> $(cat /tmp/painel_resp.$$ 2>/dev/null)"
  fi
  rm -f /tmp/painel_resp.$$
fi

# Código de saída preservado: permite encadear no cron
#   /opt/scripts/check-mounts.sh && duplicati-cli backup ...
[ "$FALHAS" -ne 0 ] && exit 1
exit 0
