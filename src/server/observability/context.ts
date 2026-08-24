import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * PRIORIDADE 8: OBSERVABILITY & CONTEXT PROPAGATION
 *
 * Rastreia requisições através do sistema com:
 * - requestId: identificador único desta requisição (para logs, debugging)
 * - correlationId: agrupa múltiplas requisições relacionadas (fluxo do usuário)
 * - traceId: para rastreamento distribuído (Open Telemetry compatible)
 * - spanId: para rastreamento de operações individuais
 * - userId: quem está fazendo a requisição (auditoria)
 * - storeId: qual loja está sendo acessada (multi-tenant)
 *
 * Uso:
 * // Propagar através de async operations
 * const context = getContext();
 * console.log(`[${context.requestId}] User ${context.userId} accessing store ${context.storeId}`);
 *
 * // Logs estruturados
 * logger.info("order.created", {
 *   requestId: context.requestId,
 *   storeId: context.storeId,
 *   orderId: order.id,
 *   amount: order.total,
 * });
 *
 * // Integração com AuditLog
 * await auditService.log({
 *   storeId: context.storeId,
 *   userId: context.userId,
 *   correlationId: context.correlationId, // Rastrear fluxo completo
 *   ...
 * });
 */

export interface ObservabilityContext {
  // Identificadores únicos
  requestId: string; // Gerado por requisição (UUID-like)
  correlationId: string; // Agrupa requisições relacionadas (pode vir do client)
  traceId: string; // Para rastreamento distribuído (W3C Trace Context)
  spanId: string; // Operação individual dentro da trace

  // Contexto da requisição
  userId?: string; // Admin logado
  userEmail?: string; // Para auditoria
  storeId?: string; // Qual loja está sendo acessada
  ipAddress?: string; // Cliente que fez a requisição

  // Metadata
  startTime: Date; // Quando a requisição começou
  method?: string; // GET, POST, etc
  path?: string; // /api/products, /checkout, etc
  userAgent?: string; // Browser/client que fez requisição
}

const asyncLocalStorage = new AsyncLocalStorage<ObservabilityContext>();

/**
 * Gerar um novo requestId (12 caracteres hex)
 */
function generateRequestId(): string {
  return randomBytes(6).toString("hex");
}

/**
 * Inicializar contexto para uma nova requisição
 */
export function initializeContext(input: {
  correlationId?: string;
  userId?: string;
  userEmail?: string;
  storeId?: string;
  ipAddress?: string;
  method?: string;
  path?: string;
  userAgent?: string;
}): ObservabilityContext {
  const context: ObservabilityContext = {
    requestId: generateRequestId(),
    correlationId: input.correlationId || generateRequestId(),
    traceId: `${generateRequestId()}-${generateRequestId()}`, // W3C format
    spanId: generateRequestId(),
    userId: input.userId,
    userEmail: input.userEmail,
    storeId: input.storeId,
    ipAddress: input.ipAddress,
    startTime: new Date(),
    method: input.method,
    path: input.path,
    userAgent: input.userAgent,
  };

  return context;
}

/**
 * Armazenar contexto no AsyncLocalStorage (propaga através de async/await)
 */
export function setContext(context: ObservabilityContext): void {
  asyncLocalStorage.enterWith(context);
}

/**
 * Obter contexto atual
 */
export function getContext(): ObservabilityContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Obter contexto ou lançar erro se não existe
 */
export function getContextOrThrow(): ObservabilityContext {
  const context = asyncLocalStorage.getStore();
  if (!context) {
    throw new Error("ObservabilityContext not initialized");
  }
  return context;
}

/**
 * Executar callback dentro de um contexto (redefine contexto após)
 */
export function withContext<T>(
  context: ObservabilityContext,
  callback: () => Promise<T>,
): Promise<T> {
  return asyncLocalStorage.run(context, () => callback());
}

/**
 * Atualizar campos do contexto (ex: adicionar userId após login)
 */
export function updateContext(updates: Partial<ObservabilityContext>): void {
  const current = getContext();
  if (!current) {
    throw new Error("No context to update");
  }

  const updated = { ...current, ...updates };
  setContext(updated);
}

