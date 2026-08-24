import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../db/client";
import { TableManagementService, TableStatus } from "../table-management-service";

/**
 * PRIORIDADE 13: TESTES DE DINE-IN AVANÇADO
 *
 * Valida gerenciamento de mesas, transições de status,
 * histórico de ocupação e analytics.
 */

describe("TableManagementService: Table State", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let tableId: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-dine";

    // Setup store
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    // Setup table
    const table = await prisma.table.create({
      data: {
        storeId,
        number: 1,
        qrCode: "qr-001",
        capacity: 4,
        status: TableStatus.EMPTY,
      },
    });
    tableId = table.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({ where: { tableId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve retornar estado inicial da mesa", async () => {
    const state = await tableService.getTableState(storeId, tableId);

    expect(state?.status).toBe(TableStatus.EMPTY);
    expect(state?.number).toBe(1);
    expect(state?.capacity).toBe(4);
    expect(state?.isActive).toBe(true);
    expect(state?.occupiedSince).toBeUndefined();
  });

  it("deve retornar null para mesa inexistente", async () => {
    const state = await tableService.getTableState(storeId, "nonexistent");

    expect(state).toBeNull();
  });

  it("deve retornar null para mesa deletada", async () => {
    await prisma.table.update({
      where: { id: tableId },
      data: { deletedAt: new Date() },
    });

    const state = await tableService.getTableState(storeId, tableId);

    expect(state).toBeNull();
  });
});

describe("TableManagementService: Occupancy", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let tableId: string;
  let customerId: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-occupy";
    customerId = "customer-123";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const table = await prisma.table.create({
      data: {
        storeId,
        number: 2,
        qrCode: "qr-002",
        status: TableStatus.EMPTY,
      },
    });
    tableId = table.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({ where: { tableId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve ocupar mesa vazia", async () => {
    const state = await tableService.occupyTable(
      storeId,
      tableId,
      customerId,
      "admin",
    );

    expect(state.status).toBe(TableStatus.OCCUPIED);
    expect(state.occupiedSince).toBeDefined();
  });

  it("deve criar registro de ocupação", async () => {
    await tableService.occupyTable(storeId, tableId, customerId);

    const occupancy = await (prisma as any).tableOccupancy.findFirst({
      where: { tableId },
    });

    expect(occupancy?.customerId).toBe(customerId);
    expect(occupancy?.checkInAt).toBeDefined();
    expect(occupancy?.checkOutAt).toBeNull();
  });

  it("deve rejeitar ocupação de mesa já ocupada", async () => {
    await tableService.occupyTable(storeId, tableId, customerId);

    await expect(
      tableService.occupyTable(storeId, tableId, "another-customer"),
    ).rejects.toThrow("não está vazia");
  });

  it("deve calcular duração de ocupação", async () => {
    await tableService.occupyTable(storeId, tableId, customerId);

    // Esperar um pouco
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state = await tableService.getTableState(storeId, tableId);

    expect(state?.occupancyDurationMinutes).toBeGreaterThanOrEqual(0);
  });
});

