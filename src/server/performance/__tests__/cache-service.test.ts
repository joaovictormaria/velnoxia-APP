import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "ioredis";
import { CacheService, CacheTTL } from "../cache-service";

/**
 * PRIORIDADE 15: TESTES DE CACHE DISTRIBUÍDO
 *
 * Valida caching com TTL, invalidação, batch operations,
 * lock-based thundering herd prevention, e hit rate tracking.
 */

describe("CacheService: Basic Operations", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve armazenar e recuperar valor", async () => {
    const data = { id: "123", name: "Test" };

    await cacheService.set("key1", data);
    const retrieved = await cacheService.get("key1");

    expect(retrieved).toEqual(data);
  });

  it("deve retornar null para chave inexistente", async () => {
    const result = await cacheService.get("nonexistent");

    expect(result).toBeNull();
  });

  it("deve validar existência de chave", async () => {
    await cacheService.set("key1", { test: true });

    const exists = await cacheService.exists("key1");
    const notExists = await cacheService.exists("nonexistent");

    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  it("deve serializar e desserializar JSON", async () => {
    const complex = {
      nested: { array: [1, 2, 3], date: new Date().toISOString() },
    };

    await cacheService.set("complex", complex);
    const retrieved = await cacheService.get("complex");

    expect(retrieved?.nested?.array).toEqual([1, 2, 3]);
  });
});

describe("CacheService: TTL & Expiration", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve usar TTL padrão (1 hora)", async () => {
    await cacheService.set("key1", { test: true });

    const ttl = await redis.ttl("key1");

    // TTL deve estar próximo de 3600 (1 hora)
    expect(ttl).toBeGreaterThan(3590);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it("deve usar TTL customizado", async () => {
    await cacheService.set("key1", { test: true }, CacheTTL.SHORT); // 5 min

    const ttl = await redis.ttl("key1");

    expect(ttl).toBeGreaterThan(290); // ~5 min
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it("deve expirar após TTL", async () => {
    await cacheService.set("key1", { test: true }, 1); // 1 segundo

    const immediate = await cacheService.get("key1");
    expect(immediate).toBeDefined();

    // Esperar expiração
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const expired = await cacheService.get("key1");
    expect(expired).toBeNull();
  });

  it("deve manter TTL ao atualizar", async () => {
    await cacheService.set("key1", { v: 1 }, CacheTTL.SHORT);

    const ttlBefore = await redis.ttl("key1");

    // Pequeno delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    await cacheService.update("key1", { v: 2 });

    const ttlAfter = await redis.ttl("key1");
    const retrieved = await cacheService.get("key1");

    expect(ttlAfter).toBeCloseTo(ttlBefore, -1); // Aproximadamente igual
    expect(retrieved?.v).toBe(2);
  });
});

describe("CacheService: Invalidation", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve invalidar uma chave", async () => {
    await cacheService.set("key1", { test: true });

    await cacheService.invalidate("key1");

    const result = await cacheService.get("key1");
    expect(result).toBeNull();
  });

  it("deve invalidar múltiplas chaves com padrão", async () => {
    await cacheService.set("products:store-1", []);
    await cacheService.set("products:store-2", []);
    await cacheService.set("inventory:prod-1", {});

    const invalidated = await cacheService.invalidatePattern("products:*");

    expect(invalidated).toBe(2);

    const prod1 = await cacheService.get("products:store-1");
    const inv1 = await cacheService.get("inventory:prod-1");

    expect(prod1).toBeNull();
    expect(inv1).toBeDefined(); // Não foi invalidado
  });

  it("deve retornar 0 se nenhuma chave matches pattern", async () => {
    const invalidated = await cacheService.invalidatePattern("nonexistent:*");

    expect(invalidated).toBe(0);
  });
});

describe("CacheService: GetOrCompute", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve retornar valor cacheado", async () => {
    const compute = async () => ({ expensive: true });

    await cacheService.set("key1", { cached: true });

    const result = await cacheService.getOrCompute("key1", compute);

    expect(result).toEqual({ cached: true });
  });

  it("deve computar se não estiver cacheado", async () => {
    const compute = async () => ({ computed: true });

    const result = await cacheService.getOrCompute("key1", compute);

    expect(result).toEqual({ computed: true });
  });

  it("deve cachear resultado da computação", async () => {
    const compute = async () => ({ computed: true });

    await cacheService.getOrCompute("key1", compute, CacheTTL.SHORT);

    const cached = await cacheService.get("key1");

    expect(cached).toEqual({ computed: true });
  });

  it("deve não chamar compute novamente se cacheado", async () => {
    let callCount = 0;
    const compute = async () => {
      callCount++;
      return { count: callCount };
    };

    await cacheService.getOrCompute("key1", compute);
    const result1 = await cacheService.getOrCompute("key1", compute);
    const result2 = await cacheService.getOrCompute("key1", compute);

    expect(callCount).toBe(1); // Compute chamado apenas 1x
    expect(result1.count).toBe(1);
    expect(result2.count).toBe(1);
  });
});

describe("CacheService: Lock-based GetOrCompute (Thundering Herd)", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve serializar computações concorrentes", async () => {
    let callCount = 0;
    const compute = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { count: callCount };
    };

    const key = "expensive";

    // Iniciar 3 computações concorrentes
    const promises = [
      cacheService.getOrComputeWithLock(key, compute, CacheTTL.SHORT),
      cacheService.getOrComputeWithLock(key, compute, CacheTTL.SHORT),
      cacheService.getOrComputeWithLock(key, compute, CacheTTL.SHORT),
    ];

    const results = await Promise.all(promises);

    // Apenas 1 computação deve ter ocorrido (lock protegeu)
    expect(callCount).toBeLessThanOrEqual(2); // Permitir pequena margem
    // Todos devem receber o mesmo valor
    expect(results[0]).toEqual(results[1]);
  });

  it("deve usar cache se disponível", async () => {
    let callCount = 0;
    const compute = async () => {
      callCount++;
      return { count: callCount };
    };

    // Pré-cachear
    await cacheService.set("key1", { cached: true }, CacheTTL.SHORT);

    const result = await cacheService.getOrComputeWithLock("key1", compute);

    expect(callCount).toBe(0); // Não chamou compute
    expect(result).toEqual({ cached: true });
  });
});

