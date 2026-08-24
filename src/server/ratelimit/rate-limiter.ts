import { Redis } from "ioredis";

/**
 * PRIORIDADE 9: RATE LIMITING DISTRIBUÍDO
 *
 * Proteção contra brute force, DDoS, e abuso de API.
 * Usa Redis para compartilhar limites entre múltiplas instâncias.
 *
 * Token Bucket Algorithm:
 * - Cada chave tem um "balde" com tokens
 * - Cada operação consome 1 token
 * - Balde se refill automaticamente a uma taxa (ex: 5 tentativas por minuto)
 * - Se balde vazio → bloqueado até refill
 *
 * Exemplo:
 * // PIN login: máx 3 tentativas a cada 5 minutos
 * const limiter = new RateLimiter(redis, "pin-login:store-123:admin-456", {
 *   maxTokens: 3,
 *   refillRate: 3,      // 3 tokens
 *   refillInterval: 300, // em 300 segundos (5 min)
 * });
 *
 * if (!await limiter.isAllowed()) {
 *   return { ok: false, error: "Muitas tentativas. Tente novamente em 5 minutos." };
 * }
 *
 * // Validar PIN
 * const isValid = await validatePin(pin);
 * if (!isValid) {
 *   await limiter.recordFailure(); // Opcional: consume token mesmo sem chamar isAllowed
 * }
 */

export interface RateLimitConfig {
  maxTokens: number; // Capacidade do balde
  refillRate: number; // Quantos tokens adicionar
  refillInterval: number; // A cada quantos segundos
  blockDuration?: number; // Quanto tempo bloquear após atingir limite (padrão: refillInterval)
}

export interface RateLimitStatus {
  allowed: boolean;
  tokensRemaining: number;
  resetAt: Date;
  retryAfter: number; // Segundos até próxima tentativa
}

export class RateLimiter {
  private redis: Redis;
  private key: string;
  private config: RateLimitConfig;

  constructor(redis: Redis, key: string, config: RateLimitConfig) {
    this.redis = redis;
    this.key = `ratelimit:${key}`;
    this.config = {
      ...config,
      blockDuration: config.blockDuration || config.refillInterval,
    };
  }

  /**
   * Verificar se operação é permitida
   * Consome um token se permitido
   */
  async isAllowed(): Promise<boolean> {
    const status = await this.getStatus();
    return status.allowed;
  }

  /**
   * Obter status detalhado do rate limit
   */
  async getStatus(): Promise<RateLimitStatus> {
    const data = await this.redis.hgetall(this.key);

    let tokens = parseInt(data.tokens || this.config.maxTokens);
    const lastRefill = parseInt(data.lastRefill || Date.now());
    const lastAttempt = parseInt(data.lastAttempt || 0);
    const blockedUntil = parseInt(data.blockedUntil || 0);

    const now = Date.now();
    const timeSinceRefill = (now - lastRefill) / 1000; // em segundos
    const refillsNeeded = Math.floor(
      timeSinceRefill / this.config.refillInterval,
    );

    // Refill tokens se necessário
    if (refillsNeeded > 0) {
      tokens = Math.min(
        this.config.maxTokens,
        tokens + refillsNeeded * this.config.refillRate,
      );

      await this.redis
        .pipeline()
        .hset(this.key, "tokens", tokens)
        .hset(this.key, "lastRefill", now)
        .expire(this.key, this.config.blockDuration! * 2) // Limpeza automática
        .exec();
    }

    // Verificar se está bloqueado
    const isBlocked = now < blockedUntil;
    if (isBlocked) {
      return {
        allowed: false,
        tokensRemaining: 0,
        resetAt: new Date(blockedUntil),
        retryAfter: Math.ceil((blockedUntil - now) / 1000),
      };
    }

    const allowed = tokens > 0;

    if (allowed) {
      // Consumir um token
      await this.redis
        .pipeline()
        .hset(this.key, "tokens", tokens - 1)
        .hset(this.key, "lastAttempt", now)
        .expire(this.key, this.config.blockDuration! * 2)
        .exec();

      return {
        allowed: true,
        tokensRemaining: tokens - 1,
        resetAt: new Date(now + this.config.refillInterval * 1000),
        retryAfter: 0,
      };
    } else {
      // Bloquear
      const blockUntil = now + this.config.blockDuration! * 1000;

      await this.redis
        .pipeline()
        .hset(this.key, "blockedUntil", blockUntil)
        .hset(this.key, "lastAttempt", now)
        .expire(this.key, this.config.blockDuration! * 2)
        .exec();

      return {
        allowed: false,
        tokensRemaining: 0,
        resetAt: new Date(blockUntil),
        retryAfter: Math.ceil(this.config.blockDuration! / 1000),
      };
    }
  }

