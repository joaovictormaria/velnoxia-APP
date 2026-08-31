import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../client";

/*
 * O BANCO COMECA VAZIO EM CADA TESTE.
 *
 * Sem isto, "deve isolar dados entre lojas" contava produtos deixados por
 * OUTRO arquivo de teste e falhava com `esperado 2, recebido 3` — o teste
 * estava certo, o banco e que chegava sujo. Baixar a expectativa para 3
 * apagaria justamente a pergunta que ele faz: uma loja nao enxerga dados de
 * outra. Os demais arquivos da suite ja fazem esta limpeza; este nao fazia.
 */
async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(limparBanco);

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
      create: { id: storeId, name: "Test Store", slug: storeId },
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
      data: { storeId, name: "Pizza", slug: "pizza", sortOrder: 1 },
    });

    const product = await prisma.product.create({
      data: {
        storeId,
        name: "Muzzarela",
        slug: "muzzarela",
        description: "Pizza de muzzarela",
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
          description: "Produto com categoria inexistente",
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
        status: "RECEIVED",
        customerName: "Cliente Teste",
        customerPhone: "11999999999",
        paymentMethod: "PIX",
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
        status: "RECEIVED",
        customerName: "Cliente Teste",
        customerPhone: "11999999999",
        paymentMethod: "PIX",
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
      create: { id: storeId, name: "Test Store", slug: storeId },
    });
  });

  afterEach(async () => {
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.employee.deleteMany({ where: { storeId } });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.coupon.deleteMany({ where: { storeId } });
    // "store-2" e criada dentro de um dos testes; se ele falhar antes do
    // delete, o registro sobrevive e derruba a rodada seguinte.
    await prisma.store.deleteMany({ where: { id: { in: [storeId, "store-2"] } } });
  });

  it("deve rejeitar slug duplicado na mesma loja", async () => {
    const category = await prisma.category.create({
      data: { storeId, name: "Pizza", slug: "pizza" },
    });

    await prisma.product.create({
      data: {
        storeId,
        name: "Muzzarela",
        slug: "muzzarela",
        description: "Pizza de muzzarela",
        categoryId: category.id,
        basePrice: 25.0,
      },
    });

    await expect(
      prisma.product.create({
        data: {
          storeId,
          name: "Outra Muzzarela",
          slug: "muzzarela", // Mesmo slug
          description: "Outra pizza de muzzarela",
          categoryId: category.id,
          basePrice: 30.0,
        },
      }),
    ).rejects.toThrow();
  });

  it("deve permitir mesmo slug em lojas diferentes", async () => {
    const store2 = await prisma.store.create({
      data: { id: "store-2", name: "Store 2", slug: "store-2" },
    });

    const cat1 = await prisma.category.create({
      data: { storeId, name: "Pizza", slug: "pizza" },
    });
    const cat2 = await prisma.category.create({
      data: { storeId: store2.id, name: "Pizza", slug: "pizza" },
    });

    const prod1 = await prisma.product.create({
      data: {
        storeId,
        name: "Muzzarela",
        slug: "muzzarela",
        description: "Pizza de muzzarela",
        categoryId: cat1.id,
        basePrice: 25.0,
      },
    });

    const prod2 = await prisma.product.create({
      data: {
        storeId: store2.id,
        name: "Muzzarela",
        slug: "muzzarela", // Mesmo slug OK em loja diferente
        description: "Pizza de muzzarela",
        categoryId: cat2.id,
        basePrice: 30.0,
      },
    });

    expect(prod1.slug).toBe(prod2.slug);
    expect(prod1.storeId).not.toBe(prod2.storeId);

    await prisma.store.delete({ where: { id: store2.id } });
  });

  /*
   * O TELEFONE É A CHAVE, e não o e-mail.
   *
   * Este teste cobrava `@@unique([storeId, email])`. `Employee` nunca teve
   * `email` nem `role` — conferido em todas as versões do schema no histórico.
   * A identidade do funcionário sempre foi o telefone, que é a chave do
   * reconhecimento no checkout e o que o schema declara único por loja.
   *
   * A pergunta do teste não muda: a loja aceita dois funcionários com a mesma
   * identidade? Só o campo que responde por ela é outro.
   */
  it("deve rejeitar telefone duplicado de funcionário na mesma loja", async () => {
    await prisma.employee.create({
      data: {
        storeId,
        name: "João",
        phone: "11999999999",
        pinHash: "$2b$10$hash",
      },
    });

    await expect(
      prisma.employee.create({
        data: {
          storeId,
          name: "João Silva",
          phone: "11999999999", // Mesmo telefone
          pinHash: "$2b$10$outro",
        },
      }),
    ).rejects.toThrow();
  });

  /*
   * O NÚMERO DA MESA É A CHAVE, e não o QR.
   *
   * O teste cobrava unicidade de `qrCode` — campo que `Table` nunca teve, em
   * nenhuma versão do schema. Hoje existem `qrcodeUrl` e `qrcodeData`, e
   * nenhum dos dois é único: o QR é derivado da mesa, não o contrário. A
   * única que o schema declara é `[storeId, number]`, que é o que impede duas
   * mesas 1 na mesma casa.
   */
  it("deve rejeitar número de mesa duplicado na mesma loja", async () => {
    await prisma.table.create({
      data: {
        storeId,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://exemplo.test/mesa/1",
        qrcodeData: "qr-001",
      },
    });

    await expect(
      prisma.table.create({
        data: {
          storeId,
          number: 1, // Mesma mesa
          capacity: 4,
          qrcodeUrl: "https://exemplo.test/mesa/1-bis",
          qrcodeData: "qr-002",
        },
      }),
    ).rejects.toThrow();
  });

  it("deve rejeitar código cupom duplicado na mesma loja", async () => {
    await prisma.coupon.create({
      data: {
        storeId,
        code: "PROMO10",
        discountValue: 10.0,
        discountType: "FIXED_AMOUNT",
        validFrom: new Date("2026-01-01"),
        validUntil: new Date("2026-12-31"),
        isActive: true,
      },
    });

    await expect(
      prisma.coupon.create({
        data: {
          storeId,
          code: "PROMO10", // Mesmo código
          discountValue: 20.0,
          discountType: "FIXED_AMOUNT",
          validFrom: new Date("2026-01-01"),
          validUntil: new Date("2026-12-31"),
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
      create: { id: storeId, name: "Test Store", slug: storeId },
    });

    // Criar dados de teste
    for (let i = 0; i < 10; i++) {
      await prisma.order.create({
        data: {
          storeId,
          number: i + 1,
          status: i % 2 === 0 ? "RECEIVED" : "COMPLETED",
          customerName: "Cliente " + (i + 1),
          customerPhone: "11999999999",
          paymentMethod: "PIX",
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
      where: { storeId, status: "RECEIVED" },
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
      create: { id: storeId, name: "Test Store", slug: storeId },
    });
  });

  afterEach(async () => {
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  it("deve excluir deletados do findMany sem deletedAt null", async () => {
    const category = await prisma.category.create({
      data: { storeId, name: "Geral", slug: "geral" },
    });

    const prod1 = await prisma.product.create({
      data: {
        storeId,
        name: "Ativo",
        slug: "ativo",
        description: "Produto ativo",
        categoryId: category.id,
        basePrice: 25.0,
      },
    });

    const prod2 = await prisma.product.create({
      data: {
        storeId,
        name: "Será deletado",
        slug: "deletado",
        description: "Produto que sera deletado",
        categoryId: category.id,
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
    const category = await prisma.category.create({
      data: { storeId, name: "Geral", slug: "geral" },
    });

    const prod = await prisma.product.create({
      data: {
        storeId,
        name: "Produto",
        slug: "produto",
        description: "Produto para soft delete",
        categoryId: category.id,
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
        { id: store1, name: "Store 1", slug: store1 },
        { id: store2, name: "Store 2", slug: store2 },
      ],
    });

    // Uma categoria por loja: Product.categoryId e obrigatorio.
    const cat1 = await prisma.category.create({
      data: { storeId: store1, name: "Geral", slug: "geral" },
    });
    const cat2 = await prisma.category.create({
      data: { storeId: store2, name: "Geral", slug: "geral" },
    });

    // Criar produtos em cada loja
    await prisma.product.createMany({
      data: [
        {
          storeId: store1,
          name: "Produto 1",
          slug: "produto-1",
          description: "Produto da loja 1",
          categoryId: cat1.id,
          basePrice: 25.0,
        },
        {
          storeId: store2,
          name: "Produto 2",
          slug: "produto-2",
          description: "Produto da loja 2",
          categoryId: cat2.id,
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
      create: { id: storeId, name: "Test Store", slug: storeId },
    });

    /*
     * UMA MESA POR SESSÃO, e não cinco sessões na mesma mesa.
     *
     * `TableSession` tem `@@unique([tableId, status])`: duas sessões OPEN na
     * mesma mesa não existem, e é essa garantia que impede duas comandas
     * abertas no mesmo lugar. O laço antigo criava cinco na mesa 1 porque
     * escrevia campos que não existem no modelo.
     */
    for (let i = 0; i < 5; i++) {
      const mesa = await prisma.table.create({
        data: {
          storeId,
          number: i + 1,
          capacity: 4,
          qrcodeUrl: `https://exemplo.test/mesa/${i + 1}`,
          qrcodeData: `qr-${i + 1}`,
        },
      });
      await prisma.tableSession.create({
        data: {
          storeId,
          tableId: mesa.id,
          pinHash: "$2b$10$test",
          // As três primeiras ficam abertas; as outras já fecharam.
          status: i < 3 ? "OPEN" : "CLOSED",
          expiresAt: new Date(Date.now() + 7200000),
        },
      });
    }
  });

  afterEach(async () => {
    await prisma.tableSession.deleteMany({ where: { storeId } });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  /*
   * O ÍNDICE QUE EXISTE É `[storeId, status]`.
   *
   * O teste cobrava `[adminId, isActive]` — dois campos que `TableSession`
   * não tem, em índice que o schema não declara. A pergunta é a mesma: a
   * consulta pelo índice composto responde rápido e traz o conjunto certo.
   */
  it("deve filtrar por storeId e status rapidamente", async () => {
    const start = performance.now();

    const abertas = await prisma.tableSession.findMany({
      where: { storeId, status: "OPEN" },
    });

    const duration = performance.now() - start;

    expect(abertas.length).toBe(3);
    expect(duration).toBeLessThan(100);
  });
});
