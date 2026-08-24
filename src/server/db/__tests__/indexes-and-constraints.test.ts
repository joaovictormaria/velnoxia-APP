import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../client";

/**
 * PRIORIDADE 11: TESTES DE ÍNDICES & CONSTRAINTS
 *
 * Valida que índices estão otimizando queries corretamente
 * e que constraints estão sendo enforçados.
 */

describe("Indexes & Constraints: Foreign Keys", () => {
  let storeId: string;

  beforeEach(async () => {
    storeId = "test-store-constraints";

    // Setup store
    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });
  });

  afterEach(async () => {
    // Cleanup
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.category.deleteMany({ where: { storeId } });
    await prisma.customer.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve criar produto com categoria válida", async () => {
    const category = await prisma.category.create({
      data: { storeId, name: "Pizza", order: 1 },
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Muzzarela",
        slug: "muzzarela",
        categoryId: category.id,
        basePrice: 25.0,
      },
    });

    expect(product.categoryId).toBe(category.id);
  });

  it("deve rejeitar produto com categoria inválida", async () => {
    await expect(
      prisma.product.create({
        data: {
          storeId,
          name: "Inválido",
          slug: "invalido",
          categoryId: "nonexistent-category",
          basePrice: 25.0,
        },
      }),
    ).rejects.toThrow();
  });

  it("deve permitir nullable foreignKey (customerId)", async () => {
    const order = await prisma.order.create({
      data: {
        storeId,
        number: 1,
        status: "PENDING",
        subtotal: 50.0,
        total: 50.0,
        // customerId is optional (null)
      },
    });

    expect(order.customerId).toBeNull();
  });

  it("deve permitir deletar cliente e manter pedido (soft delete)", async () => {
    const customer = await prisma.customer.create({
      data: { storeId, name: "João", phone: "11999999999" },
    });

    const order = await prisma.order.create({
      data: {
        storeId,
        customerId: customer.id,
        number: 1,
        status: "PENDING",
        subtotal: 50.0,
        total: 50.0,
      },
    });

    // Soft delete cliente
    await prisma.customer.update({
      where: { id: customer.id },
      data: { deletedAt: new Date(), deletedBy: "admin" },
    });

    // Pedido ainda existe (FK não é CASCADE delete)
    const savedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });

    expect(savedOrder).toBeDefined();
    expect(savedOrder?.customerId).toBe(customer.id); // FK mantém valor
  });
});

