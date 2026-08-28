import "./lib/error-capture";

/*
 * A varredura de reservas expiradas sobe junto com o servidor.
 *
 * Aqui, e nao num modulo qualquer, porque este arquivo e avaliado uma vez por
 * processo: e o unico lugar onde "ligar no boot" significa exatamente isso.
 * A funcao tem guarda propria em `globalThis`, entao um reimport do HMR nao
 * cria um segundo intervalo.
 */
import { iniciarExpiracaoDeReservas } from "./server/services/expiracao-de-reservas";

iniciarExpiracaoDeReservas();

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Cabeçalhos de segurança em toda resposta.
 *
 * São a defesa que não depende de nenhuma tela lembrar de aplicá-la: o
 * navegador passa a recusar embutir o site num iframe (clickjacking), a adivinhar
 * o tipo de um arquivo enviado, e a vazar a URL completa como referer para
 * terceiros. Fora do enum de segurança porque valem para HTML e para JSON igual.
 *
 * Sem CSP por ora: uma política restritiva quebra o carregamento de scripts e
 * estilos se estiver um passo fora do que o bundler gera, e acertá-la pede
 * testar cada tela. Fica anotado como próximo passo, não escondido como pronto.
 */
function aplicarCabecalhos(h: Headers): void {
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Nega por padrão recursos que este site não usa; abrir só o que precisar.
  h.set("Permissions-Policy", "camera=(), microphone=(), payment=(), geolocation=(self)");
  /*
   * HSTS só quando a app roda no Railway, onde o edge é sempre HTTPS. Mandá-lo
   * em desenvolvimento (http://localhost) faria o navegador travar o domínio
   * em https e quebrar o dev — por isso não basta checar NODE_ENV, que também
   * é "production" num build rodado na máquina.
   */
  if (process.env.RAILWAY_ENVIRONMENT_NAME) {
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function comCabecalhosDeSeguranca(response: Response): Response {
  /*
   * Caminho normal: os headers são mutáveis, então se escreve neles direto e a
   * resposta segue como está — sem reconstruir o stream do corpo do SSR.
   *
   * A exceção é o que vem de `Response.redirect()`, cujos headers nascem
   * imutáveis por especificação: escrever neles estoura "TypeError: immutable",
   * o erro sobe até o catch do fetch, e o visitante recebe a página de erro 500
   * no lugar do redirecionamento.
   *
   * Quem constrói uma dessas aqui é o próprio TanStack Start, ao normalizar uma
   * URL protocolo-relativa: um caminho começando com "//" vira um 308. Não são
   * os redirecionamentos das rotas — o `redirect()` do router monta uma resposta
   * comum, de headers mutáveis, que passa pelo caminho de cima sem tocar neste.
   * Vale saber disso antes de concluir que a guarda não serve para nada: "/" ->
   * "/admin/login" não a exercita; `curl --path-as-is 'http://host//x'` sim.
   */
  try {
    aplicarCabecalhos(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    aplicarCabecalhos(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return comCabecalhosDeSeguranca(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return comCabecalhosDeSeguranca(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
