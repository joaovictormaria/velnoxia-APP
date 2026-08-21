/**
 * Rate Limiter para Estoque APIs
 * Protege contra abuso e garante performance
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();

  /**
   * Verificar se requisição está dentro do limite
   */
  isAllowed(key: string, maxRequests: number, windowSeconds: number): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetAt) {
      // Novo período
      this.limits.set(key, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      });
      return true;
    }

    // Verificar limite
    if (entry.count < maxRequests) {
      entry.count++;
      return true;
    }

    return false;
  }

  /**
   * Obter status do limite
   */
  getStatus(key: string, maxRequests: number, windowSeconds: number) {
    const entry = this.limits.get(key);
    const now = Date.now();

    if (!entry || now > entry.resetAt) {
      return {
        remaining: maxRequests,
        reset: now + windowSeconds * 1000,
      };
    }

    return {
      remaining: Math.max(0, maxRequests - entry.count),
      reset: entry.resetAt,
    };
  }

  /**
   * Reset manual
   */
  reset(pattern?: string) {
    if (!pattern) {
      this.limits.clear();
    } else {
      const regex = new RegExp(pattern);
      for (const key of this.limits.keys()) {
        if (regex.test(key)) {
          this.limits.delete(key);
        }
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Estratégias de rate limit
 */
export const RATE_LIMITS = {
  // Alertas (alta frequência OK)
  ALERTS: {
    max: 100,
    window: 60,
  },

  // Custos (média frequência)
  COSTS: {
    max: 50,
    window: 60,
  },

  // Forecast (baixa frequência)
  FORECAST: {
    max: 20,
    window: 60,
  },

  // Notificações (muito baixa)
  NOTIFICATIONS: {
    max: 5,
    window: 60,
  },

  // CRUD de items
  ITEM_OPERATIONS: {
    max: 30,
    window: 60,
  },

  // Movimentações
  MOVEMENTS: {
    max: 100,
    window: 60,
  },

  // Proteção contra abuso
  STRICT: {
    max: 10,
    window: 60,
  },
};

/**
 * Middleware de rate limit
 */
export function checkRateLimit(
  storeId: string,
  endpoint: string,
  strategy: keyof typeof RATE_LIMITS = "ITEM_OPERATIONS"
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${storeId}:${endpoint}`;
  const limits = RATE_LIMITS[strategy];

  const allowed = rateLimiter.isAllowed(key, limits.max, limits.window);
  const status = rateLimiter.getStatus(key, limits.max, limits.window);

  return {
    allowed,
    remaining: status.remaining,
    resetAt: status.reset,
  };
}

/**
 * Criar erro de rate limit
 */
export function createRateLimitError(resetAt: number) {
  const secondsUntilReset = Math.ceil((resetAt - Date.now()) / 1000);
  return new Error(
    `Rate limit exceeded. Try again in ${secondsUntilReset} seconds.`
  );
}
