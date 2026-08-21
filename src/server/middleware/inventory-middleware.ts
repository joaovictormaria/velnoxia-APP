import {
  cacheManager,
  invalidateRelatedCache,
  CACHE_KEYS,
} from "@/server/utils/cache";
import {
  checkRateLimit,
  createRateLimitError,
  RATE_LIMITS,
} from "@/server/utils/rate-limit";

/**
 * Middleware para cache + rate limit de estoque
 */

export function createInventoryMiddleware(storeId: string) {
  return {
    /**
     * Middleware para queries com cache
     */
    cached: async <T>(
      key: string,
      fetcher: () => Promise<T>,
      ttlSeconds: number = 300
    ): Promise<T> => {
      // Tentar pegar do cache
      const cached = cacheManager.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Buscar dados
      const data = await fetcher();

      // Guardar no cache
      cacheManager.set(key, data, ttlSeconds);

      return data;
    },

    /**
     * Middleware para mutations com invalidação
     */
    mutate: async <T>(
      operation: () => Promise<T>,
      cacheType?: string
    ): Promise<T> => {
      // Executar operação
      const result = await operation();

      // Invalidar cache relacionado
      invalidateRelatedCache(storeId, cacheType);

      return result;
    },

    /**
     * Middleware para rate limiting
     */
    limitedCall: async <T>(
      endpoint: string,
      fn: () => Promise<T>,
      strategy: keyof typeof RATE_LIMITS = "ITEM_OPERATIONS"
    ): Promise<T> => {
      const limit = checkRateLimit(storeId, endpoint, strategy);

      if (!limit.allowed) {
        throw createRateLimitError(limit.resetAt);
      }

      return await fn();
    },

    /**
     * Combinação: cache + rate limit
     */
    cachedAndLimited: async <T>(
      endpoint: string,
      cacheKey: string,
      fetcher: () => Promise<T>,
      strategy: keyof typeof RATE_LIMITS = "ITEM_OPERATIONS",
      ttlSeconds: number = 300
    ): Promise<T> => {
      // Verificar rate limit primeiro
      const limit = checkRateLimit(storeId, endpoint, strategy);
      if (!limit.allowed) {
        throw createRateLimitError(limit.resetAt);
      }

      // Tentar cache
      const cached = cacheManager.get<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Buscar e cachear
      const data = await fetcher();
      cacheManager.set(cacheKey, data, ttlSeconds);

      return data;
    },

    /**
     * Obter stats
     */
    getStats() {
      return {
        cache: cacheManager.getStats(),
      };
    },

    /**
     * Limpar cache
     */
    clearCache(pattern?: string) {
      if (pattern) {
        cacheManager.invalidate(pattern);
      } else {
        invalidateRelatedCache(storeId);
      }
    },
  };
}

/**
 * Pré-configurações úteis
 */
export const INVENTORY_CACHING = {
  ALERTS: {
    key: (storeId: string) => CACHE_KEYS.ALERTS(storeId),
    ttl: 60, // 1 minuto
  },
  CRITICAL_ITEMS: {
    key: (storeId: string) => CACHE_KEYS.CRITICAL_ITEMS(storeId),
    ttl: 300, // 5 minutos
  },
  FORECAST: {
    key: (storeId: string) => CACHE_KEYS.FORECAST(storeId),
    ttl: 600, // 10 minutos
  },
  COSTS: {
    key: (storeId: string) => CACHE_KEYS.COSTS(storeId),
    ttl: 900, // 15 minutos
  },
  ITEMS: {
    key: (storeId: string) => CACHE_KEYS.INVENTORY_ITEMS(storeId),
    ttl: 300, // 5 minutos
  },
};
