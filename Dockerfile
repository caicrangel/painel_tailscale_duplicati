# ─── deps ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# ─── build (app Next) ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ─── runner do app ────────────────────────────────────────────────────────────
FROM node:22-alpine AS app
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl tini && addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# prisma CLI + schema para rodar migrate deploy no start
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma
COPY docker/entrypoint-app.sh /usr/local/bin/entrypoint-app.sh
RUN chmod +x /usr/local/bin/entrypoint-app.sh
USER nextjs
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint-app.sh"]

# ─── runner do worker ─────────────────────────────────────────────────────────
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl tini
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
COPY docker/entrypoint-worker.sh /usr/local/bin/entrypoint-worker.sh
RUN chmod +x /usr/local/bin/entrypoint-worker.sh
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint-worker.sh"]