describe("Indexes & Constraints: Unique Constraints", () => {
  let storeId: string;

  beforeEach(async () => {
    storeId = "test-store-unique";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });
  });

  afterEach(async () => {
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { storeId } });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.coupon.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve rejeitar slug duplicado na mesma loja", async () => {
    await prisma.product.create({
      data: {
        storeId,
        name: "Muzzarela",
        slug: "muzzarela",
        basePrice: 25.0,
      },
    });

    await expect(
      prisma.product.create({
        data: {
          storeId,
          name: "Outra Muzzarela",
          slug: "muzzarela", // Mesmo slug
          basePrice: 30.0,
        },
      }),
    ).rejects.toThrow();
  });

  it("deve permitir mesmo slug em lojas diferentes", async () => {
    const store2 = await prisma.store.create({
      data: { id: "store-2", name: "Store 2" },
    });

    const prod1 = await prisma.product.create({
      data: {
        storeId,
        name: "Muzzarela",
        slug: "muzzarela",
        basePrice: 25.0,
      },
    });

    const prod2 = await prisma.product.create({
      data: {
        storeId: store2.id,
        name: "Muzzarela",
        slug: "muzzarela", // Mesmo slug OK em loja diferente
        basePrice: 30.0,
      },
    });

    expect(prod1.slug).toBe(prod2.slug);
    expect(prod1.storeId).not.toBe(prod2.storeId);

    await prisma.store.delete({ where: { id: store2.id } });
  });

  it("deve rejeitar email duplicado de funcionário na mesma loja", async () => {
    await prisma.employee.create({
      data: {
        storeId,
        name: "João",
        email: "joao@example.com",
        phone: "11999999999",
        role: "OWNER",
      },
    });

    await expect(
      prisma.employee.create({
        data: {
          storeId,
          name: "João Silva",
          email: "joao@example.com", // Mesmo email
          phone: "11988888888",
          role: "WAITER",
        },
      }),
    ).rejects.toThrow();
  });

  it("deve rejeitar QR code duplicado", async () => {
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-001" },
    });

    await expect(
      prisma.table.create({
        data: { storeId, number: 2, qrCode: "qr-001" }, // Mesmo QR
      }),
    ).rejects.toThrow();
  });

  it("deve rejeitar código cupom duplicado na mesma loja", async () => {
    await prisma.coupon.create({
      data: {
        storeId,
        code: "PROMO10",
        discountValue: 10.0,
        discountType: "FIXED",
        isActive: true,
      },
    });

    await expect(
      prisma.coupon.create({
        data: {
          storeId,
          code: "PROMO10", // Mesmo código
          discountValue: 20.0,
          discountType: "FIXED",
          isActive: true,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Indexes & Constraints: Query Performance", () => {
  let storeId: string;

  beforeEach(async () => {
    storeId = "test-store-perf";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    // Criar dados de teste
    for (let i = 0; i < 10; i++) {
      await prisma.order.create({
        data: {
          storeId,
          number: i + 1,
          status: i % 2 === 0 ? "PENDING" : "COMPLETED",
          subtotal: 50.0 + i * 5,
          total: 50.0 + i * 5,
        },
      });
    }
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve filtrar pedidos por storeId rapidamente", async () => {
    const start = performance.now();

    const orders = await prisma.order.findMany({
      where: { storeId, deletedAt: null },
    });

    const duration = performance.now() - start;

    expect(orders.length).toBeGreaterThanOrEqual(10);
    expect(duration).toBeLessThan(100); // < 100ms esperado
  });

  it("deve filtrar por status rapidamente", async () => {
    const start = performance.now();

    const pending = await prisma.order.findMany({
      where: { storeId, status: "PENDING" },
    });

    const duration = performance.now() - start;

    expect(pending.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100);
  });

  it("deve ordenar por createdAt rapidamente", async () => {
    const start = performance.now();

    const recent = await prisma.order.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const duration = performance.now() - start;

    expect(recent.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100);
  });
});

describe("Indexes & Constraints: Soft Delete", () => {
  let storeId: string;

  beforeEach(async () => {
    storeId = "test-store-softdelete";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });
  });

  afterEach(async () => {
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve excluir deletados do findMany sem deletedAt null", async () => {
    const prod1 = await prisma.product.create({
      data: {
        storeId,
        name: "Ativo",
        slug: "ativo",
        basePrice: 25.0,
      },
    });

    const prod2 = await prisma.product.create({
      data: {
        storeId,
        name: "Será deletado",
        slug: "deletado",
        basePrice: 25.0,
      },
    });

    // Soft delete prod2
    await prisma.product.update({
      where: { id: prod2.id },
      data: { deletedAt: new Date() },
    });

    // ❌ Retorna deletado (INSEGURO)
    const allProducts = await prisma.product.findMany({ where: { storeId } });
    expect(allProducts.length).toBe(2); // Contém deleted

    // ✅ Exclui deletado (SEGURO)
    const activeProducts = await prisma.product.findMany({
      where: { storeId, deletedAt: null },
    });
    expect(activeProducts.length).toBe(1);
    expect(activeProducts[0].id).toBe(prod1.id);
  });

  it("deve manter deletados em findUnique", async () => {
    const prod = await prisma.product.create({
      data: {
        storeId,
        name: "Produto",
        slug: "produto",
        basePrice: 25.0,
      },
    });

    // Soft delete
    await prisma.product.update({
      where: { id: prod.id },
      data: { deletedAt: new Date() },
    });

    // findUnique ignora soft delete
    const found = await prisma.product.findUnique({
      where: { id: prod.id },
    });

    expect(found?.deletedAt).toBeDefined();
  });
});

describe("Indexes & Constraints: Multi-tenant Isolation", () => {
  let store1: string;
  let store2: string;

  beforeEach(async () => {
    store1 = "test-store-1";
    store2 = "test-store-2";

    await prisma.store.createMany({
      data: [
        { id: store1, name: "Store 1" },
        { id: store2, name: "Store 2" },
      ],
    });

    // Criar produtos em cada loja
    await prisma.product.createMany({
      data: [
        {
          storeId: store1,
          name: "Produto 1",
          slug: "produto-1",
          basePrice: 25.0,
        },
        {
          storeId: store2,
          name: "Produto 2",
          slug: "produto-2",
          basePrice: 30.0,
        },
      ],
    });
  });

  afterEach(async () => {
    await prisma.product.deleteMany({ where: { storeId: { in: [store1, store2] } } });
    await prisma.store.deleteMany({ where: { id: { in: [store1, store2] } } });
  });

  it("deve retornar apenas produtos da loja certa", async () => {
    const prod1 = await prisma.product.findMany({
      where: { storeId: store1 },
    });

    const prod2 = await prisma.product.findMany({
      where: { storeId: store2 },
    });

    expect(prod1.length).toBe(1);
    expect(prod2.length).toBe(1);
    expect(prod1[0].storeId).toBe(store1);
    expect(prod2[0].storeId).toBe(store2);
  });

  it("deve isolar dados entre lojas", async () => {
    // Admin de store1 não pode ver produtos de store2
    const store1Products = await prisma.product.findMany({
      where: { storeId: store1, deletedAt: null },
    });

    const allProducts = await prisma.product.findMany({
      where: { deletedAt: null },
    });

    expect(store1Products.length).toBe(1);
    expect(allProducts.length).toBe(2); // Sem filtro storeId (INSEGURO)
  });
});

describe("Indexes & Constraints: Composite Indexes", () => {
  let storeId: string;

  beforeEach(async () => {
    storeId = "test-store-composite";

    await prisma.store.upsert({
      where: { id: storeId },
      update: {},
      create: { id: storeId, name: "Test Store" } as any,
    });

    // Criar employee para TableSession
    await prisma.employee.create({
      data: {
        id: "emp-1",
        storeId,
        name: "Admin",
        phone: "11999999999",
        role: "OWNER",
      },
    });

    // Criar table para TableSession
    await prisma.table.create({
      data: { storeId, number: 1, qrCode: "qr-1" },
    });

    // Criar múltiplas sessions
    const table = await prisma.table.findFirst({ where: { storeId } });
    for (let i = 0; i < 5; i++) {
      await prisma.tableSession.create({
        data: {
          tableId: table!.id,
          adminId: "emp-1",
          sessionToken: `token-${i}`,
          deviceId: `device-${i}`,
          isActive: i < 3, // Primeiras 3 ativas
        },
      });
    }
  });

  afterEach(async () => {
    await prisma.tableSession.deleteMany({
      where: { table: { storeId } },
    });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve filtrar por adminId e isActive rapidamente", async () => {
    const start = performance.now();

    const activeSessions = await prisma.tableSession.findMany({
      where: { adminId: "emp-1", isActive: true },
    });

    const duration = performance.now() - start;

    expect(activeSessions.length).toBe(3);
    expect(duration).toBeLessThan(100);
  });
});
