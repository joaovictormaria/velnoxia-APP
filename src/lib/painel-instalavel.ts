/**
 * Registra o service worker que torna o painel instalável como aplicativo.
 *
 * O escopo é `/admin` de propósito: o mesmo servidor entrega os sites das
 * lojas, e um service worker solto na raiz passaria a interceptar a navegação
 * dos clientes finais também.
 */
export function registrarPainelInstalavel(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Em desenvolvimento o registro só atrapalha: sobrevive a troca de branch e
  // a reinícios do vite, e aí a tela que aparece não é a do código atual.
  if (import.meta.env.DEV) return;

  navigator.serviceWorker.register("/painel-sw.js", { scope: "/admin" }).catch((erro) => {
    // Falhar aqui não impede o painel de funcionar — só deixa de oferecer a
    // instalação. Não vale derrubar a tela por causa disso.
    console.warn("Não foi possível preparar a instalação do painel:", erro);
  });
}
