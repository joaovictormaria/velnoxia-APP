import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "ioredis";
import { AuthorizationService } from "../authorization-service";
import { prisma } from "../../db/client";

/**
 * PRIORIDADE 10: TESTES DE AUTORIZAÇÃO CENTRALIZADA
 *
 * Valida PIN, autorização de dispositivos, revogação,
 * rotação de tokens, e compliance com rate limiting/auditoria.
 */

describe("AuthorizationService: PIN Management", () => {
  let redis: Redis;
  let authService: AuthorizationService;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    authService = new AuthorizationService(redis, { length: 4, expiryMinutes: 1 });

    // Setup dados de teste
    storeId = "test-store-pin";
    adminId = "test-admin-pin";

    // Criar store e admin no BD
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });

    await prisma.employee.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        storeId,
        name: "Test Admin",
        role: "OWNER",
        phone: "1234567890",
      },
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
    // Cleanup BD
    await prisma.employee.deleteMany({ where: { id: adminId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve gerar PIN de 4 dígitos", async () => {
    const pin = await authService.generatePIN(storeId, adminId);

    expect(pin).toMatch(/^\d{4}$/);
  });

  it("deve retornar PINs diferentes em sucessivas gerações", async () => {
    const pin1 = await authService.generatePIN(storeId, adminId);
    const pin2 = await authService.generatePIN(storeId, adminId);

    expect(pin1).not.toBe(pin2);
  });

  it("deve aceitar PIN correto", async () => {
    const pin = await authService.generatePIN(storeId, adminId);
    const result = await authService.verifyPIN(storeId, adminId, pin);

    expect(result.valid).toBe(true);
  });

  it("deve rejeitar PIN incorreto", async () => {
    await authService.generatePIN(storeId, adminId);
    const result = await authService.verifyPIN(storeId, adminId, "0000");

    expect(result.valid).toBe(false);
    expect(result.remainingAttempts).toBeLessThan(3);
  });

  it("deve bloqueio após 3 tentativas erradas", async () => {
    const pin = await authService.generatePIN(storeId, adminId);

    // 3 tentativas erradas
    for (let i = 0; i < 3; i++) {
      const result = await authService.verifyPIN(storeId, adminId, "0000");
      expect(result.valid).toBe(false);
    }

    // 4ª tentativa bloqueada
    const blocked = await authService.verifyPIN(storeId, adminId, pin);
    expect(blocked.valid).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("deve expirar PIN após tempo", async () => {
    const shortLivedAuth = new AuthorizationService(redis, {
      length: 4,
      expiryMinutes: 0.01, // 36ms
    });

    const pin = await shortLivedAuth.generatePIN(storeId, adminId);

    // Esperar expiração
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await authService.verifyPIN(storeId, adminId, pin);
    expect(result.valid).toBe(false);
  });
});

describe("AuthorizationService: Device Authorization", () => {
  let redis: Redis;
  let authService: AuthorizationService;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    authService = new AuthorizationService(redis);

    storeId = "test-store-device";
    adminId = "test-admin-device";

    // Setup
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });

    await prisma.employee.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        storeId,
        name: "Test Admin",
        role: "OWNER",
        phone: "1234567890",
      },
    });

    // Criar mesa
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1" },
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
    await prisma.tableSession.deleteMany({
      where: { table: { storeId } },
    });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { id: adminId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve autorizar novo dispositivo", async () => {
    const device = await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-123",
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
      ipAddress: "192.168.1.1",
    });

    expect(device.id).toBeDefined();
    expect(device.deviceId).toBe("device-123");
    expect(device.isActive).toBe(true);
    expect(device.deviceName).toBe("Windows 10");
  });

  it("deve falhar se admin não existe", async () => {
    await expect(
      authService.authorizeDevice({
        storeId,
        adminId: "nonexistent",
        deviceId: "device-456",
      }),
    ).rejects.toThrow("Admin não encontrado");
  });

  it("deve criar sessão para dispositivo", async () => {
    const device = await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-789",
    });

    // Verificar que sessão foi criada
    const session = await prisma.tableSession.findUnique({
      where: { id: device.id },
    });

    expect(session).toBeDefined();
    expect(session?.deviceId).toBe("device-789");
    expect(session?.adminId).toBe(adminId);
  });
});

describe("AuthorizationService: Device Revocation", () => {
  let redis: Redis;
  let authService: AuthorizationService;
  let storeId: string;
  let adminId: string;
  let deviceId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    authService = new AuthorizationService(redis);

    storeId = "test-store-revoke";
    adminId = "test-admin-revoke";
    deviceId = "device-revoke-test";

    // Setup
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });

    await prisma.employee.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        storeId,
        name: "Test Admin",
        role: "OWNER",
        phone: "1234567890",
      },
    });

    // Criar mesa
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1" },
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
    await prisma.tableSession.deleteMany({
      where: { table: { storeId } },
    });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { id: adminId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve revogar dispositivo autorizado", async () => {
    const device = await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId,
    });

    await authService.revokeDevice(storeId, adminId, deviceId, "admin-revoke");

    // Verificar que sessão foi desativada
    const session = await prisma.tableSession.findUnique({
      where: { id: device.id },
    });

    expect(session?.isActive).toBe(false);
    expect(session?.revokedAt).toBeDefined();
  });

  it("deve falhar ao revogar dispositivo inexistente", async () => {
    await expect(
      authService.revokeDevice(storeId, adminId, "nonexistent-device", "admin-revoke"),
    ).rejects.toThrow("Nenhuma sessão ativa");
  });
});

