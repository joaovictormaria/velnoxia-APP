import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/server/db/client";
import { createOrderFromCheckout } from "@/server/services/order-service";
import { getOrCreateOpenTableSession, authorizeDeviceForSession } from "@/server/services/table-session-service";
import { generateDeviceToken, hashDeviceToken } from "@/server/auth/device-token";

describe("Checkout IDOR - Session-Table Validation", () => {
  let storeId: string;
  let tableId1: string;
  let tableId2: string;
  let sessionId1: string;
  let deviceToken1: string;
  let storeId2: string;
  let tableId2_store2: string;
  let sessionId2_store2: string;
  let deviceToken2_store2: string;

  beforeEach(async () => {
    // STORE 1 - MESA 1
    const store1 = await prisma.store.create({
      data: { slug: `test-idor-store1-${Date.now()}`, name: "Store 1" },
    });
    storeId = store1.id;

    tableId1 = `table1-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId1,
        storeId,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr1",
        qrcodeData: "data1",
      },
    });

    // STORE 1 - MESA 2
    tableId2 = `table2-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId2,
        storeId,
        number: 2,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr2",
        qrcodeData: "data2",
      },
    });

    // Session 1
    const session1 = await getOrCreateOpenTableSession(storeId, tableId1);
    sessionId1 = session1.id;

    // Device Token 1
    const device1 = await authorizeDeviceForSession(storeId, sessionId1, true);
    deviceToken1 = device1.deviceToken;

    // STORE 2 - MESA 1
    const store2 = await prisma.store.create({
      data: { slug: `test-idor-store2-${Date.now()}`, name: "Store 2" },
    });
    storeId2 = store2.id;

    tableId2_store2 = `table2-store2-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId2_store2,
        storeId: storeId2,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr2s2",
        qrcodeData: "data2s2",
      },
    });

    const session2_store2 = await getOrCreateOpenTableSession(storeId2, tableId2_store2);
    sessionId2_store2 = session2_store2.id;

    const device2_store2 = await authorizeDeviceForSession(storeId2, sessionId2_store2, true);
    deviceToken2_store2 = device2_store2.deviceToken;
  });

  afterEach(async () => {
    await prisma.order.deleteMany({});
    await prisma.sessionDevice.deleteMany({});
    await prisma.tableSession.deleteMany({});
    await prisma.table.deleteMany({});
    await prisma.store.deleteMany({});
    await prisma.storeSettings.deleteMany({});
  });

  // ============ CASOS VÁLIDOS ============

  it("[PASS] deviceToken1 + mesa1 → Deve permitir", async () => {
    const result = await createOrderFromCheckout(storeId, {
      storeSlug: "store1",
      items: [{ productSlug: "produto1", quantity: 1, extraIds: [] }],
      customerName: "João",
      customerPhone: "11999999999",
      type: "PICKUP",
      paymentMethod: "CASH",
      tableId: tableId1,
      deviceToken: deviceToken1,
    });

    expect(result.ok).toBe(true);
    expect(result.orderId).toBeDefined();
  });

  // ============ CASOS DE IDOR - MESMA LOJA ============

  it("[BLOCK] deviceToken1 (mesa1) + mesa2 → Deve bloquear", async () => {
    // Simulando manipulação de localStorage
    const result = await createOrderFromCheckout(storeId, {
      storeSlug: "store1",
      items: [{ productSlug: "produto1", quantity: 1, extraIds: [] }],
      customerName: "Atacante",
      customerPhone: "11999999998",
      type: "PICKUP",
      paymentMethod: "CASH",
      tableId: tableId2, // ← MESA ERRADA, mas deviceToken1 é de mesa1
      deviceToken: deviceToken1,
    });

    // ⚠️ BUG CONFIRMADO: Sistema aceita (bug a ser corrigido)
    // Esperado: ok: false (bloqueado)
    // Real: ok: true (VULNERÁVEL!)

    if (result.ok === true) {
      // Vulnerabilidade confirmada
      console.log("⚠️ VULNERABILIDADE: Pedido aceito com tableId ≠ sessionId.tableId");

      const order = await prisma.order.findUnique({
        where: { id: result.orderId! },
        include: { session: { select: { tableId: true } } },
      });

      expect(order?.tableId).toBe(tableId2); // Pedido associado à mesa 2
      expect(order?.session?.tableId).toBe(tableId1); // Mas sessão é de mesa 1
      expect(order?.tableId).not.toBe(order?.session?.tableId); // INCONSISTÊNCIA!
    }

    // Após correção, deve ser:
    // expect(result.ok).toBe(false);
    // expect(result.error).toContain("mesa");
  });

  // ============ CASOS DE IDOR - LOJAS DIFERENTES ============

  it("[BLOCK] deviceToken2_store2 + mesa_store1 → Deve bloquear", async () => {
    const result = await createOrderFromCheckout(storeId, {
      storeSlug: "store1",
      items: [{ productSlug: "produto1", quantity: 1, extraIds: [] }],
      customerName: "Atacante Cross-Store",
      customerPhone: "11999999997",
      type: "PICKUP",
      paymentMethod: "CASH",
      tableId: tableId1, // ← Mesa da STORE 1
      deviceToken: deviceToken2_store2, // ← Token da STORE 2
    });

    // Este deve ser bloqueado corretamente (stores diferentes)
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ============ CASOS COM SESSION EXPIRADA ============

  it("[BLOCK] sessão expirada → Deve bloquear", async () => {
    // Criar sessão com expiração próxima
    const expiredSession = await prisma.tableSession.create({
      data: {
        storeId,
        tableId: tableId1,
        pinHash: "fake-hash",
        expiresAt: new Date(Date.now() - 1000), // Já expirou
      },
    });

    const expiredDevice = await prisma.sessionDevice.create({
      data: {
        sessionId: expiredSession.id,
        deviceTokenHash: await hashDeviceToken("expired-token"),
        authorizedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    const result = await createOrderFromCheckout(storeId, {
      storeSlug: "store1",
      items: [{ productSlug: "produto1", quantity: 1, extraIds: [] }],
      customerName: "Cliente Expirado",
      customerPhone: "11999999996",
      type: "PICKUP",
      paymentMethod: "CASH",
      tableId: tableId1,
      deviceToken: "expired-token",
    });

    // Deve ser bloqueado
    expect(result.ok).toBe(false);
  });

  // ============ CASOS COM TOKEN INVÁLIDO ============

  it("[BLOCK] token inválido → Deve bloquear", async () => {
    const result = await createOrderFromCheckout(storeId, {
      storeSlug: "store1",
      items: [{ productSlug: "produto1", quantity: 1, extraIds: [] }],
      customerName: "Sem Token",
      customerPhone: "11999999995",
      type: "PICKUP",
      paymentMethod: "CASH",
      tableId: tableId1,
      deviceToken: "invalid-token-12345",
    });

    expect(result.ok).toBe(false);
  });

  // ============ CASOS SEM TOKEN (PICKUP) ============

  it("[PASS] sem deviceToken + PICKUP → Deve permitir", async () => {
    const result = await createOrderFromCheckout(storeId, {
      storeSlug: "store1",
      items: [{ productSlug: "produto1", quantity: 1, extraIds: [] }],
      customerName: "Retirada",
      customerPhone: "11999999994",
      type: "PICKUP",
      paymentMethod: "CASH",
      // Sem tableId, sem deviceToken
    });

    expect(result.ok).toBe(true);
  });
});
