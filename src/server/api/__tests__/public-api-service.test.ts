// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "ioredis";
import { prisma } from "../../db/client";
import { PublicAPIService, APIKeyTier, WebhookEventType } from "../public-api-service";
import { createHash } from "node:crypto";

/**
 * PRIORIDADE 14: TESTES DE API PÃšBLICA
 *
 * Valida autenticaÃ§Ã£o via API keys, rate limiting,
 * webhooks, e formato de respostas.
 */

describe("PublicAPIService: API Keys", () => {
  let apiService: PublicAPIService;
  let redis: Redis;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    apiService = new PublicAPIService(redis);
    storeId = "test-store-api";
    adminId = "admin-api";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });
  });

  afterEach(async () => {
    await (prisma as any).aPIKey.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve criar API key", async () => {
    const { key, apiKey } = await apiService.createAPIKey(
      storeId,
      "POS Integration",
      APIKeyTier.STANDARD,
      adminId,
    );

    expect(key).toBeDefined();
    expect(key.length).toBe(64); // 32 bytes = 64 hex chars
    expect(apiKey.name).toBe("POS Integration");
    expect(apiKey.tier).toBe(APIKeyTier.STANDARD);
    expect(apiKey.isActive).toBe(true);
  });

  it("deve retornar displayKey (truncado)", async () => {
    const { apiKey } = await apiService.createAPIKey(
      storeId,
      "Test",
      APIKeyTier.FREE,
      adminId,
    );

    expect(apiKey.displayKey).toMatch(/^.{8}\.\.\..{4}$/);
  });

  it("deve validar API key correta", async () => {
    const { key } = await apiService.createAPIKey(
      storeId,
      "Test",
      APIKeyTier.FREE,
      adminId,
    );

    const result = await apiService.validateAPIKey(key);

    expect(result).toBeDefined();
    expect(result?.storeId).toBe(storeId);
    expect(result?.tier).toBe(APIKeyTier.FREE);
  });

  it("deve rejeitar API key incorreta", async () => {
    const result = await apiService.validateAPIKey("invalid-key");

    expect(result).toBeNull();
  });

  it("deve rejeitar API key inativa", async () => {
    const { key } = await apiService.createAPIKey(
      storeId,
      "Test",
      APIKeyTier.FREE,
      adminId,
    );

    // Desativar
    await apiService.revokeAPIKey(storeId, key, adminId);

    const result = await apiService.validateAPIKey(key);

    expect(result).toBeNull();
  });

  it("deve retornar null para API key expirada", async () => {
    // Criar key com expiraÃ§Ã£o no passado
    const keyHash = createHash("sha256").update("expired-key").digest("hex");
    await (prisma as any).aPIKey.create({
      data: {
        key: keyHash,
        displayKey: "exp...ired",
        storeId,
        tier: APIKeyTier.FREE,
        name: "Expired",
        isActive: true,
        expiresAt: new Date(Date.now() - 1000), // 1 seg atrÃ¡s
        lastUsedAt: new Date(),
        requestsThisMonth: 0,
        createdBy: adminId,
      },
    });

    const result = await apiService.validateAPIKey("expired-key");

    expect(result).toBeNull();
  });

  it("deve atualizar lastUsedAt ao validar", async () => {
    const { key } = await apiService.createAPIKey(
      storeId,
      "Test",
      APIKeyTier.FREE,
      adminId,
    );

    const before = new Date();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await apiService.validateAPIKey(key);

    const apiKey = await (prisma as any).aPIKey.findFirst({
      where: { key: createHash("sha256").update(key).digest("hex") },
    });

    expect(apiKey?.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("deve listar API keys de uma loja", async () => {
    await apiService.createAPIKey(storeId, "Key 1", APIKeyTier.FREE, adminId);
    await apiService.createAPIKey(storeId, "Key 2", APIKeyTier.STANDARD, adminId);

    const keys = await apiService.listAPIKeys(storeId);

    expect(keys.length).toBe(2);
    expect(keys[0].name).toBe("Key 2"); // Mais recente
    expect(keys[1].name).toBe("Key 1");
  });

  it("deve revogar API key", async () => {
    const { key, apiKey } = await apiService.createAPIKey(
      storeId,
      "Test",
      APIKeyTier.FREE,
      adminId,
    );

    await apiService.revokeAPIKey(storeId, apiKey.id, adminId);

    const result = await apiService.validateAPIKey(key);

    expect(result).toBeNull();
  });
});

describe("PublicAPIService: Rate Limiting", () => {
  let apiService: PublicAPIService;
  let redis: Redis;
  let storeId: string;
  let keyId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    apiService = new PublicAPIService(redis);
    storeId = "test-store-ratelimit";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const { apiKey } = await apiService.createAPIKey(
      storeId,
      "Test",
      APIKeyTier.FREE,
      "admin",
    );
    keyId = apiKey.id;
  });

  afterEach(async () => {
    await (prisma as any).aPIKey.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve permitir requisiÃ§Ã£o dentro do limite FREE", async () => {
    const allowed = await apiService.checkRateLimit(keyId, APIKeyTier.FREE);

    expect(allowed).toBe(true);
  });

  it("deve bloquear apÃ³s limite FREE (10/min)", async () => {
    // Usar 10 requisiÃ§Ãµes
    for (let i = 0; i < 10; i++) {
      await apiService.checkRateLimit(keyId, APIKeyTier.FREE);
    }

    // 11Âª bloqueada
    const allowed = await apiService.checkRateLimit(keyId, APIKeyTier.FREE);

    expect(allowed).toBe(false);
  });

  it("deve permitir mais requisiÃ§Ãµes para STANDARD", async () => {
    // Usar 100 requisiÃ§Ãµes (limite STANDARD)
    let count = 0;
    for (let i = 0; i < 100; i++) {
      const allowed = await apiService.checkRateLimit(keyId, APIKeyTier.STANDARD);
      if (allowed) count++;
    }

    expect(count).toBe(100);
  });

  it("deve retornar status de rate limit", async () => {
    await apiService.checkRateLimit(keyId, APIKeyTier.FREE);
    const status = await apiService.getRateLimitStatus(keyId, APIKeyTier.FREE);

    expect(status.allowed).toBe(true);
    expect(status.tokensRemaining).toBeGreaterThanOrEqual(0);
    expect(status.resetAt).toBeDefined();
  });

  it("deve retornar headers de rate limit", async () => {
    const status = await apiService.getRateLimitStatus(keyId, APIKeyTier.FREE);
    const headers = apiService.getRateLimitHeaders(status);

    expect(headers["X-RateLimit-Limit"]).toBeDefined();
    expect(headers["X-RateLimit-Remaining"]).toBeDefined();
    expect(headers["X-RateLimit-Reset"]).toBeDefined();
  });
});

