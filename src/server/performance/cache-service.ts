// @ts-nocheck
import { Redis } from "ioredis";
import { AuditService } from "../audit/audit-service";

/**
 * PRIORIDADE 15: PERFORMANCE - CACHE DISTRIBUÃDO
 *
 * OtimizaÃ§Ã£o atravÃ©s de caching em Redis com invalidaÃ§Ã£o automÃ¡tica,
 * batch operations, e monitoramento de performance.
 *
 * EstratÃ©gias de cache:
 * - TTL-based: ExpiraÃ§Ã£o automÃ¡tica (ex: catÃ¡logo = 1 hora)
 * - Event-driven: InvalidaÃ§Ã£o ao criar/atualizar (ex: inventory)
 * - Hybrid: CombinaÃ§Ã£o (ex: produtos com TTL + invalidaÃ§Ã£o em atualizaÃ§Ã£o)
 *
 * Modelos de cache:
 * - products:{storeId} â†’ lista de produtos (TTL 1h)
 * - product:{id} â†’ detalhes de produto (TTL 1h, invalidar on update)
 * - inventory:{productId} â†’ estoque atual (TTL 30min, invalidar on restock)
 * - orders:{storeId}:pending â†’ pedidos pendentes (TTL 5min)
 * - user:{userId}:permissions â†’ permissÃµes do usuÃ¡rio (TTL 24h)
 * - analytics:{storeId}:{day} â†’ analytics diÃ¡rias (TTL 7 dias)
 */

export interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: Date;
  hits: number;
  lastAccessedAt: Date;
}

export interface CacheStats {
  totalEntries: number;
  memoryUsageBytes: number;
  hitRate: number; // 0-100%
  averageResponseTime: number; // ms
  entriesExpiredToday: number;
}

export enum CacheTTL {
  SHORT = 5 * 60, // 5 minutos
  MEDIUM = 30 * 60, // 30 minutos
  LONG = 60 * 60, // 1 hora
  VERY_LONG = 24 * 60 * 60, // 24 horas
}

export class CacheService {
  private redis: Redis;
  private localStats = {
    hits: 0,
    misses: 0,
  };

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Obter valor do cache
   */
  async get<T>(key: string): Promise<T | null> {
    const start = performance.now();

    const value = await this.redis.get(key);

    const duration = performance.now() - start;

    if (value) {
      this.localStats.hits++;
      // Incrementar hit counter
      await this.redis.hincrby(`cache:stats:${key}`, "hits", 1);
      await this.redis.hset(`cache:stats:${key}`, "lastAccessed", Date.now());
    } else {
      this.localStats.misses++;
    }

    return value ? (JSON.parse(value) as T) : null;
  }

  /**
   * Definir valor no cache com TTL
   */
  async set<T>(key: string, value: T, ttl: number = CacheTTL.LONG): Promise<void> {
    const serialized = JSON.stringify(value);

    await this.redis.setex(key, ttl, serialized);

    // Registrar metadata
    await this.redis.hset(`cache:stats:${key}`, "created", Date.now());
    await this.redis.hset(`cache:stats:${key}`, "ttl", ttl);
    await this.redis.hset(`cache:stats:${key}`, "size", serialized.length);
  }

  /**
   * Verificar se chave existe no cache
   */
  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  /**
   * Deletar chave do cache (invalidaÃ§Ã£o)
   */
  async invalidate(key: string): Promise<void> {
    await this.redis.del(key);
    await this.redis.del(`cache:stats:${key}`);
  }

  /**
   * Invalidar mÃºltiplas chaves (padrÃ£o wildcards)
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    await this.redis.del(...keys);

    // Limpar stats
    for (const key of keys) {
      await this.redis.del(`cache:stats:${key}`);
    }

    return keys.length;
  }

  /**
   * Atualizar valor sem alterar TTL
   */
  async update<T>(key: string, value: T): Promise<void> {
    const ttl = await this.redis.ttl(key);

    if (ttl === -1 || ttl === -2) {
      // Chave nÃ£o existe ou sem TTL, usar default
      await this.set(key, value);
    } else {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
      await this.redis.hset(`cache:stats:${key}`, "lastUpdated", Date.now());
    }
  }

