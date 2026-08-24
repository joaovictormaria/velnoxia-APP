import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../db/client";
import { InventoryService } from "../inventory-service";

/**
 * PRIORIDADE 12: TESTES DE EVOLUÇÃO DE ESTOQUE
 *
 * Valida tracking automático, reservas, consumo,
 * alertas de baixo estoque e histórico de movimentação.
 */

describe("InventoryService: Stock Tracking", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let productId: string;
  let adminId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-inv";
    adminId = "test-admin-inv";

    // Setup store
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    // Setup product
    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Test Product",
        slug: "test-product",
        basePrice: 25.0,
      },
    });
    productId = product.id;
  });

  afterEach(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { storeId } });
    await (prisma as any).productInventory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve criar estoque inicial ao repor", async () => {
    const inventory = await inventoryService.restockProduct(
      storeId,
      productId,
      50,
      adminId,
      "Pedido inicial",
    );

    expect(inventory.quantity).toBe(50);
    expect(inventory.available).toBe(50);
    expect(inventory.reserved).toBe(0);
  });

  it("deve rejeitar reposição com quantidade negativa", async () => {
    await expect(
      inventoryService.restockProduct(storeId, productId, -10, adminId),
    ).rejects.toThrow("maior que 0");
  });

  it("deve registrar movimento de reposição", async () => {
    await inventoryService.restockProduct(
      storeId,
      productId,
      30,
      adminId,
      "Ref-001",
    );

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId },
    });

    expect(movements.length).toBe(1);
    expect(movements[0].movementType).toBe("RESTOCK");
    expect(movements[0].quantity).toBe(30);
    expect(movements[0].reference).toBe("Ref-001");
  });

  it("deve acumular múltiplas reposições", async () => {
    await inventoryService.restockProduct(storeId, productId, 30, adminId);
    const inv2 = await inventoryService.restockProduct(
      storeId,
      productId,
      20,
      adminId,
    );

    expect(inv2.quantity).toBe(50);
  });
});

describe("InventoryService: Stock Reservation", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let productId: string;
  let adminId: string;
  let orderId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-reserve";
    adminId = "test-admin-reserve";
    orderId = "order-test-123";

    // Setup
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Test Product",
        slug: "test-prod",
        basePrice: 25.0,
      },
    });
    productId = product.id;

    // Estoque inicial
    await inventoryService.restockProduct(storeId, productId, 50, adminId);
  });

  afterEach(async () => {
    await (prisma as any).stockReservation.deleteMany({ where: { orderId } });
    await prisma.inventoryMovement.deleteMany({ where: { storeId } });
    await (prisma as any).productInventory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve reservar estoque disponível", async () => {
    const result = await inventoryService.reserveStock(storeId, orderId, [
      { productId, quantity: 10 },
    ]);

    expect(result.success).toBe(true);
  });

  it("deve bloquear reserva se estoque insuficiente", async () => {
    const result = await inventoryService.reserveStock(storeId, orderId, [
      { productId, quantity: 100 }, // Mais que 50 disponível
    ]);

    expect(result.success).toBe(false);
    expect(result.unavailableItems).toContain(productId);
  });

  it("deve contar quantidade reservada como indisponível", async () => {
    // Reservar 30
    await inventoryService.reserveStock(storeId, orderId, [
      { productId, quantity: 30 },
    ]);

    // Tentar reservar mais 25 (total 55, mas máximo 50)
    const result = await inventoryService.reserveStock(
      storeId,
      `order-2`,
      [{ productId, quantity: 25 }],
    );

    expect(result.success).toBe(false);
  });

  it("deve permitir reservar 20 se 30 já reservados", async () => {
    await inventoryService.reserveStock(storeId, orderId, [
      { productId, quantity: 30 },
    ]);

    const result = await inventoryService.reserveStock(
      storeId,
      "order-2",
      [{ productId, quantity: 20 }],
    );

    expect(result.success).toBe(true);
  });

  it("deve liberar reserva ao cancelar pedido", async () => {
    await inventoryService.reserveStock(storeId, orderId, [
      { productId, quantity: 30 },
    ]);

    await inventoryService.releaseReservation(orderId, adminId);

    // Agora deve conseguir reservar 30 novamente
    const result = await inventoryService.reserveStock(
      storeId,
      "order-new",
      [{ productId, quantity: 30 }],
    );

    expect(result.success).toBe(true);
  });
});

