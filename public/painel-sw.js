/**
 * Service worker do painel instalado.
 *
 * Ele existe por dois motivos, e nenhum deles é cache: o navegador só oferece
 * "instalar aplicativo" quando há um service worker com tratador de fetch, e
 * uma janela sem barra de endereço precisa dizer alguma coisa quando a internet
 * cai — senão o lojista vê a tela de erro do Chrome dentro do que ele acha que
 * é um programa.
 *
 * Nada aqui é guardado em cache, de propósito. O painel é servido pelo
 * servidor e muda a cada deploy; um cache de arquivos do app faria a loja
 * continuar rodando uma versão antiga depois que a nova subiu, e esse tipo de
 * bug é invisível até alguém reclamar que "sumiu o botão".
 */

const OFFLINE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão</title>
<style>
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; background: #0A0A0A; color: #fff;
    font-family: Inter, system-ui, -apple-system, Arial, sans-serif; padding: 24px;
  }
  .caixa { max-width: 380px; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #a3a3a3; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
  button {
    background: #E11D2E; color: #fff; border: 0; border-radius: 10px;
    padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer;
  }
</style>
</head>
<body>
  <div class="caixa">
    <h1>Sem conexão</h1>
    <p>
      O painel precisa de internet para receber os pedidos. Confira o wi-fi ou o
      cabo de rede e tente de novo.
    </p>
    <button onclick="location.reload()">Tentar de novo</button>
  </div>
</body>
</html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (evento) => {
  // Só a navegação é interceptada. Deixar imagem, API e script passarem direto
  // mantém o comportamento idêntico ao do navegador comum.
  if (evento.request.mode !== "navigate") return;

  evento.respondWith(
    fetch(evento.request).catch(
      () =>
        new Response(OFFLINE, {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ),
  );
});