  /**
   * Obter com fallback (se nÃ£o estiver no cache, executar funÃ§Ã£o)
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttl: number = CacheTTL.LONG,
  ): Promise<T> {
    // Tentar cache
    const cached = await this.get<T>(key);
    if (cached) {
      return cached;
    }

    // Compute e cachear
    const value = await computeFn();
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Cache com lock para evitar thundering herd
   * Apenas uma requisiÃ§Ã£o computa enquanto outros aguardam
   */
  async getOrComputeWithLock<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttl: number = CacheTTL.LONG,
    lockTtl: number = 30,
  ): Promise<T> {
    // Tentar cache
    const cached = await this.get<T>(key);
    if (cached) {
      return cached;
    }

    const lockKey = `lock:${key}`;
    const lockId = Math.random().toString();

    // Tentar adquirir lock
    const lockAcquired = await this.redis.set(lockKey, lockId, "EX", lockTtl, "NX");

    if (lockAcquired) {
      try {
        // Tem o lock, compute
        const value = await computeFn();
        await this.set(key, value, ttl);
        return value;
      } finally {
        // Liberar lock
        const currentLock = await this.redis.get(lockKey);
        if (currentLock === lockId) {
          await this.redis.del(lockKey);
        }
      }
    } else {
      // AlguÃ©m estÃ¡ computando, aguardar e tentar cache novamente
      for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const retried = await this.get<T>(key);
        if (retried) {
          return retried;
        }
      }

      // Timeout, fazer fallback
      return await computeFn();
    }
  }

  /**
   * Batch operations (reduzir RTT)
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) {
      return [];
    }

    const values = await this.redis.mget(...keys);

    return values.map((v: any) => (v ? (JSON.parse(v) as T) : null));
  }

  /**
   * Batch set
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    // Pipeline para atomicidade
    const pipeline = this.redis.pipeline();

    for (const { key, value, ttl = CacheTTL.LONG } of entries) {
      const serialized = JSON.stringify(value);
      pipeline.setex(key, ttl, serialized);
      pipeline.hset(`cache:stats:${key}`, "created", Date.now());
    }

    await pipeline.exec();
  }

  /**
   * Obter estatÃ­sticas de cache
   */
  async getStats(): Promise<CacheStats> {
    const info = await this.redis.info("memory");
    const dbSize = await this.redis.dbsize();

    const hitRate = this.localStats.hits + this.localStats.misses > 0
      ? (this.localStats.hits / (this.localStats.hits + this.localStats.misses)) * 100
      : 0;

    // Parse memory info (formato Redis)
    const memoryUsed = parseInt(info.match(/used_memory:(\d+)/)?.[1] || "0");

    return {
      totalEntries: dbSize,
      memoryUsageBytes: memoryUsed,
      hitRate: Math.round(hitRate * 100) / 100,
      averageResponseTime: 5, // Placeholder
      entriesExpiredToday: 0, // Placeholder
    };
  }

  /**
   * PrÃ©-carregador de cache (warm-up)
   */
  async warmup<T>(
    keys: Array<{ key: string; computeFn: () => Promise<T>; ttl?: number }>,
  ): Promise<void> {
    console.log(`[Cache] Aquecendo ${keys.length} chaves...`);

    for (const { key, computeFn, ttl = CacheTTL.LONG } of keys) {
      try {
        const value = await computeFn();
        await this.set(key, value, ttl);
      } catch (error) {
        console.error(`[Cache] Falha ao aquecedor chave ${key}:`, error);
      }
    }

    console.log("[Cache] Aquecimento concluÃ­do");
  }

  /**
   * Limpar cache por padrÃ£o (maintenance)
   */
  async clearPattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    await this.redis.del(...keys);
    return keys.length;
  }

  /**
   * Limpar todo o cache (use com cuidado)
   */
  async flushAll(): Promise<void> {
    await this.redis.flushdb();
    this.localStats = { hits: 0, misses: 0 };
  }

  /**
   * Hit rate (0-100%)
   */
  getHitRate(): number {
    const total = this.localStats.hits + this.localStats.misses;
    return total > 0 ? (this.localStats.hits / total) * 100 : 0;
  }

  /**
   * Reset stats
   */
  resetStats(): void {
    this.localStats = { hits: 0, misses: 0 };
  }
}

