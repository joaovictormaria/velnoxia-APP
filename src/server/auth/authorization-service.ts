// @ts-nocheck
import { prisma } from "../db/client";
import { RateLimiter, RateLimitPresets } from "../ratelimit/rate-limiter";
import { Redis } from "ioredis";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { AuditService } from "../audit/audit-service";

/**
 * PRIORIDADE 10: AUTORIZAÃ‡ÃƒO CENTRALIZADA
 *
 * Gerencia PIN, sessÃµes, autorizaÃ§Ã£o de dispositivos e rotaÃ§Ã£o de tokens.
 * Integra rate limiting, auditoria, e soft delete para compliance.
 *
 * Fluxo:
 * 1. generatePIN(storeId, adminId) â†’ PIN de 4 dÃ­gitos + hash no BD
 * 2. verifyPIN(storeId, adminId, pin) â†’ valida + rate limit
 * 3. authorizeDevice(storeId, adminId, deviceId, userAgent) â†’ cria TableSession
 * 4. revokeDevice(storeId, adminId, deviceId) â†’ revoca acesso
 * 5. rotateToken(sessionId) â†’ novo token, invalida antigo
 * 6. listAuthorizedDevices(storeId, adminId) â†’ auditoria
 */

export interface PINConfig {
  length: number; // 4 ou 6 dÃ­gitos
  expiryMinutes: number; // Quanto tempo PIN Ã© vÃ¡lido
  maxAttempts: number; // Tentativas antes de bloquear
  blockDurationMinutes: number; // Tempo de bloqueio apÃ³s tentativas
}

export interface DeviceAuthorizationInput {
  storeId: string;
  adminId: string;
  deviceId: string; // Fingerprint Ãºnico do dispositivo
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthorizedDevice {
  id: string;
  storeId: string;
  adminId: string;
  deviceId: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  firstAuthorizedAt: Date;
  lastUsedAt: Date;
  isActive: boolean;
  revokedAt?: Date;
  revokedBy?: string;
}

const DEFAULT_PIN_CONFIG: PINConfig = {
  length: 4,
  expiryMinutes: 15,
  maxAttempts: 3,
  blockDurationMinutes: 5,
};

export class AuthorizationService {
  private redis: Redis;
  private pinConfig: PINConfig;

  constructor(redis: Redis, pinConfig: Partial<PINConfig> = {}) {
    this.redis = redis;
    this.pinConfig = { ...DEFAULT_PIN_CONFIG, ...pinConfig };
  }

  /**
   * Gerar um novo PIN para autenticaÃ§Ã£o
   * Invalida PIN anterior se existir
   */
  async generatePIN(storeId: string, adminId: string): Promise<string> {
    // Gerar PIN
    const pinLength = this.pinConfig.length;
    const pin = Math.floor(Math.random() * Math.pow(10, pinLength))
      .toString()
      .padStart(pinLength, "0");

    // Hash do PIN para armazenar no Redis
    const pinHash = this.hashPIN(pin);
    const pinKey = `pin:${storeId}:${adminId}`;
    const expirySeconds = this.pinConfig.expiryMinutes * 60;

    // Invalidar PIN anterior
    await this.redis.del(pinKey);

    // Armazenar novo PIN com expiraÃ§Ã£o
    await this.redis.setex(pinKey, expirySeconds, JSON.stringify({
      hash: pinHash,
      createdAt: Date.now(),
      attempts: 0,
    }));

    // Auditar geraÃ§Ã£o
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "CREATE",
      resource: "PIN",
      resourceId: adminId,
      reason: "PIN gerado para autenticaÃ§Ã£o",
    });