describe("TableManagementService: Status Transitions", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let tableId: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-status";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const table = await prisma.table.create({
      data: {
        storeId,
        number: 3,
        qrCode: "qr-003",
        status: TableStatus.EMPTY,
      },
    });
    tableId = table.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({ where: { tableId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve mudar de EMPTY para OCCUPIED", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");

    const state = await tableService.getTableState(storeId, tableId);
    expect(state?.status).toBe(TableStatus.OCCUPIED);
  });

  it("deve mudar de OCCUPIED para WAITING", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");
    const state = await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.WAITING,
      "admin",
    );

    expect(state.status).toBe(TableStatus.WAITING);
  });

  it("deve mudar de WAITING para SERVED", async () => {
    await tableService.occupyTable(storeId, tableId);
    await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.WAITING,
      "admin",
    );
    const state = await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.SERVED,
      "admin",
    );

    expect(state.status).toBe(TableStatus.SERVED);
  });

  it("deve mudar de SERVED para PAYING", async () => {
    await tableService.occupyTable(storeId, tableId);
    await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.WAITING,
      "admin",
    );
    await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.SERVED,
      "admin",
    );
    const state = await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.PAYING,
      "admin",
    );

    expect(state.status).toBe(TableStatus.PAYING);
  });

  it("deve rejeitar transição inválida", async () => {
    await tableService.occupyTable(storeId, tableId);

    // OCCUPIED → EMPTY é inválido
    await expect(
      tableService.changeTableStatus(
        storeId,
        tableId,
        TableStatus.EMPTY,
        "admin",
      ),
    ).rejects.toThrow("inválida");
  });

  it("deve permitir cliente chamar garçom de OCCUPIED", async () => {
    await tableService.occupyTable(storeId, tableId);
    const state = await tableService.callWaiter(storeId, tableId);

    expect(state.status).toBe(TableStatus.CALLING);
  });

  it("deve permitir retornar de CALLING para OCCUPIED", async () => {
    await tableService.occupyTable(storeId, tableId);
    await tableService.callWaiter(storeId, tableId);
    const state = await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.OCCUPIED,
      "admin",
    );

    expect(state.status).toBe(TableStatus.OCCUPIED);
  });
});

describe("TableManagementService: Release & Cleaning", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let tableId: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-release";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const table = await prisma.table.create({
      data: {
        storeId,
        number: 4,
        qrCode: "qr-004",
        status: TableStatus.EMPTY,
      },
    });
    tableId = table.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({ where: { tableId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve liberar mesa e marcar para limpeza", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");
    await tableService.changeTableStatus(
      storeId,
      tableId,
      TableStatus.PAYING,
      "admin",
    );

    const state = await tableService.releaseTable(storeId, tableId, "admin");

    expect(state.status).toBe(TableStatus.CLEANING);
  });

  it("deve registrar checkout ao liberar", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");

    // Esperar um pouco
    await new Promise((resolve) => setTimeout(resolve, 50));

    await tableService.releaseTable(storeId, tableId, "admin");

    const occupancy = await (prisma as any).tableOccupancy.findFirst({
      where: { tableId, checkOutAt: { not: null } },
    });

    expect(occupancy?.checkOutAt).toBeDefined();
    expect(occupancy?.durationMinutes).toBeGreaterThanOrEqual(0);
  });

  it("deve marcar mesa como limpa", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");
    await tableService.releaseTable(storeId, tableId, "admin");

    const state = await tableService.markTableCleaned(
      storeId,
      tableId,
      "waiter-123",
    );

    expect(state.status).toBe(TableStatus.EMPTY);
  });

  it("deve registrar quem limpou e quando", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");
    await tableService.releaseTable(storeId, tableId, "admin");

    await tableService.markTableCleaned(storeId, tableId, "waiter-123");

    const occupancy = await (prisma as any).tableOccupancy.findFirst({
      where: { tableId, cleanedAt: { not: null } },
    });

    expect(occupancy?.cleanedBy).toBe("waiter-123");
    expect(occupancy?.cleanedAt).toBeDefined();
  });
});

describe("TableManagementService: Order Linking", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let tableId: string;
  let orderId: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-order";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const table = await prisma.table.create({
      data: {
        storeId,
        number: 5,
        qrCode: "qr-005",
        status: TableStatus.EMPTY,
      },
    });
    tableId = table.id;

    const order = await prisma.order.create({
      data: {
        storeId,
        number: 1,
        status: "PENDING",
        subtotal: 100,
        total: 100,
      },
    });
    orderId = order.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({ where: { tableId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve vincular pedido a mesa", async () => {
    await tableService.linkOrderToTable(
      storeId,
      tableId,
      orderId,
      "admin",
    );

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(order?.tableId).toBe(tableId);
  });

  it("deve retornar order no getTableState", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");
    await tableService.linkOrderToTable(
      storeId,
      tableId,
      orderId,
      "admin",
    );

    const state = await tableService.getTableState(storeId, tableId);

    expect(state?.currentOrderId).toBe(orderId);
  });
});