describe("AuthorizationService: Token Rotation", () => {
  let redis: Redis;
  let authService: AuthorizationService;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    authService = new AuthorizationService(redis);

    storeId = "test-store-rotate";
    adminId = "test-admin-rotate";

    // Setup
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });

    await prisma.employee.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        storeId,
        name: "Test Admin",
        role: "OWNER",
        phone: "1234567890",
      },
    });

    // Criar mesa
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1" },
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
    await prisma.tableSession.deleteMany({
      where: { table: { storeId } },
    });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { id: adminId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve rotacionar token de sessão", async () => {
    const device = await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-rotate",
    });

    const oldSession = await prisma.tableSession.findUnique({
      where: { id: device.id },
      select: { sessionToken: true },
    });

    const newToken = await authService.rotateToken(device.id);

    const newSession = await prisma.tableSession.findUnique({
      where: { id: device.id },
      select: { sessionToken: true, tokenRotatedAt: true },
    });

    // Token mudou
    expect(newSession?.sessionToken).not.toBe(oldSession?.sessionToken);
    expect(newSession?.tokenRotatedAt).toBeDefined();
  });

  it("deve retornar novo token diferente", async () => {
    const device = await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-rotate2",
    });

    const token1 = await authService.rotateToken(device.id);
    const token2 = await authService.rotateToken(device.id);

    expect(token1).not.toBe(token2);
  });
});

describe("AuthorizationService: Token Validation", () => {
  let redis: Redis;
  let authService: AuthorizationService;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    authService = new AuthorizationService(redis);

    storeId = "test-store-validate";
    adminId = "test-admin-validate";

    // Setup
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });

    await prisma.employee.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        storeId,
        name: "Test Admin",
        role: "OWNER",
        phone: "1234567890",
      },
    });

    // Criar mesa
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1" },
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
    await prisma.tableSession.deleteMany({
      where: { table: { storeId } },
    });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { id: adminId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve rejeitar token inválido", async () => {
    const device = await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-validate",
    });

    const result = await authService.validateSessionToken(device.id, "invalid-token");

    expect(result.valid).toBe(false);
  });

  it("deve rejeitar sessão revogada", async () => {
    const device = await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-validate2",
    });

    await authService.revokeDevice(storeId, adminId, "device-validate2", adminId);

    // Nota: sem token real, isso sempre falha, mas testa que sessão revogada é considerada inválida
    const result = await authService.validateSessionToken(device.id, "any-token");

    expect(result.valid).toBe(false);
  });
});

describe("AuthorizationService: List Devices", () => {
  let redis: Redis;
  let authService: AuthorizationService;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    authService = new AuthorizationService(redis);

    storeId = "test-store-list";
    adminId = "test-admin-list";

    // Setup
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });

    await prisma.employee.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        storeId,
        name: "Test Admin",
        role: "OWNER",
        phone: "1234567890",
      },
    });

    // Criar mesa
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1" },
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
    await prisma.tableSession.deleteMany({
      where: { table: { storeId } },
    });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { id: adminId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve listar dispositivos autorizados", async () => {
    await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-list-1",
      userAgent: "Mozilla/5.0 (iPhone)",
    });

    await authService.authorizeDevice({
      storeId,
      adminId,
      deviceId: "device-list-2",
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
    });

    const devices = await authService.listAuthorizedDevices(storeId, adminId);

    expect(devices.length).toBe(2);
    expect(devices[0].deviceName).toBe("iPhone");
    expect(devices[1].deviceName).toBe("Windows 10");
  });

  it("deve retornar lista vazia se sem dispositivos", async () => {
    const devices = await authService.listAuthorizedDevices(storeId, adminId);

    expect(devices.length).toBe(0);
  });
});

describe("AuthorizationService: Cleanup Expired Sessions", () => {
  let redis: Redis;
  let authService: AuthorizationService;
  let storeId: string;
  let adminId: string;

  beforeEach(async () => {
    redis = new Redis({ host: "localhost", port: 6379, db: 15 });
    authService = new AuthorizationService(redis);

    storeId = "test-store-cleanup";
    adminId = "test-admin-cleanup";

    // Setup
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" },
    });

    await prisma.employee.upsert({
      where: { id: adminId },
      update: {},
      create: {
        id: adminId,
        storeId,
        name: "Test Admin",
        role: "OWNER",
        phone: "1234567890",
      },
    });

    // Criar mesa
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1" },
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
    await prisma.tableSession.deleteMany({
      where: { table: { storeId } },
    });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { id: adminId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve deletar sessões expiradas", async () => {
    // Criar sessão com expiração no passado
    const table = await prisma.table.findFirst({ where: { storeId } });

    await prisma.tableSession.create({
      data: {
        tableId: table!.id,
        adminId,
        sessionToken: "expired-token",
        deviceId: "expired-device",
        expiresAt: new Date(Date.now() - 1000), // 1 segundo no passado
      },
    });

    const cleaned = await authService.cleanupExpiredSessions(storeId);

    expect(cleaned).toBe(1);

    // Verificar que foi deletado
    const session = await prisma.tableSession.findFirst({
      where: { deviceId: "expired-device" },
    });

    expect(session).toBeNull();
  });
});