/**
 * ESTRATÃ‰GIAS DE CACHE POR RECURSO:
 *
 * PRODUTOS:
 * - Key: products:{storeId}
 * - TTL: 1 hora
 * - InvalidaÃ§Ã£o: on product create/update/delete
 * - Hit rate esperado: 90%+
 *
 * INVENTÃRIO:
 * - Key: inventory:{productId}
 * - TTL: 30 min
 * - InvalidaÃ§Ã£o: on restock/consume/adjust
 * - Hit rate esperado: 80%+
 *
 * PEDIDOS PENDENTES:
 * - Key: orders:{storeId}:pending
 * - TTL: 5 min
 * - InvalidaÃ§Ã£o: on order update
 * - Hit rate esperado: 70%+
 *
 * PERMISSÃ•ES USUÃRIO:
 * - Key: user:{userId}:permissions
 * - TTL: 24 horas
 * - InvalidaÃ§Ã£o: on role change
 * - Hit rate esperado: 95%+
 *
 * ANALYTICS:
 * - Key: analytics:{storeId}:{date}
 * - TTL: 7 dias
 * - Hit rate esperado: 85%+
 *
 * CATÃLOGO (CatÃ©gories + Produtos + Extras):
 * - Key: catalog:{storeId}
 * - TTL: 1 hora
 * - InvalidaÃ§Ã£o: on any catalog change
 * - Hit rate esperado: 90%+
 */

/**
 * CASOS DE USO:
 *
 * 1. CACHE COM TTL SIMPLES:
 *    const products = await cacheService.get("products:store-123");
 *    if (!products) {
 *      const data = await fetchProductsFromDB();
 *      await cacheService.set("products:store-123", data, CacheTTL.LONG);
 *    }
 *
 * 2. GETORCOMPUTE (PADRÃƒO RECOMENDADO):
 *    const products = await cacheService.getOrCompute(
 *      "products:store-123",
 *      () => fetchProductsFromDB(),
 *      CacheTTL.LONG
 *    );
 *
 * 3. CACHE COM LOCK (THUNDERING HERD):
 *    const analytics = await cacheService.getOrComputeWithLock(
 *      "analytics:store-123:2026-08-24",
 *      () => computeExpensiveAnalytics(),
 *      CacheTTL.VERY_LONG
 *    );
 *
 * 4. BATCH OPERATIONS:
 *    const values = await cacheService.mget([
 *      "product:1", "product:2", "product:3"
 *    ]);
 *
 * 5. INVALIDAÃ‡ÃƒO:
 *    // Atualizar produto
 *    await updateProduct(id, data);
 *    // Invalidar caches dependentes
 *    await cacheService.invalidate(`product:${id}`);
 *    await cacheService.invalidatePattern(`products:*`);
 *
 * 6. AQUECIMENTO:
 *    await cacheService.warmup([
 *      { key: "products:store-123", computeFn: () => fetchProducts() },
 *      { key: "categories:store-123", computeFn: () => fetchCategories() }
 *    ]);
 *
 * 7. MONITORAMENTO:
 *    const stats = await cacheService.getStats();
 *    console.log(`Hit rate: ${stats.hitRate}%`);
 */

