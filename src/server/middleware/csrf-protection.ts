/**
 * CSRF PROTECTION MIDDLEWARE
 *
 * Previne Cross-Site Request Forgery attacks usando double-submit cookie pattern:
 * 1. CSRF token gerado no GET / enviado no cookie + formulário
 * 2. No POST/PUT/DELETE, validar se token do formulário == token do cookie
 *
 * Já temos SameSite=Strict nos cookies (visite auth/session.ts),
 * mas CSRF token adiciona proteção extra para formulários.
 *
 * TODO: Integrar este middleware na pipeline H3 do TanStack React Start
 * Adicionar em src/server.ts:
 *   import { csrfProtectionWithExemptions } from "./middleware/csrf-protection";
 *   export const serverMiddleware = [csrfProtectionWithExemptions];
 */

import { createHash, randomBytes } from "node:crypto";
import { defineEventHandler, setHeader, getCookie, setCookie, createError } from "h3";

const CSRF_TOKEN_LENGTH = 32; // 256 bits
const CSRF_TOKEN_NAME = "csrf-token";
const CSRF_COOKIE_NAME = "__csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Gerar CSRF token
 */
export function generateCSRFToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Validar CSRF token
 * Compara token do header com token do cookie
 */
export function validateCSRFToken(headerToken: string, cookieToken: string): boolean {
  if (!headerToken || !cookieToken) {
    return false;
  }

  // Timing-safe comparison
  const headerBuffer = Buffer.from(headerToken);
  const cookieBuffer = Buffer.from(cookieToken);

  if (headerBuffer.length !== cookieBuffer.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < headerBuffer.length; i++) {
    result |= headerBuffer[i] ^ cookieBuffer[i];
  }

  return result === 0;
}

/**
 * Middleware CSRF para H3 (usado em Nitro)
 *
 * Uso:
 * export default defineEventHandler(csrfProtection)
 */
export const csrfProtection = defineEventHandler(async (event) => {
  const method = event.node.req.method || "GET";

  // GET: Gerar token se não existir
  if (method === "GET") {
    const existingToken = getCookie(event, CSRF_COOKIE_NAME);
    if (!existingToken) {
      const newToken = generateCSRFToken();
      setCookie(event, CSRF_COOKIE_NAME, newToken, {
        httpOnly: false, // Precisa estar acessível ao JS para enviar no header
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 24 horas
      });
      // Também enviar no response para cliente usar
      setHeader(event, CSRF_TOKEN_NAME, newToken);
    }
    return;
  }

  // POST/PUT/DELETE/PATCH: Validar token
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const cookieToken = getCookie(event, CSRF_COOKIE_NAME);
    const headerToken = event.node.req.headers[CSRF_HEADER_NAME] as string;

    if (!validateCSRFToken(headerToken, cookieToken)) {
      throw createError({
        statusCode: 403,
        statusMessage: "CSRF token validation failed",
        data: {
          message: "Invalid CSRF token",
          code: "CSRF_VALIDATION_FAILED",
        },
      });
    }
  }
});

/**
 * Exemptions para CSRF (webhooks, APIs públicas, etc)
 * Estas rotas não precisam de CSRF (usam auth diferente)
 */
export const CSRF_EXEMPT_PATHS = [
  "/api/webhook/stripe",
  "/api/webhook/", // Todos os webhooks
  "/api/public/", // Public API (usa API keys)
  "/auth/login", // Login usa password, não formulário
];

/**
 * Middleware wrapper que exime certos paths
 */
export const csrfProtectionWithExemptions = defineEventHandler(
  async (event) => {
    const path = event.node.req.url || "";

    // Check se path está eximo
    const isExempt = CSRF_EXEMPT_PATHS.some((exemptPath) =>
      path.startsWith(exemptPath)
    );

    if (!isExempt) {
      return csrfProtection(event);
    }
  }
);
