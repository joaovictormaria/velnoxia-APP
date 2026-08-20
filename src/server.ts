import "./lib/error-capture";

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
function comCabecalhosDeSeguranca(response: Response): Response {
  const h = response.headers;
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
  return response;
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
