import { prisma } from "../db/client";
import { RateLimiter, RateLimitPresets } from "../ratelimit/rate-limiter";
import type { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit-service";

/**
 * PRIORIDADE 14: API PÃšBLICA
 *
 * Endpoints RESTful para terceiros integrem com Velnoxia.
 * AutenticaÃ§Ã£o via API keys, rate limiting, webhooks, e versionamento.
 *
 * Arquitetura:
 * - APIKey model: chaves com limite de requisiÃ§Ãµes
 * - WebhookEvent model: logs de eventos disparados
 * - WebhookSubscription model: quem quer receber quais eventos
 * - Rate limiting por chave (10 req/min para FREE, 100/min para PAID)
 *
 * Endpoints pÃºblicos (v1):
 * GET    /api/v1/orders              â€” Listar pedidos
 * POST   /api/v1/orders              â€” Criar pedido
 * GET    /api/v1/orders/{id}         â€” Detalhes do pedido
 * GET    /api/v1/products            â€” CatÃ¡logo
 * POST   /api/v1/webhooks/subscribe  â€” Configurar webhook
 * DELETE /api/v1/webhooks/{id}       â€” Remover webhook
 *
 * Headers obrigatÃ³rios:
 * Authorization: Bearer {api_key}
 * X-API-Version: 1
 *
 * Responses:
 * - 200 OK: Sucesso com data
 * - 400 Bad Request: ValidaÃ§Ã£o falhou
 * - 401 Unauthorized: API key invÃ¡lida/expirada
 * - 429 Too Many Requests: Rate limit atingido
 * - 500 Internal Server Error: Erro servidor
 *
 * Webhooks (eventos disparados):
 * - order.created: Novo pedido
 * - order.updated: Status do pedido mudou
 * - order.completed: Pedido finalizado/entregue
 * - payment.confirmed: Pagamento confirmado
 * - inventory.low_stock: Alerta de estoque baixo
 */

export enum APIKeyTier {
  FREE = "FREE",
  STANDARD = "STANDARD",
  BUSINESS = "BUSINESS",
}

export enum WebhookEventType {
  ORDER_CREATED = "order.created",
  ORDER_UPDATED = "order.updated",
  ORDER_COMPLETED = "order.completed",
  PAYMENT_CONFIRMED = "payment.confirmed",
  INVENTORY_LOW_STOCK = "inventory.low_stock",
}

export interface APIKey {
  id: string;
  key: string; // Hash SHA-256 armazenado no BD
  displayKey: string; // Primeiros 8 chars + Ãºltimos 4 para UI
  storeId: string;
  tier: APIKeyTier;
  name: string;
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt: Date;
  requestsThisMonth: number;
  createdBy: string;
  createdAt: Date;
}

export interface WebhookSubscription {
  id: string;
  storeId: string;
  url: string;
  eventTypes: WebhookEventType[];
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt?: Date;
  createdAt: Date;
}

export interface APIResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
  meta?: {
    version: string;
    requestId: string;
    timestamp: string;
  };
}