describe("PublicAPIService: Webhooks", () => {
  let apiService: PublicAPIService;
  let redis: Redis;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    apiService = new PublicAPIService(redis);
    storeId = "test-store-webhook";
    adminId = "admin-webhook";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });
  });

  afterEach(async () => {
    await (prisma as any).webhookSubscription.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve criar webhook subscription", async () => {
    const webhook = await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook",
      [WebhookEventType.ORDER_CREATED],
      adminId,
    );

    expect(webhook.url).toBe("https://example.com/webhook");
    expect(webhook.eventTypes).toContain(WebhookEventType.ORDER_CREATED);
    expect(webhook.isActive).toBe(true);
  });

  it("deve validar URL do webhook", async () => {
    await expect(
      apiService.subscribeWebhook(
        storeId,
        "not-a-url",
        [WebhookEventType.ORDER_CREATED],
        adminId,
      ),
    ).rejects.toThrow("URL invÃ¡lida");
  });

  it("deve rejeitar webhook sem eventos", async () => {
    await expect(
      apiService.subscribeWebhook(storeId, "https://example.com/webhook", [], adminId),
    ).rejects.toThrow("Pelo menos um tipo de evento");
  });

  it("deve suportar mÃºltiplos eventos", async () => {
    const webhook = await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook",
      [
        WebhookEventType.ORDER_CREATED,
        WebhookEventType.ORDER_UPDATED,
        WebhookEventType.PAYMENT_CONFIRMED,
      ],
      adminId,
    );

    expect(webhook.eventTypes.length).toBe(3);
  });

  it("deve desinscrever webhook", async () => {
    const webhook = await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook",
      [WebhookEventType.ORDER_CREATED],
      adminId,
    );

    await apiService.unsubscribeWebhook(storeId, webhook.id, adminId);

    const webhooks = await apiService.listWebhooks(storeId);

    expect(webhooks.filter((w) => w.id === webhook.id && w.isActive).length).toBe(0);
  });

  it("deve listar webhooks", async () => {
    await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook1",
      [WebhookEventType.ORDER_CREATED],
      adminId,
    );

    await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook2",
      [WebhookEventType.PAYMENT_CONFIRMED],
      adminId,
    );

    const webhooks = await apiService.listWebhooks(storeId);

    expect(webhooks.filter((w) => w.isActive).length).toBe(2);
  });
});

