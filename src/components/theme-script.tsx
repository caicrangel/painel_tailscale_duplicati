/**
 * Resolve o tema ANTES da primeira pintura, evitando o flash de tela escura em
 * quem escolheu claro (e vice-versa).
 *
 * localStorage guarda a PREFERÊNCIA ("system" | "light" | "dark");
 * o atributo data-theme no <html> guarda o tema EFETIVO ("light" | "dark").
 * Com isso o CSS só precisa conhecer [data-theme="light"].
 */
const script = `
(function () {
  try {
    var pref = localStorage.getItem("painel.tema") || "system";
    var escuro =
      pref === "dark" ||
      (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