/**
 * Gerar um novo spanId para operações aninhadas
 * Útil para rastreamento distribuído
 */
export function createChildSpan(parentContext: ObservabilityContext): ObservabilityContext {
  return {
    ...parentContext,
    spanId: generateRequestId(),
  };
}

/**
 * Formatar contexto para logs (JSON estruturado)
 */
export function formatContextForLogs(context: ObservabilityContext): object {
  return {
    requestId: context.requestId,
    correlationId: context.correlationId,
    traceId: context.traceId,
    spanId: context.spanId,
    userId: context.userId,
    storeId: context.storeId,
    duration: new Date().getTime() - context.startTime.getTime(),
  };
}

/**
 * Headers HTTP para propagação de contexto (W3C Trace Context)
 */
export function getContextHeaders(context: ObservabilityContext): Record<string, string> {
  return {
    "traceparent": `00-${context.traceId}-${context.spanId}-01`,
    "x-request-id": context.requestId,
    "x-correlation-id": context.correlationId,
    "x-user-id": context.userId || "anonymous",
    "x-store-id": context.storeId || "unknown",
  };
}

/**
 * Extrair contexto de headers HTTP (para propagação entre serviços)
 */
export function extractContextFromHeaders(headers: Record<string, string>): Partial<ObservabilityContext> {
  const traceparent = headers["traceparent"] || headers["trace-parent"];
  let traceId = "";
  let spanId = "";

  if (traceparent) {
    // Format: 00-{traceId}-{spanId}-01
    const parts = traceparent.split("-");
    if (parts.length >= 3) {
      traceId = parts[1];
      spanId = parts[2];
    }
  }

  return {
    requestId: headers["x-request-id"],
    correlationId: headers["x-correlation-id"],
    traceId: traceId || headers["x-trace-id"],
    spanId: spanId || headers["x-span-id"],
    userId: headers["x-user-id"],
    storeId: headers["x-store-id"],
  };
}

/**
 * Casos de uso:
 *
 * 1. MIDDLEWARE HTTP:
 *    export function observabilityMiddleware(req: Request, res: Response, next: NextFunction) {
 *      const context = initializeContext({
 *        method: req.method,
 *        path: req.path,
 *        ipAddress: req.ip,
 *        userAgent: req.get("user-agent"),
 *        correlationId: req.get("x-correlation-id"),
 *      });
 *      setContext(context);
 *
 *      const start = Date.now();
 *      res.on("finish", () => {
 *        logger.info("http.request", {
 *          ...formatContextForLogs(context),
 *          statusCode: res.statusCode,
 *        });
 *      });
 *      next();
 *    }
 *
 * 2. SERVER FUNCTION:
 *    export const createOrderFn = createServerFn({...})
 *      .handler(async ({ data }) => {
 *        const context = getContextOrThrow();
 *        logger.info("order.creating", { ...formatContextForLogs(context) });
 *
 *        const order = await orderService.create(data);
 *
 *        logger.info("order.created", {
 *          ...formatContextForLogs(context),
 *          orderId: order.id,
 *        });
 *
 *        return order;
 *      });
 *
 * 3. AUDITORIA INTEGRADA:
 *    await auditService.log({
 *      storeId: context.storeId,
 *      userId: context.userId,
 *      action: "CREATE",
 *      resource: "Order",
 *      correlationId: context.correlationId, // Agrupa fluxo todo
 *      traceId: context.traceId, // Para debugging distribuído
 *    });
 *
 * 4. PROPAGAÇÃO ENTRE SERVIÇOS:
 *    // Serviço A
 *    const context = getContext();
 *    const headers = getContextHeaders(context);
 *
 *    // Chamada para Serviço B
 *    const response = await fetch("http://service-b/api/webhook", {
 *      headers: {
 *        ...headers, // Propagar contexto
 *      }
 *    });
 *
 *    // Serviço B
 *    const incomingContext = extractContextFromHeaders(req.headers);
 *    const context = initializeContext(incomingContext);
 *    setContext(context); // Mesmo requestId/correlationId
 */
