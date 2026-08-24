import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/server/db/client";
import {
  getOrCreateOpenTableSession,
  validateTableSessionPin,
  authorizeDeviceForSession,
} from "@/server/services/table-session-service";
import { generatePin, hashPin, verifyPin } from "@/server/auth/pin";

describe("PIN Security - IDOR and Cross-Store Tests", () => {
  let storeId1: string;
  let storeId2: string;
  let tableId1_store1: string;
  let tableId2_store1: string;
  let tableId1_store2: string;
  let sessionId1: string;
  let sessionId2: string;
  let pin1: string;
  let pin2: string;

  beforeEach(async () => {
    // STORE 1
    const store1 = await prisma.store.create({
      data: { slug: `pin-security-store1-${Date.now()}`, name: "Store 1" },
    });
    storeId1 = store1.id;

    // STORE 1 - TABLE 1
    tableId1_store1 = `table1-store1-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId1_store1,
        storeId: storeId1,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr1",
        qrcodeData: "data1",
      },
    });

    // STORE 1 - TABLE 2
    tableId2_store1 = `table2-store1-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId2_store1,
        storeId: storeId1,
        number: 2,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr2",
        qrcodeData: "data2",
      },
    });

    // STORE 2
    const store2 = await prisma.store.create({
      data: { slug: `pin-security-store2-${Date.now()}`, name: "Store 2" },
    });
    storeId2 = store2.id;

    // STORE 2 - TABLE 1
    tableId1_store2 = `table1-store2-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId1_store2,
        storeId: storeId2,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr1s2",
        qrcodeData: "data1s2",
      },
    });

    // Create sessions with PINs
    const session1 = await getOrCreateOpenTableSession(storeId1, tableId1_store1);
    sessionId1 = session1.id;

    const session2 = await getOrCreateOpenTableSession(storeId1, tableId2_store1);
    sessionId2 = session2.id;

    // Extract PINs by logging and re-generating (hacky but shows the issue)
    pin1 = generatePin(); // Simulating knowledge of PIN
    pin2 = generatePin();
  });

  afterEach(async () => {
    await prisma.sessionDevice.deleteMany({});
    await prisma.tableSession.deleteMany({});
    await prisma.table.deleteMany({});
    await prisma.storeSettings.deleteMany({});
    await prisma.store.deleteMany({});
  });

  // ============ CASOS VÁLIDOS ============

  it("[PASS] PIN correto + mesa correta → Deve permitir", async () => {
    // Get actual PIN from session
    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId1 },
      select: { pinHash: true },
    });

    // We can't actually test with real PIN since it's not exposed
    // But the validation function should accept any correct PIN
    const testPin = "1234"; // In real scenario, this would be the actual PIN
    const hashOfTestPin = await hashPin(testPin);

    // Simulate session with this PIN
    await prisma.tableSession.update({
      where: { id: sessionId1 },
      data: { pinHash: hashOfTestPin },
    });

    const result = await validateTableSessionPin(storeId1, sessionId1, testPin);
    expect(result.ok).toBe(true);
  });

  // ============ CASOS DE IDOR - MESMA LOJA, MESAS DIFERENTES ============

  it("[BLOCK] PIN1 (mesa1) + validar em mesa2 → Deve bloquear", async () => {
    const testPin = "1111";
    const hashForSession1 = await hashPin(testPin);

    // Set PIN for session 1
    await prisma.tableSession.update({
      where: { id: sessionId1 },
      data: { pinHash: hashForSession1 },
    });

    // Set DIFFERENT PIN for session 2
    const diffPin = "2222";
    const hashForSession2 = await hashPin(diffPin);
    await prisma.tableSession.update({
      where: { id: sessionId2 },
      data: { pinHash: hashForSession2 },
    });

    // Try to use PIN1 to access session 2
    const result = await validateTableSessionPin(storeId1, sessionId2, testPin);

    // DEVE SER BLOQUEADO
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ============ CASOS DE IDOR - LOJAS DIFERENTES ============

  it("[BLOCK] PIN mesmo valor em lojas diferentes → Deve bloquear", async () => {
    const testPin = "3333";

    // Set PIN para session em store1
    await prisma.tableSession.update({
      where: { id: sessionId1 },
      data: { pinHash: await hashPin(testPin) },
    });

    // Criar session em store2 com MESMO PIN
    const session_store2 = await getOrCreateOpenTableSession(
      storeId2,
      tableId1_store2
    );
    await prisma.tableSession.update({
      where: { id: session_store2.id },
      data: { pinHash: await hashPin(testPin) },
    });

    // Tentar acessar session de store1 usando sessionId de store2
    const result = await validateTableSessionPin(storeId1, session_store2.id, testPin);

    // DEVE SER BLOQUEADO (loja diferente)
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Não autorizado");
  });

  // ============ CASOS DE BRUTE FORCE ============

  it("[BLOCK] Múltiplas tentativas erradas (rate limit) → Deve bloquear", async () => {
    const correctPin = "4444";
    const wrongPin = "0000";

    await prisma.tableSession.update({
      where: { id: sessionId1 },
      data: { pinHash: await hashPin(correctPin) },
    });

    // Tentativas erradas
    const attempt1 = await validateTableSessionPin(storeId1, sessionId1, wrongPin);
    expect(attempt1.ok).toBe(false);

    const attempt2 = await validateTableSessionPin(storeId1, sessionId1, wrongPin);
    expect(attempt2.ok).toBe(false);

    const attempt3 = await validateTableSessionPin(storeId1, sessionId1, wrongPin);
    expect(attempt3.ok).toBe(false);

    // 4ª tentativa deve estar rate-limited
    const attempt4 = await validateTableSessionPin(storeId1, sessionId1, correctPin);
    expect(attempt4.ok).toBe(false);
    expect(attempt4.error).toContain("Muitas tentativas");
  });

  // ============ CASOS COM SESSÃO EXPIRADA ============

  it("[BLOCK] PIN correto + sessão expirada → Deve bloquear", async () => {
    const testPin = "5555";

    // Criar sessão que já expirou
    const expiredSession = await prisma.tableSession.create({
      data: {
        storeId: storeId1,
        tableId: tableId1_store1,
        pinHash: await hashPin(testPin),
        status: "OPEN",
        expiresAt: new Date(Date.now() - 1000), // Already expired
      },
    });

    const result = await validateTableSessionPin(
      storeId1,
      expiredSession.id,
      testPin
    );

    // DEVE SER BLOQUEADO
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expirou");
  });

  // ============ CASOS COM SESSÃO ENCERRADA ============

  it("[BLOCK] PIN correto + sessão CLOSED → Deve bloquear", async () => {
    const testPin = "6666";

    // Criar sessão e depois fechar
    await prisma.tableSession.update({
      where: { id: sessionId1 },
      data: {
        pinHash: await hashPin(testPin),
        status: "CLOSED",
      },
    });

    const result = await validateTableSessionPin(storeId1, sessionId1, testPin);

    // DEVE SER BLOQUEADO
    expect(result.ok).toBe(false);
    expect(result.error).toContain("não está mais aberta");
  });

  // ============ CASOS COM PIN INVÁLIDO ============

  it("[BLOCK] PIN com formato inválido → Deve bloquear", async () => {
    const result1 = await validateTableSessionPin(storeId1, sessionId1, "123"); // Muito curto
    expect(result1.ok).toBe(false);

    const result2 = await validateTableSessionPin(storeId1, sessionId1, "12345"); // Muito longo
    expect(result2.ok).toBe(false);

    const result3 = await validateTableSessionPin(storeId1, sessionId1, "abcd"); // Não numérico
    expect(result3.ok).toBe(false);
  });

  // ============ CASOS COM DEVICE TOKENS ============

  it("[PASS] Device autorizado com PIN correto pode fazer pedidos", async () => {
    const testPin = "7777";

    await prisma.tableSession.update({
      where: { id: sessionId1 },
      data: { pinHash: await hashPin(testPin) },
    });

    // Validar PIN
    const validation = await validateTableSessionPin(
      storeId1,
      sessionId1,
      testPin
    );
    expect(validation.ok).toBe(true);

    // Autorizar device
    const device = await authorizeDeviceForSession(storeId1, sessionId1, false);
    expect(device.deviceToken).toBeDefined();

    // Device está autorizado para aquela sessão
    const authorizedDevice = await prisma.sessionDevice.findUnique({
      where: { deviceTokenHash: require("crypto").createHash("sha256").update(device.deviceToken).digest("base64") },
    });

    expect(authorizedDevice?.sessionId).toBe(sessionId1);
  });

  // ============ CASOS DE DEVICE SPAM ============

  it("[BLOCK] Autorizar múltiplos devices sem limite pode ser problema", async () => {
    const testPin = "8888";

    await prisma.tableSession.update({
      where: { id: sessionId1 },
      data: { pinHash: await hashPin(testPin) },
    });

    // Validar PIN uma vez
    const validation = await validateTableSessionPin(
      storeId1,
      sessionId1,
      testPin
    );
    expect(validation.ok).toBe(true);

    // Autorizar múltiplos devices - DEVERIA TER LIMITE
    const devices = [];
    for (let i = 0; i < 10; i++) {
      const device = await authorizeDeviceForSession(storeId1, sessionId1, false);
      devices.push(device);
    }

    // Contar devices autorizados
    const deviceCount = await prisma.sessionDevice.count({
      where: { sessionId: sessionId1, revokedAt: null },
    });

    // ⚠️ ACHADO: Não há limite de devices por sessão
    // Este teste passa (não deveria)
    expect(deviceCount).toBe(10); // PROBLEMA: Deveria ter limite
  });
});