describe("InventoryService: Stock Consumption", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let productId: string;
  let orderId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-consume";
    orderId = "order-consume-123";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Test Product",
        slug: "test-consume",
        basePrice: 25.0,
      },
    });
    productId = product.id;

    await inventoryService.restockProduct(storeId, productId, 100, "admin");
  });

  afterEach(async () => {
    await (prisma as any).stockReservation.deleteMany({ where: { orderId } });
    await prisma.inventoryMovement.deleteMany({ where: { storeId } });
    await (prisma as any).productInventory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve deduzir estoque ao consumir", async () => {
    await inventoryService.consumeStock(storeId, orderId, [
      { productId, quantity: 25 },
    ]);

    const inventory = await inventoryService.getProductInventory(
      storeId,
      productId,
    );

    expect(inventory?.quantity).toBe(75);
  });

  it("deve remover reserva após consumo", async () => {
    await inventoryService.reserveStock(storeId, orderId, [
      { productId, quantity: 20 },
    ]);

    let inventory = await inventoryService.getProductInventory(
      storeId,
      productId,
    );
    expect(inventory?.available).toBe(80); // 100 - 20 reserved

    await inventoryService.consumeStock(storeId, orderId, [
      { productId, quantity: 20 },
    ]);

    inventory = await inventoryService.getProductInventory(
      storeId,
      productId,
    );
    expect(inventory?.quantity).toBe(80);
    expect(inventory?.reserved).toBe(0); // Reserva removida
    expect(inventory?.available).toBe(80);
  });

  it("deve registrar movimento CONSUME", async () => {
    await inventoryService.consumeStock(storeId, orderId, [
      { productId, quantity: 15 },
    ]);

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId, movementType: "CONSUME" },
    });

    expect(movements.length).toBe(1);
    expect(movements[0].quantity).toBe(-15); // Negativo
    expect(movements[0].reference).toBe(orderId);
  });
});

describe("InventoryService: Stock Adjustments", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let productId: string;
  let adminId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-adjust";
    adminId = "admin-adjust";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Test Product",
        slug: "test-adjust",
        basePrice: 25.0,
      },
    });
    productId = product.id;

    await inventoryService.restockProduct(storeId, productId, 50, adminId);
  });

  afterEach(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { storeId } });
    await (prisma as any).productInventory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve ajustar estoque positivamente", async () => {
    const inv = await inventoryService.adjustStock(
      storeId,
      productId,
      5,
      "Ajuste de contagem",
      adminId,
    );

    expect(inv.quantity).toBe(55);
  });

  it("deve ajustar estoque negativamente", async () => {
    const inv = await inventoryService.adjustStock(
      storeId,
      productId,
      -10,
      "Dano na cozinha",
      adminId,
    );

    expect(inv.quantity).toBe(40);
  });

  it("deve classificar movimento como DAMAGE", async () => {
    await inventoryService.adjustStock(
      storeId,
      productId,
      -5,
      "Dano reportado",
      adminId,
    );

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId, movementType: "DAMAGE" },
    });

    expect(movements.length).toBe(1);
  });

  it("deve classificar movimento como RETURN", async () => {
    await inventoryService.adjustStock(
      storeId,
      productId,
      10,
      "Devolução de cliente",
      adminId,
    );

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId, movementType: "RETURN" },
    });

    expect(movements.length).toBe(1);
  });
});

describe("InventoryService: Low Stock Alerts", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let productId: string;
  let adminId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-alert";
    adminId = "admin-alert";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Test Product",
        slug: "test-alert",
        basePrice: 25.0,
      },
    });
    productId = product.id;

    await inventoryService.restockProduct(storeId, productId, 50, adminId);
  });

  afterEach(async () => {
    await prisma.inventoryAlert.deleteMany({ where: { storeId } });
    await prisma.inventoryMovement.deleteMany({ where: { storeId } });
    await (prisma as any).productInventory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve definir threshold de baixo estoque", async () => {
    await inventoryService.setLowStockThreshold(
      storeId,
      productId,
      10,
      adminId,
    );

    const inv = await inventoryService.getProductInventory(
      storeId,
      productId,
    );

    expect(inv?.lowStockThreshold).toBe(10);
  });

  it("deve detectar LOW_STOCK quando abaixo do threshold", async () => {
    await inventoryService.setLowStockThreshold(
      storeId,
      productId,
      15,
      adminId,
    );

    // Reduzir para 10
    await inventoryService.adjustStock(
      storeId,
      productId,
      -40,
      "Consumo",
      adminId,
    );

    const alerts = await inventoryService.checkLowStockAlerts(storeId);

    const alert = alerts.find((a) => a.productId === productId);
    expect(alert?.alertType).toBe("LOW_STOCK");
    expect(alert?.currentQuantity).toBe(10);
  });

  it("deve detectar OUT_OF_STOCK quando quantidade é zero", async () => {
    // Consumir tudo
    await inventoryService.adjustStock(
      storeId,
      productId,
      -50,
      "Consumo total",
      adminId,
    );

    const alerts = await inventoryService.checkLowStockAlerts(storeId);

    const alert = alerts.find((a) => a.productId === productId);
    expect(alert?.alertType).toBe("OUT_OF_STOCK");
    expect(alert?.currentQuantity).toBe(0);
  });

  it("não deve gerar alerta se acima do threshold", async () => {
    await inventoryService.setLowStockThreshold(
      storeId,
      productId,
      10,
      adminId,
    );

    const alerts = await inventoryService.checkLowStockAlerts(storeId);

    expect(alerts.length).toBe(0); // Nenhum alerta (estoque em 50)
  });
});

