// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "ioredis";
import { RateLimiter, RateLimitPresets } from "../rate-limiter";

/**
 * PRIORIDADE 9: TESTES DE RATE LIMITING
 *
 * Valida token bucket algorithm e cenÃ¡rios de brute force.
 * Nota: Estes testes requerem Redis rodando (ou mock).
 * Para testes sem Redis, usar Mock/InMemory adapter.
 */

describe("RateLimiter: Token Bucket Algorithm", () => {
  let redis: Redis;
  let limiter: RateLimiter;

  beforeEach(() => {
    // Mock ou Redis real para testes
    // Para exemplo, assumindo Redis mock disponÃ­vel
    redis = new Redis({
      host: "localhost",
      port: 6379,
      db: 15, // Test DB
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  describe("PIN Login (3 tentativas / 5 min)", () => {
    it("deve permitir primeira tentativa", async () => {
      limiter = new RateLimiter(
        redis,
        "test:pin:user1",
        RateLimitPresets.PIN_LOGIN,
      );

      const status = await limiter.getStatus();

      expect(status.allowed).toBe(true);
      expect(status.tokensRemaining).toBe(2); // 3 - 1
    });

    it("deve permitir atÃ© 3 tentativas", async () => {
      limiter = new RateLimiter(
        redis,
        "test:pin:user2",
        RateLimitPresets.PIN_LOGIN,
      );

      const att1 = await limiter.getStatus();
      expect(att1.allowed).toBe(true);

      const att2 = await limiter.getStatus();
      expect(att2.allowed).toBe(true);

      const att3 = await limiter.getStatus();
      expect(att3.allowed).toBe(true);
      expect(att3.tokensRemaining).toBe(0);
    });

    it("deve bloquear apÃ³s 3 tentativas", async () => {
      limiter = new RateLimiter(
        redis,
        "test:pin:user3",
        RateLimitPresets.PIN_LOGIN,
      );

      // Usar 3 tokens
      await limiter.getStatus();
      await limiter.getStatus();
      await limiter.getStatus();

      // 4Âª tentativa bloqueada
      const status = await limiter.getStatus();

      expect(status.allowed).toBe(false);
      expect(status.tokensRemaining).toBe(0);
      expect(status.retryAfter).toBeGreaterThan(0);
    });

    it("deve retornar tempo de espera correto", async () => {
      limiter = new RateLimiter(
        redis,
        "test:pin:user4",
        RateLimitPresets.PIN_LOGIN,
      );

      // Bloquear
      await limiter.getStatus();
      await limiter.getStatus();
      await limiter.getStatus();
      const status = await limiter.getStatus();

      // retryAfter deve estar prÃ³ximo a 300 (5 min)
      expect(status.retryAfter).toBeGreaterThan(0);
      expect(status.retryAfter).toBeLessThanOrEqual(300);
    });
  });

  describe("Refill automÃ¡tico", () => {
    it("deve refill de tokens apÃ³s intervalo", async () => {
      limiter = new RateLimiter(redis, "test:refill:1", {
        maxTokens: 2,
        refillRate: 2,
        refillInterval: 1, // 1 segundo
      });

      // Usar todos os tokens
      await limiter.getStatus(); // 1 token
      await limiter.getStatus(); // 0 tokens

      const blockedStatus = await limiter.getStatus();
      expect(blockedStatus.allowed).toBe(false);

      // Esperar refill
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const refilled = await limiter.getStatus();
      expect(refilled.allowed).toBe(true);
      expect(refilled.tokensRemaining).toBeLessThanOrEqual(1);
    });
  });

  describe("Reset", () => {
    it("deve resetar rate limit completamente", async () => {
      limiter = new RateLimiter(
        redis,
        "test:reset:1",
        RateLimitPresets.PIN_LOGIN,
      );

      // Bloquear
      await limiter.getStatus();
      await limiter.getStatus();
      await limiter.getStatus();
      const blocked = await limiter.getStatus();
      expect(blocked.allowed).toBe(false);

      // Reset
      await limiter.reset();

      // Agora deve permitir novamente
      const status = await limiter.getStatus();
      expect(status.allowed).toBe(true);
      expect(status.tokensRemaining).toBe(2); // MÃ¡ximo - 1
    });
  });

  describe("Initialize", () => {
    it("deve prÃ©-alocar tokens iniciais", async () => {
      limiter = new RateLimiter(
        redis,
        "test:init:1",
        RateLimitPresets.PIN_LOGIN,
      );

      // Initialize com 2 tokens
      await limiter.initialize(2);

      const status = await limiter.getStatus();
      expect(status.allowed).toBe(true);
      expect(status.tokensRemaining).toBe(1); // 2 - 1
    });

    it("deve capear em maxTokens", async () => {
      limiter = new RateLimiter(
        redis,
        "test:init:2",
        RateLimitPresets.PIN_LOGIN,
      );

      // Tentar alocar 100 tokens, mas mÃ¡ximo Ã© 3
      await limiter.initialize(100);

      const status = await limiter.getStatus();
      // Deve ter no mÃ¡ximo 3 tokens (e consumiu 1)
      expect(status.tokensRemaining).toBeLessThanOrEqual(2);
    });
  });

  describe("Record Attempt", () => {
    it("deve registrar tentativa sem consumir token", async () => {
      limiter = new RateLimiter(
        redis,
        "test:record:1",
        RateLimitPresets.PIN_LOGIN,
      );

      await limiter.recordAttempt();

      // Tokens nÃ£o devem ter mudado
      const status = await limiter.getStatus();
      expect(status.tokensRemaining).toBe(2); // 3 - 1 (apenas do getStatus)
    });
  });

  describe("Presets", () => {
    it("LOGIN_ATTEMPT: 5 / min", async () => {
      limiter = new RateLimiter(
        redis,
        "test:login:ip1",
        RateLimitPresets.LOGIN_ATTEMPT,
      );

      for (let i = 0; i < 5; i++) {
        const status = await limiter.getStatus();
        expect(status.allowed).toBe(true);
      }

      // 6Âª tentativa bloqueada
      const status = await limiter.getStatus();
      expect(status.allowed).toBe(false);
    });

    it("PASSWORD_RESET: 3 / 15 min", async () => {
      limiter = new RateLimiter(
        redis,
        "test:reset:email",
        RateLimitPresets.PASSWORD_RESET,
      );

      const status1 = await limiter.getStatus();
      expect(status1.allowed).toBe(true);

      const status2 = await limiter.getStatus();
      expect(status2.allowed).toBe(true);

      const status3 = await limiter.getStatus();
      expect(status3.allowed).toBe(true);

      const status4 = await limiter.getStatus();
      expect(status4.allowed).toBe(false);
      expect(status4.retryAfter).toBeGreaterThan(0);
      expect(status4.retryAfter).toBeLessThanOrEqual(900);
    });

    it("PUBLIC_API: 100 / min", async () => {
      limiter = new RateLimiter(
        redis,
        "test:api:key1",
        RateLimitPresets.PUBLIC_API,
      );

      const status = await limiter.getStatus();
      expect(status.allowed).toBe(true);
      expect(status.tokensRemaining).toBe(99);
    });

    it("EXPORT: 1 / dia", async () => {
      limiter = new RateLimiter(
        redis,
        "test:export:store1",
        RateLimitPresets.EXPORT,
      );

      const status1 = await limiter.getStatus();
      expect(status1.allowed).toBe(true);

      const status2 = await limiter.getStatus();
      expect(status2.allowed).toBe(false);
      expect(status2.retryAfter).toBeGreaterThan(0);
      expect(status2.retryAfter).toBeLessThanOrEqual(86400);
    });
  });

  describe("Casos de uso reais", () => {
    it("PIN brute force: 3 tentativas bloqueiam por 5 min", async () => {
      const storeId = "store-123";
      const adminId = "admin-456";

      limiter = new RateLimiter(
        redis,
        `pin-login:${storeId}:${adminId}`,
        RateLimitPresets.PIN_LOGIN,
      );

      // Simular 3 tentativas erradas
      for (let i = 0; i < 3; i++) {
        const status = await limiter.getStatus();
        if (!status.allowed) {
          // UsuÃ¡rio bloqueado
          expect(status.retryAfter).toBeGreaterThan(0);
          return;
        }
      }

      // 4Âª tentativa
      const final = await limiter.getStatus();
      expect(final.allowed).toBe(false);
    });

    it("IP login spam: bloquear apÃ³s 5 tentativas", async () => {
      const ip = "192.168.1.1";

      limiter = new RateLimiter(
        redis,
        `login:ip:${ip}`,
        RateLimitPresets.LOGIN_ATTEMPT,
      );

      let blocked = false;
      for (let i = 0; i < 6; i++) {
        const status = await limiter.getStatus();
        if (!status.allowed) {
          blocked = true;
          break;
        }
      }

      expect(blocked).toBe(true);
    });

    it("API key quota: retornar headers de rate limit", async () => {
      const apiKey = "sk_live_xyz123";

      limiter = new RateLimiter(
        redis,
        `api:${apiKey}`,
        RateLimitPresets.PUBLIC_API,
      );

      const status = await limiter.getStatus();

      // Headers para resposta HTTP
      const headers = {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": status.tokensRemaining.toString(),
        "X-RateLimit-Reset": Math.floor(status.resetAt.getTime() / 1000).toString(),
      };

      expect(parseInt(headers["X-RateLimit-Remaining"])).toBeLessThanOrEqual(99);
      expect(parseInt(headers["X-RateLimit-Limit"])).toBe(100);
    });
  });

  describe("Isolation", () => {
    it("chaves diferentes devem ter quotas independentes", async () => {
      const limiter1 = new RateLimiter(
        redis,
        "test:iso:user1",
        RateLimitPresets.PIN_LOGIN,
      );
      const limiter2 = new RateLimiter(
        redis,
        "test:iso:user2",
        RateLimitPresets.PIN_LOGIN,
      );

      // User 1: usar 3 tokens
      await limiter1.getStatus();
      await limiter1.getStatus();
      await limiter1.getStatus();

      // User 2: deve ter 3 tokens intactos
      const status2 = await limiter2.getStatus();
      expect(status2.tokensRemaining).toBe(2); // 3 - 1
    });
  });
});