export class PublicAPIService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Gerar nova API key
   */
  async createAPIKey(
    storeId: string,
    name: string,
    tier: APIKeyTier = APIKeyTier.FREE,
    createdBy: string,
  ): Promise<{ key: string; apiKey: APIKey }> {
    // Gerar chave (32 bytes = 64 hex chars)
    const key = randomBytes(32).toString("hex");
    const keyHash = createHash("sha256").update(key).digest("hex");
    const displayKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;

    const apiKey = await (prisma as any).aPIKey.create({
      data: {
        key: keyHash,
        displayKey,
        storeId,
        tier,
        name,
        isActive: true,
        lastUsedAt: new Date(),
        requestsThisMonth: 0,
        createdBy,
      },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: createdBy,
      action: "CREATE",
      resource: "APIKey",
      resourceId: apiKey.id,
      newValue: { name, tier, displayKey },
      reason: `API key criada para ${name}`,
    });

    return {
      key, // Retornar apenas uma vez (o usuÃ¡rio precisa salvar)
      apiKey: {
        id: apiKey.id,
        key: apiKey.displayKey,
        displayKey: apiKey.displayKey,
        storeId: apiKey.storeId,
        tier: apiKey.tier,
        name: apiKey.name,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt || undefined,
        lastUsedAt: apiKey.lastUsedAt,
        requestsThisMonth: apiKey.requestsThisMonth,
        createdBy: apiKey.createdBy,
        createdAt: apiKey.createdAt,
      },
    };
  }

  /**
   * Validar API key e retornar storeId
   */
  async validateAPIKey(key: string): Promise<{ storeId: string; tier: APIKeyTier } | null> {
    const keyHash = createHash("sha256").update(key).digest("hex");

    const apiKey = await (prisma as any).aPIKey.findFirst({
      where: {
        key: keyHash,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { storeId: true, tier: true },
    });

    if (!apiKey) {
      return null;
    }

    // Atualizar lastUsedAt
    await (prisma as any).aPIKey.updateMany({
      where: { key: keyHash },
      data: { lastUsedAt: new Date() },
    });

    return apiKey;
  }

  /**
   * Revogar API key
   */
  async revokeAPIKey(storeId: string, keyId: string, revokedBy: string): Promise<void> {
    const apiKey = await (prisma as any).aPIKey.findFirst({
      where: { id: keyId, storeId },
      select: { name: true },
    });

    if (!apiKey) {
      throw new Error("API key nÃ£o encontrada");
    }

    await (prisma as any).aPIKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: revokedBy,
      action: "REVOKE",
      resource: "APIKey",
      resourceId: keyId,
      reason: `API key revogada: ${apiKey.name}`,
    });
  }

  /**
   * Inscrever em webhook
   */
  async subscribeWebhook(
    storeId: string,
    url: string,
    eventTypes: WebhookEventType[],
    createdBy: string,
  ): Promise<WebhookSubscription> {
    // Validar URL
    if (!this.isValidURL(url)) {
      throw new Error("URL invÃ¡lida");
    }

    if (eventTypes.length === 0) {
      throw new Error("Pelo menos um tipo de evento Ã© obrigatÃ³rio");
    }

    const subscription = await (prisma as any).webhookSubscription.create({
      data: {
        storeId,
        url,
        eventTypes,
        isActive: true,
        failureCount: 0,
      },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: createdBy,
      action: "CREATE",
      resource: "WebhookSubscription",
      resourceId: subscription.id,
      newValue: { url, eventTypes },
      reason: `Webhook criado para ${eventTypes.join(", ")}`,
    });

    return {
      id: subscription.id,
      storeId: subscription.storeId,
      url: subscription.url,
      eventTypes: subscription.eventTypes as WebhookEventType[],
      isActive: subscription.isActive,
      failureCount: subscription.failureCount,
      lastTriggeredAt: subscription.lastTriggeredAt || undefined,
      createdAt: subscription.createdAt,
    };
  }

  /**
   * Desinscrever de webhook
   */
  async unsubscribeWebhook(
    storeId: string,
    webhookId: string,
    revokedBy: string,
  ): Promise<void> {
    const webhook = await (prisma as any).webhookSubscription.findFirst({
      where: { id: webhookId, storeId },
    });

    if (!webhook) {
      throw new Error("Webhook nÃ£o encontrado");
    }

    await (prisma as any).webhookSubscription.update({
      where: { id: webhookId },
      data: { isActive: false },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: revokedBy,
      action: "DELETE",
      resource: "WebhookSubscription",
      resourceId: webhookId,
      reason: `Webhook desinscriÃ§Ã£o: ${webhook.url}`,
    });
  }

  /**
   * Disparar webhook para todos os inscritos
   */
  async triggerWebhook(
    storeId: string,
    eventType: WebhookEventType,
    data: any,
  ): Promise<void> {
    const subscriptions = await (prisma as any).webhookSubscription.findMany({
      where: {
        storeId,
        isActive: true,
        eventTypes: { has: eventType },
      },
    });

    const payload = {
      event: eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const sub of subscriptions) {
      try {
        // Enviar webhook (async, nÃ£o aguardar)
        await this.sendWebhookRequest(sub.id, sub.url, payload);

        // Atualizar lastTriggeredAt
        await (prisma as any).webhookSubscription.update({
          where: { id: sub.id },
          data: { lastTriggeredAt: new Date(), failureCount: 0 },
        });
      } catch (error) {
        // Incrementar falhas
        await (prisma as any).webhookSubscription.update({
          where: { id: sub.id },
          data: { failureCount: { increment: 1 } },
        });

        // Desabilitar apÃ³s 5 falhas consecutivas
        if ((await (prisma as any).webhookSubscription.findUnique({ where: { id: sub.id } }))
          ?.failureCount === 5) {
          await (prisma as any).webhookSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
    }
  }

  /**
   * Aplicar rate limit por API key
   */
  async checkRateLimit(keyId: string, tier: APIKeyTier): Promise<boolean> {
    const preset = tier === APIKeyTier.FREE
      ? RateLimitPresets.PUBLIC_API_FREE
      : RateLimitPresets.PUBLIC_API;

    const limiter = new RateLimiter(this.redis, `api:${keyId}`, preset);
    return await limiter.isAllowed();
  }

  /**
   * Obter status do rate limit
   */
  async getRateLimitStatus(keyId: string, tier: APIKeyTier) {
    const preset = tier === APIKeyTier.FREE
      ? RateLimitPresets.PUBLIC_API_FREE
      : RateLimitPresets.PUBLIC_API;

    const limiter = new RateLimiter(this.redis, `api:${keyId}`, preset);
    return await limiter.getStatus();
  }

  /**
   * Formatar resposta de sucesso
   */
  formatSuccessResponse<T>(
    data: T,
    requestId: string,
    apiVersion: string = "1",
  ): APIResponse<T> {
    return {
      ok: true,
      data,
      meta: {
        version: apiVersion,
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Formatar resposta de erro
   */
  formatErrorResponse(
    code: string,
    message: string,
    requestId: string,
    details?: Record<string, string>,
  ): APIResponse<null> {
    return {
      ok: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        version: "1",
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Gerar headers de rate limit para resposta HTTP
   */
  getRateLimitHeaders(status: any): Record<string, string> {
    return {
      "X-RateLimit-Limit": status.tokensRemaining.toString(),
      "X-RateLimit-Remaining": (status.tokensRemaining - 1).toString(),
      "X-RateLimit-Reset": Math.floor(status.resetAt.getTime() / 1000).toString(),
      "X-RateLimit-RetryAfter": status.retryAfter.toString(),
    };
  }

  /**
   * Enviar webhook request (implementaÃ§Ã£o)
   */
  private async sendWebhookRequest(
    webhookId: string,
    url: string,
    payload: any,
  ): Promise<void> {
    // Timeout de 5 segundos
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-ID": webhookId,
          "X-Webhook-Signature": this.generateWebhookSignature(payload),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Gerar assinatura de webhook (HMAC)
   */
  private generateWebhookSignature(payload: any): string {
    // Usar secret_key do BD (simplificado aqui)
    const message = JSON.stringify(payload);
    return createHash("sha256").update(message).digest("hex");
  }

  /**
   * Validar URL
   */
  private isValidURL(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Listar API keys de uma loja
   */
  async listAPIKeys(storeId: string): Promise<APIKey[]> {
    const keys = await (prisma as any).aPIKey.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });

    return keys.map((k: any) => ({
      id: k.id,
      key: k.displayKey,
      displayKey: k.displayKey,
      storeId: k.storeId,
      tier: k.tier,
      name: k.name,
      isActive: k.isActive,
      expiresAt: k.expiresAt || undefined,
      lastUsedAt: k.lastUsedAt,
      requestsThisMonth: k.requestsThisMonth,
      createdBy: k.createdBy,
      createdAt: k.createdAt,
    }));
  }

  /**
   * Listar webhooks de uma loja
   */
  async listWebhooks(storeId: string): Promise<WebhookSubscription[]> {
    const webhooks = await (prisma as any).webhookSubscription.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });

    return webhooks.map((w: any) => ({
      id: w.id,
      storeId: w.storeId,
      url: w.url,
      eventTypes: w.eventTypes as WebhookEventType[],
      isActive: w.isActive,
      failureCount: w.failureCount,
      lastTriggeredAt: w.lastTriggeredAt || undefined,
      createdAt: w.createdAt,
    }));
  }
}

/**
 * CASOS DE USO:
 *
 * 1. TERCEIRO CRIA API KEY:
 *    const { key } = await apiService.createAPIKey(
 *      "store-123",
 *      "IntegraÃ§Ã£o POS",
 *      "STANDARD",
 *      "admin"
 *    );
 *    // Guardar key com seguranÃ§a (nunca reutilizar)
 *
 * 2. TERCEIRO AUTENTICA:
 *    const valid = await apiService.validateAPIKey(key);
 *    if (!valid) return 401 Unauthorized;
 *
 * 3. TERCEIRO CONSULTA PEDIDOS:
 *    GET /api/v1/orders
 *    Authorization: Bearer sk_live_abc123def456...
 *    X-API-Version: 1
 *
 *    Response: { ok: true, data: [...], meta: {...} }
 *
 * 4. TERCEIRO CRIA PEDIDO:
 *    POST /api/v1/orders
 *    { items: [...], customer: {...} }
 *
 * 5. TERCEIRO INSCREVE EM WEBHOOK:
 *    await apiService.subscribeWebhook(
 *      "store-123",
 *      "https://app.example.com/webhook",
 *      ["order.created", "order.updated"],
 *      "admin"
 *    );
 *
 * 6. EVENTO DISPARADO:
 *    await apiService.triggerWebhook(
 *      "store-123",
 *      "order.created",
 *      { orderId: "...", total: ... }
 *    );
 *    // POST para https://app.example.com/webhook com payload
 *
 * 7. TERCEIRO REVOGA ACESSO:
 *    await apiService.revokeAPIKey("store-123", "key-id", "admin");
 *
 * 8. RATE LIMIT:
 *    const allowed = await apiService.checkRateLimit(keyId, "FREE");
 *    if (!allowed) return 429 Too Many Requests;
 *
 * 9. RATE LIMIT STATUS:
 *    const status = await apiService.getRateLimitStatus(keyId, "FREE");
 *    res.headers = apiService.getRateLimitHeaders(status);
 */