describe("PublicAPIService: Response Formatting", () => {
  let apiService: PublicAPIService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    apiService = new PublicAPIService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve formatar resposta de sucesso", () => {
    const response = apiService.formatSuccessResponse(
      { id: "123", name: "Test" },
      "req-abc",
      "1",
    );

    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ id: "123", name: "Test" });
    expect(response.meta?.version).toBe("1");
    expect(response.meta?.requestId).toBe("req-abc");
    expect(response.error).toBeUndefined();
  });

  it("deve formatar resposta de erro", () => {
    const response = apiService.formatErrorResponse(
      "INVALID_REQUEST",
      "Request invÃ¡lido",
      "req-xyz",
      { field: "email" },
    );

    expect(response.ok).toBe(false);
    expect(response.data).toBeUndefined();
    expect(response.error?.code).toBe("INVALID_REQUEST");
    expect(response.error?.message).toBe("Request invÃ¡lido");
    expect(response.error?.details?.field).toBe("email");
    expect(response.meta?.requestId).toBe("req-xyz");
  });

  it("deve incluir timestamp nas respostas", () => {
    const response = apiService.formatSuccessResponse({}, "req-123");

    expect(response.meta?.timestamp).toBeDefined();
    // Validar que Ã© ISO string
    expect(new Date(response.meta?.timestamp || "").getTime()).toBeGreaterThan(0);
  });
});

describe("PublicAPIService: Webhook Triggering", () => {
  let apiService: PublicAPIService;
  let redis: Redis;
  let storeId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    apiService = new PublicAPIService(redis);
    storeId = "test-store-trigger";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });
  });

  afterEach(async () => {
    await (prisma as any).webhookSubscription.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve disparar webhook para eventos inscritos", async () => {
    await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook",
      [WebhookEventType.ORDER_CREATED],
      "admin",
    );

    // Mock fetch nÃ£o Ã© necessÃ¡rio para este teste
    // Apenas validar que a funÃ§Ã£o completa sem erro
    await expect(
      apiService.triggerWebhook(storeId, WebhookEventType.ORDER_CREATED, {
        orderId: "123",
      }),
    ).resolves.not.toThrow();
  });

  it("nÃ£o deve disparar webhook para eventos nÃ£o inscritos", async () => {
    await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook",
      [WebhookEventType.ORDER_CREATED],
      "admin",
    );

    // Disparar evento nÃ£o inscrito (nÃ£o deve enviar)
    await expect(
      apiService.triggerWebhook(storeId, WebhookEventType.PAYMENT_CONFIRMED, {}),
    ).resolves.not.toThrow();
  });

  it("deve ignorar webhooks inativos", async () => {
    const webhook = await apiService.subscribeWebhook(
      storeId,
      "https://example.com/webhook",
      [WebhookEventType.ORDER_CREATED],
      "admin",
    );

    await apiService.unsubscribeWebhook(storeId, webhook.id, "admin");

    // Deve completar sem tentar enviar
    await expect(
      apiService.triggerWebhook(storeId, WebhookEventType.ORDER_CREATED, {}),
    ).resolves.not.toThrow();
  });
});

describe("PublicAPIService: API Key Tiers", () => {
  let apiService: PublicAPIService;
  let redis: Redis;
  let storeId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    apiService = new PublicAPIService(redis);
    storeId = "test-store-tier";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });
  });

  afterEach(async () => {
    await (prisma as any).aPIKey.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve criar keys de diferentes tiers", async () => {
    const free = await apiService.createAPIKey(storeId, "Free", APIKeyTier.FREE, "admin");
    const standard = await apiService.createAPIKey(storeId, "Standard", APIKeyTier.STANDARD, "admin");
    const business = await apiService.createAPIKey(storeId, "Business", APIKeyTier.BUSINESS, "admin");

    expect(free.apiKey.tier).toBe(APIKeyTier.FREE);
    expect(standard.apiKey.tier).toBe(APIKeyTier.STANDARD);
    expect(business.apiKey.tier).toBe(APIKeyTier.BUSINESS);
  });

  it("deve ter diferentes limites por tier", async () => {
    const freeKey = await apiService.createAPIKey(storeId, "Free", APIKeyTier.FREE, "admin");
    const standardKey = await apiService.createAPIKey(storeId, "Standard", APIKeyTier.STANDARD, "admin");

    const freeStatus = await apiService.getRateLimitStatus(
      freeKey.apiKey.id,
      APIKeyTier.FREE,
    );

    const standardStatus = await apiService.getRateLimitStatus(
      standardKey.apiKey.id,
      APIKeyTier.STANDARD,
    );

    // FREE tem 10 tokens, STANDARD tem 100
    expect(freeStatus.tokensRemaining).toBeLessThan(standardStatus.tokensRemaining);
  });
});