  /**
   * Registrar uma tentativa (sem consumir token automaticamente)
   * Útil para: tentativa errada, login inválido, etc
   */
  async recordAttempt(): Promise<void> {
    await this.redis.hset(this.key, "lastAttempt", Date.now());
    await this.redis.expire(this.key, this.config.blockDuration! * 2);
  }

  /**
   * Resetar rate limit (para teste ou desbloqueio)
   */
  async reset(): Promise<void> {
    await this.redis.del(this.key);
  }

  /**
   * Pré-alocar com tokens iniciais
   * Útil para: usuário novo, após upgrade, etc
   */
  async initialize(tokens: number = this.config.maxTokens): Promise<void> {
    await this.redis
      .pipeline()
      .hset(this.key, "tokens", Math.min(tokens, this.config.maxTokens))
      .hset(this.key, "lastRefill", Date.now())
      .expire(this.key, this.config.blockDuration! * 2)
      .exec();
  }
}

/**
 * CONFIGURAÇÕES PRÉ-DEFINIDAS
 */
export const RateLimitPresets = {
  /**
   * PIN login: 3 tentativas a cada 5 minutos
   * Se falhar 3x → bloqueado por 5 min
   */
  PIN_LOGIN: {
    maxTokens: 3,
    refillRate: 3,
    refillInterval: 300, // 5 minutos
  },

  /**
   * Tentativa de login: 5 tentativas por minuto
   */
  LOGIN_ATTEMPT: {
    maxTokens: 5,
    refillRate: 5,
    refillInterval: 60,
  },

  /**
   * Reset de senha: 3 tentativas a cada 15 minutos
   * (evita spam de e-mail)
   */
  PASSWORD_RESET: {
    maxTokens: 3,
    refillRate: 3,
    refillInterval: 900, // 15 minutos
  },

  /**
   * API pública: 100 requisições por minuto
   */
  PUBLIC_API: {
    maxTokens: 100,
    refillRate: 100,
    refillInterval: 60,
  },

  /**
   * API pública (gratuita): 10 requisições por minuto
   */
  PUBLIC_API_FREE: {
    maxTokens: 10,
    refillRate: 10,
    refillInterval: 60,
  },

  /**
   * SMS/Email: 5 por hora (evita spam)
   */
  SEND_MESSAGE: {
    maxTokens: 5,
    refillRate: 5,
    refillInterval: 3600, // 1 hora
  },

  /**
   * Export de dados: 1 por dia (operação pesada)
   */
  EXPORT: {
    maxTokens: 1,
    refillRate: 1,
    refillInterval: 86400, // 24 horas
  },
};

/**
 * CHAVES DE RATE LIMIT
 * Formato: tipo:contexto:identificador
 *
 * Exemplos:
 * - pin-login:store-123:admin-456 (tentativas de PIN por admin)
 * - login:ip:192.168.1.1 (tentativas de login por IP)
 * - password-reset:email:user@example.com (resets de senha por email)
 * - api:key:sk_live_xyz123 (requisições da API por chave)
 * - export:store:store-789 (exports de dados por loja)
 */

/**
 * CASOS DE USO:
 *
 * 1. PIN LOGIN (3 tentativas / 5 min)
 *    const limiter = new RateLimiter(redis, `pin-login:${storeId}:${adminId}`, RateLimitPresets.PIN_LOGIN);
 *    if (!await limiter.isAllowed()) {
 *      return { ok: false, error: "Muitas tentativas" };
 *    }
 *
 * 2. LOGIN ATTEMPT (5 / min por IP)
 *    const limiter = new RateLimiter(redis, `login:ip:${ipAddress}`, RateLimitPresets.LOGIN_ATTEMPT);
 *    if (!await limiter.isAllowed()) {
 *      return { ok: false, error: "IP bloqueado" };
 *    }
 *
 * 3. PASSWORD RESET (3 / 15 min por email)
 *    const limiter = new RateLimiter(redis, `password-reset:${email}`, RateLimitPresets.PASSWORD_RESET);
 *    const status = await limiter.getStatus();
 *    if (!status.allowed) {
 *      return { ok: false, error: `Tente novamente em ${status.retryAfter}s` };
 *    }
 *
 * 4. PUBLIC API (100 / min por chave)
 *    const limiter = new RateLimiter(redis, `api:${apiKey}`, RateLimitPresets.PUBLIC_API);
 *    const status = await limiter.getStatus();
 *    res.set("X-RateLimit-Remaining", status.tokensRemaining);
 *    res.set("X-RateLimit-Reset", Math.floor(status.resetAt.getTime() / 1000));
 *
 * 5. EXPORT (1 / dia por loja)
 *    const limiter = new RateLimiter(redis, `export:${storeId}`, RateLimitPresets.EXPORT);
 *    if (!await limiter.isAllowed()) {
 *      return { ok: false, error: "Apenas 1 export por dia" };
 *    }
 */