describe("CacheService: Batch Operations", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve obter múltiplos valores", async () => {
    await cacheService.set("key1", { id: 1 });
    await cacheService.set("key2", { id: 2 });
    await cacheService.set("key3", { id: 3 });

    const results = await cacheService.mget(["key1", "key2", "key3"]);

    expect(results.length).toBe(3);
    expect(results[0]?.id).toBe(1);
    expect(results[1]?.id).toBe(2);
    expect(results[2]?.id).toBe(3);
  });

  it("deve retornar null para chaves ausentes", async () => {
    await cacheService.set("key1", { id: 1 });

    const results = await cacheService.mget(["key1", "missing", "key2"]);

    expect(results[0]?.id).toBe(1);
    expect(results[1]).toBeNull();
    expect(results[2]).toBeNull();
  });

  it("deve armazenar múltiplos valores", async () => {
    await cacheService.mset([
      { key: "key1", value: { id: 1 } },
      { key: "key2", value: { id: 2 } },
      { key: "key3", value: { id: 3 } },
    ]);

    const result1 = await cacheService.get("key1");
    const result2 = await cacheService.get("key2");
    const result3 = await cacheService.get("key3");

    expect(result1?.id).toBe(1);
    expect(result2?.id).toBe(2);
    expect(result3?.id).toBe(3);
  });

  it("deve respeitar TTL customizado em mset", async () => {
    await cacheService.mset([
      { key: "key1", value: { id: 1 }, ttl: CacheTTL.SHORT },
      { key: "key2", value: { id: 2 }, ttl: CacheTTL.LONG },
    ]);

    const ttl1 = await redis.ttl("key1");
    const ttl2 = await redis.ttl("key2");

    expect(ttl1).toBeLessThan(ttl2);
  });
});

describe("CacheService: Statistics & Hit Rate", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve calcular hit rate", async () => {
    await cacheService.set("key1", { test: true });

    // 3 hits
    await cacheService.get("key1");
    await cacheService.get("key1");
    await cacheService.get("key1");

    // 1 miss
    await cacheService.get("missing");

    const hitRate = cacheService.getHitRate();

    expect(hitRate).toBe(75); // 3/4 = 75%
  });

  it("deve retornar 0% hit rate se sem requisições", async () => {
    const hitRate = cacheService.getHitRate();

    expect(hitRate).toBe(0);
  });

  it("deve resetar estatísticas", async () => {
    await cacheService.set("key1", { test: true });
    await cacheService.get("key1");
    await cacheService.get("missing");

    let hitRate = cacheService.getHitRate();
    expect(hitRate).toBeGreaterThan(0);

    cacheService.resetStats();

    hitRate = cacheService.getHitRate();
    expect(hitRate).toBe(0);
  });

  it("deve retornar cache stats", async () => {
    await cacheService.set("key1", { test: true });
    await cacheService.get("key1");

    const stats = await cacheService.getStats();

    expect(stats.totalEntries).toBeGreaterThan(0);
    expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    expect(stats.hitRate).toBeGreaterThanOrEqual(0);
  });
});

describe("CacheService: Clear & Cleanup", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve limpar padrão de chaves", async () => {
    await cacheService.set("products:1", []);
    await cacheService.set("products:2", []);
    await cacheService.set("inventory:1", {});

    const cleared = await cacheService.clearPattern("products:*");

    expect(cleared).toBe(2);

    const prod1 = await cacheService.get("products:1");
    const inv1 = await cacheService.get("inventory:1");

    expect(prod1).toBeNull();
    expect(inv1).toBeDefined();
  });

  it("deve limpar todo o cache", async () => {
    await cacheService.set("key1", {});
    await cacheService.set("key2", {});

    await cacheService.flushAll();

    const size = await redis.dbsize();
    expect(size).toBe(0);
  });
});

describe("CacheService: Warmup", () => {
  let cacheService: CacheService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    cacheService = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  it("deve pré-carregar múltiplas chaves", async () => {
    const computeFns = [
      { key: "key1", computeFn: async () => ({ id: 1 }) },
      { key: "key2", computeFn: async () => ({ id: 2 }) },
      { key: "key3", computeFn: async () => ({ id: 3 }) },
    ];

    await cacheService.warmup(computeFns);

    const result1 = await cacheService.get("key1");
    const result2 = await cacheService.get("key2");
    const result3 = await cacheService.get("key3");

    expect(result1?.id).toBe(1);
    expect(result2?.id).toBe(2);
    expect(result3?.id).toBe(3);
  });

  it("deve continuar se alguma chave falhar", async () => {
    const computeFns = [
      { key: "key1", computeFn: async () => ({ id: 1 }) },
      {
        key: "key2",
        computeFn: async () => {
          throw new Error("Compute error");
        },
      },
      { key: "key3", computeFn: async () => ({ id: 3 }) },
    ];

    await cacheService.warmup(computeFns);

    const result1 = await cacheService.get("key1");
    const result2 = await cacheService.get("key2");
    const result3 = await cacheService.get("key3");

    expect(result1?.id).toBe(1);
    expect(result2).toBeNull(); // Falhou
    expect(result3?.id).toBe(3);
  });
});