describe("InventoryService: Inventory Report", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let product1: string;
  let product2: string;
  let adminId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-report";
    adminId = "admin-report";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const prod1 = await prisma.product.create({
      data: {
        storeId,
        name: "Produto 1",
        slug: "prod-1",
        basePrice: 25.0,
      },
    });
    product1 = prod1.id;

    const prod2 = await prisma.product.create({
      data: {
        storeId,
        name: "Produto 2",
        slug: "prod-2",
        basePrice: 30.0,
      },
    });
    product2 = prod2.id;

    // Estoque inicial
    await inventoryService.restockProduct(storeId, product1, 50, adminId);
    await inventoryService.restockProduct(storeId, product2, 10, adminId);

    // Definir threshold
    await inventoryService.setLowStockThreshold(storeId, product2, 15, adminId);
  });

  afterEach(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { storeId } });
    await (prisma as any).productInventory.deleteMany({
      where: { productId: { in: [product1, product2] } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: [product1, product2] } },
    });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve retornar relatório completo de estoque", async () => {
    const report = await inventoryService.getInventoryReport(storeId);

    expect(report.length).toBe(2);
  });

  it("deve filtrar apenas produtos com baixo estoque", async () => {
    const report = await inventoryService.getInventoryReport(storeId, {
      lowStockOnly: true,
    });

    expect(report.length).toBe(1);
    expect(report[0].productId).toBe(product2);
  });

  it("deve incluir nome do produto no relatório", async () => {
    const report = await inventoryService.getInventoryReport(storeId);

    expect(report[0].productName).toBeDefined();
  });
});

describe("InventoryService: Movement History", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let productId: string;
  let adminId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-history";
    adminId = "admin-history";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Test Product",
        slug: "test-hist",
        basePrice: 25.0,
      },
    });
    productId = product.id;
  });

  afterEach(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { storeId } });
    await (prisma as any).productInventory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve retornar histórico de movimentação", async () => {
    await inventoryService.restockProduct(storeId, productId, 50, adminId);
    await inventoryService.adjustStock(
      storeId,
      productId,
      -10,
      "Teste",
      adminId,
    );

    const history = await inventoryService.getMovementHistory(
      storeId,
      productId,
    );

    expect(history.length).toBe(2);
    expect(history[0].movementType).toBe("ADJUSTMENT");
    expect(history[1].movementType).toBe("RESTOCK");
  });
});

describe("InventoryService: Cleanup Expired Reservations", () => {
  let inventoryService: InventoryService;
  let storeId: string;
  let productId: string;

  beforeEach(async () => {
    inventoryService = new InventoryService();
    storeId = "test-store-cleanup-inv";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Test Product",
        slug: "test-cleanup",
        basePrice: 25.0,
      },
    });
    productId = product.id;

    // Criar inventário
    await (prisma as any).productInventory.create({
      data: {
        productId,
        storeId,
        quantity: 100,
        lowStockThreshold: 10,
        lastRestocked: new Date(),
      },
    });
  });

  afterEach(async () => {
    await (prisma as any).stockReservation.deleteMany({});
    await (prisma as any).productInventory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve deletar reservas expiradas", async () => {
    // Criar reserva expirada
    await (prisma as any).stockReservation.create({
      data: {
        orderId: "order-expired",
        productId,
        quantity: 10,
        expiresAt: new Date(Date.now() - 1000), // 1 segundo no passado
      },
    });

    const cleaned = await inventoryService.cleanupExpiredReservations();

    expect(cleaned).toBe(1);
  });
});
