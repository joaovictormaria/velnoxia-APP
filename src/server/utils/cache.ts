/**
 * Cache Manager para Estoque
 * Implementa caching em memória com TTL
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private timers = new Map<string, NodeJS.Timeout>();

  /**
   * Obter valor do cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.clearTimer(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Guardar no cache
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300) {
    // Limpar timer anterior
    this.clearTimer(key);

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiresAt });

    // Agendar limpeza automática
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, ttlSeconds * 1000);

    this.timers.set(key, timer);
  }

  /**
   * Invalidar cache
   */
  invalidate(pattern?: string) {
    if (!pattern) {
      // Limpar tudo
      this.cache.clear();
      this.timers.forEach((timer) => clearTimeout(timer));
      this.timers.clear();
    } else {
      // Limpar por pattern
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
          this.clearTimer(key);
        }
      }
    }
  }

  /**
   * Limpar timer
   */
  private clearTimer(key: string) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  /**
   * Stats do cache
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        ttl: Math.max(0, entry.expiresAt - Date.now()),
      })),
    };
  }
}

export const cacheManager = new CacheManager();

/**
 * Decorator para cache automático
 */
export function Cacheable(ttlSeconds: number = 300, keyPrefix: string = "") {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${keyPrefix}:${propertyKey}:${JSON.stringify(args)}`;

      // Tentar pegar do cache
      const cached = cacheManager.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Executar método
      const result = await originalMethod.apply(this, args);

      // Guardar no cache
      cacheManager.set(cacheKey, result, ttlSeconds);

      return result;
    };

    return descriptor;
  };
}

/**
 * Cache keys padrão
 */
export const CACHE_KEYS = {
  ALERTS: (storeId: string) => `alerts:${storeId}`,
  CRITICAL_ITEMS: (storeId: string) => `critical-items:${storeId}`,
  FORECAST: (storeId: string) => `forecast:${storeId}`,
  COSTS: (storeId: string) => `costs:${storeId}`,
  INVENTORY_ITEMS: (storeId: string) => `items:${storeId}`,
  ITEM_DETAILS: (storeId: string, itemId: string) =>
    `item:${storeId}:${itemId}`,
};

/**
 * Invalidar cache quando há mudanças
 */
export function invalidateRelatedCache(storeId: string, type?: string) {
  if (type === "item") {
    cacheManager.invalidate(`^(alerts|critical-items|forecast|items):`);
  } else if (type === "movement") {
    cacheManager.invalidate(
      `^(alerts|critical-items|forecast|costs|items):`
    );
  } else {
    // Invalidar tudo da store
    cacheManager.invalidate();
  }
}