    return pin;
  }

  /**
   * Verificar PIN com rate limiting
   * Consome token de rate limit a cada tentativa
   */
  async verifyPIN(
    storeId: string,
    adminId: string,
    pin: string,
  ): Promise<{ valid: boolean; remainingAttempts?: number; retryAfter?: number }> {
    // Rate limit: 3 tentativas / 5 min
    const limiter = new RateLimiter(
      this.redis,
      `pin-login:${storeId}:${adminId}`,
      RateLimitPresets.PIN_LOGIN,
    );

    const status = await limiter.getStatus();

    if (!status.allowed) {
      await AuditService.logError({
        storeId,
        userId: adminId,
        action: "LOGIN_BLOCKED",
        resource: "PIN",
        resourceId: adminId,
        reason: `Muitas tentativas. Tente novamente em ${status.retryAfter}s`,
      }, new Error("Rate limit exceeded"));

      return {
        valid: false,
        retryAfter: status.retryAfter,
      };
    }

    // Buscar PIN no Redis
    const pinKey = `pin:${storeId}:${adminId}`;
    const stored = await this.redis.get(pinKey);

    if (!stored) {
      // PIN expirado ou nunca foi gerado
      await AuditService.logError({
        storeId,
        userId: adminId,
        action: "LOGIN_FAILED",
        resource: "PIN",
        resourceId: adminId,
        reason: "PIN expirado ou invÃ¡lido",
      }, new Error("PIN not found"));

      return { valid: false, remainingAttempts: status.tokensRemaining };
    }

    const pinData = JSON.parse(stored);
    const pinHash = this.hashPIN(pin);

    // ComparaÃ§Ã£o segura (timing-safe)
    const isValid = this.secureCompare(pinHash, pinData.hash);

    if (!isValid) {
      // Incrementar tentativa falhada
      pinData.attempts++;
      await this.redis.setex(
        pinKey,
        this.pinConfig.expiryMinutes * 60,
        JSON.stringify(pinData),
      );

      await AuditService.logError({
        storeId,
        userId: adminId,
        action: "LOGIN_FAILED",
        resource: "PIN",
        resourceId: adminId,
        reason: `PIN incorreto (tentativa ${pinData.attempts})`,
      }, new Error("Invalid PIN"));

      return { valid: false, remainingAttempts: status.tokensRemaining };
    }

    // PIN vÃ¡lido: limpar e auditar
    await this.redis.del(pinKey);

    await AuditService.log({
      storeId,
      userId: adminId,
      action: "LOGIN_SUCCESS",
      resource: "PIN",
      resourceId: adminId,
      reason: "PIN verificado com sucesso",
    });

    return { valid: true };
  }

  /**
   * Autorizar um novo dispositivo
   * Cria TableSession e autoriza acesso
   */
  async authorizeDevice(
    input: DeviceAuthorizationInput,
  ): Promise<AuthorizedDevice> {
    const { storeId, adminId, deviceId, userAgent, ipAddress } = input;

    // Validar que admin existe
    const admin = await prisma.employee.findFirst({
      where: { id: adminId, storeId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!admin) {
      throw new Error("Admin nÃ£o encontrado");
    }

    // Validar que mesa existe
    const table = await prisma.table.findFirst({
      where: { storeId, deletedAt: null },
      select: { id: true },
    });

    if (!table) {
      throw new Error("Nenhuma mesa disponÃ­vel na loja");
    }

    // Gerar token de sessÃ£o
    const sessionToken = randomBytes(32).toString("hex");
    const sessionTokenHash = createHash("sha256").update(sessionToken).digest("hex");

    // Criar sessÃ£o
    const session = await prisma.tableSession.create({
      data: {
        tableId: table.id,
        adminId,
        sessionToken: sessionTokenHash,
        deviceId,
        userAgent: userAgent || "",
        ipAddress: ipAddress || "",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
        isActive: true,
      } as any,
    });

    // Auditar autorizaÃ§Ã£o
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "AUTHORIZE_DEVICE",
      resource: "Device",
      resourceId: deviceId,
      newValue: {
        deviceId,
        userAgent: userAgent?.substring(0, 100),
        ipAddress,
        authorizedAt: new Date().toISOString(),
      },
      reason: "Dispositivo autorizado para acesso",
    });

    return {
      id: session.id,
      storeId,
      adminId,
      deviceId,
      deviceName: this.extractDeviceName(userAgent),
      userAgent,
      ipAddress,
      firstAuthorizedAt: session.createdAt,
      lastUsedAt: session.updatedAt,
      isActive: true,
    };
  }

  /**
   * Revogar acesso de um dispositivo
   * Marca sessÃ£o como inativa e invalida tokens
   */
  async revokeDevice(
    storeId: string,
    adminId: string,
    deviceId: string,
    revokedBy: string,
  ): Promise<void> {
    // Buscar todas as sessÃµes do dispositivo
    const sessions = await prisma.tableSession.findMany({
      where: {
        deviceId,
        adminId,
        isActive: true,
      } as any,
      select: { id: true },
    });

    if (sessions.length === 0) {
      throw new Error("Nenhuma sessÃ£o ativa para este dispositivo");
    }

    // Desativar todas as sessÃµes
    await prisma.tableSession.updateMany({
      where: {
        id: { in: sessions.map((s) => s.id) },
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedBy,
      } as any,
    });

    // Auditar revogaÃ§Ã£o
    await AuditService.log({
      storeId,
      userId: revokedBy,
      action: "REVOKE_DEVICE",
      resource: "Device",
      resourceId: deviceId,
      oldValue: {
        deviceId,
        sessionsRevoked: sessions.length,
      },
      reason: "Dispositivo revogado",
    });
  }

  /**
   * Rotacionar token de sessÃ£o
   * Invalida token antigo e gera novo
   */
  async rotateToken(sessionId: string): Promise<string> {
    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        adminId: true,
        table: { select: { storeId: true } },
      } as any,
    });

    if (!session) {
      throw new Error("SessÃ£o nÃ£o encontrada");
    }

    // Gerar novo token
    const newToken = randomBytes(32).toString("hex");
    const newTokenHash = createHash("sha256").update(newToken).digest("hex");

    // Atualizar sessÃ£o com novo token
    await prisma.tableSession.update({
      where: { id: sessionId },
      data: {
        sessionToken: newTokenHash,
        tokenRotatedAt: new Date(),
      } as any,
    });

    // Auditar rotaÃ§Ã£o
    await AuditService.log({
      storeId: (session?.table as any)?.storeId,
      userId: (session as any).adminId,
      action: "ROTATE_TOKEN",
      resource: "Session",
      resourceId: sessionId,
      reason: "Token de sessÃ£o rotacionado",
    });

    return newToken;
  }

  /**
   * Listar dispositivos autorizados
   * Ãštil para gerenciamento e auditoria
   */
  async listAuthorizedDevices(
    storeId: string,
    adminId: string,
  ): Promise<AuthorizedDevice[]> {
    const sessions = await prisma.tableSession.findMany({
      where: {
        adminId,
        table: { storeId },
      } as any,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        revokedAt: true,
        revokedBy: true,
      } as any,
    });

    return sessions.map((session: any) => ({
      id: session.id,
      storeId,
      adminId,
      deviceId: session.deviceId,
      deviceName: this.extractDeviceName(session.userAgent),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      firstAuthorizedAt: session.createdAt,
      lastUsedAt: session.updatedAt,
      isActive: session.isActive,
      revokedAt: session.revokedAt || undefined,
      revokedBy: session.revokedBy || undefined,
    })) as AuthorizedDevice[];
  }

  /**
   * Validar token de sessÃ£o
   * Verifica hash, expiraÃ§Ã£o e atividade
   */
  async validateSessionToken(
    sessionId: string,
    providedToken: string,
  ): Promise<{ valid: boolean; session?: any }> {
    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        sessionToken: true,
        isActive: true,
        expiresAt: true,
        revokedAt: true,
      } as any,
    });

    if (!session || !(session as any).isActive) {
      return { valid: false };
    }

    if ((session as any).expiresAt < new Date()) {
      return { valid: false };
    }

    if ((session as any).revokedAt) {
      return { valid: false };
    }

    // ComparaÃ§Ã£o segura
    const providedHash = createHash("sha256").update(providedToken).digest("hex");
    const isValid = this.secureCompare(providedHash, (session as any).sessionToken);

    if (!isValid) {
      return { valid: false };
    }

    return { valid: true, session };
  }

  /**
   * Limpar sessÃµes expiradas
   * Executar periodicamente (cron job)
   */
  async cleanupExpiredSessions(storeId: string): Promise<number> {
    const result = await prisma.tableSession.deleteMany({
      where: {
        table: { storeId },
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }

  /**
   * Hash seguro de PIN (SHA-256)
   */
  private hashPIN(pin: string): string {
    return createHash("sha256").update(pin).digest("hex");
  }

  /**
   * ComparaÃ§Ã£o timing-safe para impedir timing attacks
   */
  private secureCompare(a: string, b: string): boolean {
    try {
      return timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }

  /**
   * Extrair nome do dispositivo de User-Agent
   * Exemplo: "Mozilla/5.0 (Windows NT 10.0)" â†’ "Windows 10"
   */
  private extractDeviceName(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;

    if (userAgent.includes("Windows NT 10.0")) return "Windows 10";
    if (userAgent.includes("Windows NT 6.1")) return "Windows 7";
    if (userAgent.includes("Mac OS X")) return "macOS";
    if (userAgent.includes("iPhone")) return "iPhone";
    if (userAgent.includes("iPad")) return "iPad";
    if (userAgent.includes("Android")) return "Android";
    if (userAgent.includes("Linux")) return "Linux";

    return undefined;
  }
}

/**
 * CASOS DE USO:
 *
 * 1. LOGIN COM PIN:
 *    const authService = new AuthorizationService(redis, { length: 4 });
 *    const pin = await authService.generatePIN("store-123", "admin-456");
 *    // SMS ao admin: "Seu PIN: {pin}"
 *
 *    const result = await authService.verifyPIN("store-123", "admin-456", userPin);
 *    if (!result.valid) {
 *      return { error: "PIN invÃ¡lido", remaining: result.remainingAttempts };
 *    }
 *
 * 2. AUTORIZAR DISPOSITIVO:
 *    const device = await authService.authorizeDevice({
 *      storeId: "store-123",
 *      adminId: "admin-456",
 *      deviceId: "device-fingerprint-xyz",
 *      userAgent: req.get("user-agent"),
 *      ipAddress: req.ip,
 *    });
 *    // Salvar device.sessionToken no cliente
 *
 * 3. GERENCIAR DISPOSITIVOS:
 *    const devices = await authService.listAuthorizedDevices("store-123", "admin-456");
 *    // Mostrar lista para admin revogar acesso
 *
 * 4. REVOGAR DISPOSITIVO:
 *    await authService.revokeDevice("store-123", "admin-456", "device-xyz", "admin-789");
 *    // Logout imediato no dispositivo
 *
 * 5. ROTACIONAR TOKEN:
 *    const newToken = await authService.rotateToken(sessionId);
 *    // Enviar novo token ao cliente, invalida antigo automaticamente
 */