describe("TableManagementService: All Tables & Filtering", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let table1: string;
  let table2: string;
  let table3: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-all";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const t1 = await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1", status: TableStatus.EMPTY },
    });
    table1 = t1.id;

    const t2 = await prisma.table.create({
      data: { storeId, number: 2, qrCode: "qr-2", status: TableStatus.EMPTY },
    });
    table2 = t2.id;

    const t3 = await prisma.table.create({
      data: { storeId, number: 3, qrCode: "qr-3", status: TableStatus.EMPTY },
    });
    table3 = t3.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({
      where: { tableId: { in: [table1, table2, table3] } },
    });
    await prisma.table.deleteMany({
      where: { id: { in: [table1, table2, table3] } },
    });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve retornar todas as mesas", async () => {
    const tables = await tableService.getAllTablesStatus(storeId);

    expect(tables.length).toBe(3);
  });

  it("deve retornar mesas precisando limpeza", async () => {
    await tableService.occupyTable(storeId, table1);
    await tableService.releaseTable(storeId, table1, "admin");

    const cleaning = await tableService.getTablesNeedingCleaning(storeId);

    expect(cleaning.length).toBe(1);
    expect(cleaning[0].tableId).toBe(table1);
  });

  it("deve retornar mesas em ordem de prioridade", async () => {
    // Ocupar e liberar table1
    await tableService.occupyTable(storeId, table1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await tableService.releaseTable(storeId, table1, "admin");

    // Ocupar e liberar table2
    await tableService.occupyTable(storeId, table2);
    await tableService.releaseTable(storeId, table2, "admin");

    const cleaning = await tableService.getTablesNeedingCleaning(storeId);

    // table1 deve ser primeira (older)
    expect(cleaning[0].tableId).toBe(table1);
  });
});

describe("TableManagementService: Analytics", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let table1: string;
  let table2: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-analytics";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const t1 = await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1", status: TableStatus.EMPTY },
    });
    table1 = t1.id;

    const t2 = await prisma.table.create({
      data: { storeId, number: 2, qrCode: "qr-2", status: TableStatus.OCCUPIED },
    });
    table2 = t2.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({
      where: { tableId: { in: [table1, table2] } },
    });
    await prisma.table.deleteMany({
      where: { id: { in: [table1, table2] } },
    });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve calcular taxa de ocupação", async () => {
    const analytics = await tableService.getTableAnalytics(storeId);

    expect(analytics.totalTables).toBe(2);
    expect(analytics.occupiedTables).toBe(1);
    expect(analytics.occupancyRate).toBe(50);
  });

  it("deve incluir mesas vazias no total", async () => {
    const analytics = await tableService.getTableAnalytics(storeId);

    expect(analytics.emptyTables).toBe(1);
  });

  it("deve retornar 0% ocupação se vazio", async () => {
    await prisma.table.update({
      where: { id: table2 },
      data: { status: TableStatus.EMPTY },
    });

    const analytics = await tableService.getTableAnalytics(storeId);

    expect(analytics.occupancyRate).toBe(0);
  });
});

describe("TableManagementService: History", () => {
  let tableService: TableManagementService;
  let storeId: string;
  let tableId: string;

  beforeEach(async () => {
    tableService = new TableManagementService();
    storeId = "test-store-history";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    const table = await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1", status: TableStatus.EMPTY },
    });
    tableId = table.id;
  });

  afterEach(async () => {
    await (prisma as any).tableOccupancy.deleteMany({ where: { tableId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve retornar histórico de ocupação", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");
    await tableService.releaseTable(storeId, tableId, "admin");

    const history = await tableService.getTableHistory(storeId, tableId);

    expect(history.length).toBe(1);
    expect(history[0].checkInAt).toBeDefined();
    expect(history[0].checkOutAt).toBeDefined();
  });

  it("deve incluir duração na história", async () => {
    await tableService.occupyTable(storeId, tableId, "customer-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    await tableService.releaseTable(storeId, tableId, "admin");

    const history = await tableService.getTableHistory(storeId, tableId);

    expect(history[0].durationMinutes).toBeGreaterThanOrEqual(0);
  });
});
