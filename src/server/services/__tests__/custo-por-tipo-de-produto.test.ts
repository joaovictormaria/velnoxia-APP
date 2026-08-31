import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { InventoryCostService } from "@/server/services/inventory-cost-service";

/*
 * O CUSTO CHEGA AO FINANCEIRO PELOS DOIS CAMINHOS, E PELO MESMO RAZÃO.
 *
 * Nenhuma linha do financeiro conhece `tipoDeControle` — `inventory-cost-service`
 * e `regra-financeira` somam movimentos `CONSUMPTION` com `costAtTime`
 * congelado, e é só. O tipo do produto decide o que é consumido; o custo vem
 * atrás, sozinho.
 *
 * Estes testes provam essa ponte de ponta a ponta: PRODUÇÃO com receita gera
 * custo dos ingredientes, REVENDA gera custo do item vendido, e a regra de
 * apuração que recusa inventar custo continua de pé.
 *
 * E TUDO COM `inventoryControlEnabled = false`, de propósito: o motor nunca
 * dependeu dessa flag, e é isso que torna a exigência de receita da PRODUÇÃO
 * uma regra de CUSTO e não de estoque.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";
let categoriaId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function semear(migration: string) {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${migration}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

beforeEach(async () => {
  await limparBanco();
  await semear(SEED_UNIDADES);
  const loja = await prisma.store.create({
    data: {
      slug: `custo-${Date.now()}`,
      name: "Cozinha",
      // DESLIGADO de propósito: ver o comentário do topo.
      settings: {
        create: {
          storeName: "Cozinha",
          whatsappNumber: "11999999999",
          inventoryControlEnabled: false,
        },
      },
    },
  });
  storeId = loja.id;
  categoriaId = (
    await prisma.category.create({
      data: { storeId, name: "Geral", slug: "geral", icon: "🍽", kind: "SIMPLE" },
    })
  ).id;
});
afterAll(limparBanco);

/**
 * Item com saldo e custo conhecido.
 *
 * `precoDaEmbalagem` é o preço de UMA embalagem, e sem `purchasePackSize` a
 * embalagem É a unidade — então o número passado aqui vira o custo unitário
 * direto. Escrevi este helper primeiro achando que era o total do lote; os
 * testes reprovaram, e o nome agora diz o que o valor é.
 */
async function item(name: string, itemType: string, custoUnitario: number, qtd = 100) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name, baseUnitId: "unit_un", itemType } as any,
    { quantidade: qtd, precoDaEmbalagem: custoUnitario },
  );
}

/** Item SEM custo: criado direto, sem compra nenhuma. */
async function itemSemCusto(name: string) {
  return prisma.inventoryItem.create({
    data: { storeId, name, itemType: "INGREDIENT", baseUnitId: "unit_un" },
  });
}

async function produto(nome: string, dados: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      description: nome,
      basePrice: 50,
      ...dados,
    },
  });
}

async function ficha(productId: string, linhas: Array<[string, number]>) {
  return prisma.productComposition.create({
    data: {
      storeId,
      productId,
      version: 1,
      isActive: true,
      items: {
        create: linhas.map(([inventoryItemId, quantity], i) => ({
          inventoryItemId,
          quantity,
          unitId: "unit_un",
          sortOrder: i,
        })),
      },
    },
  });
}

/** Um pedido vendido de verdade: reservado, preparado e concluído. */
async function vender(productId: string, quantity: number, total = 50) {
  const order = await prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 1000000),
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      status: "COMPLETED",
      subtotal: total,
      total,
      items: {
        create: [
          { productId, productNameSnapshot: "Item", unitPrice: total, quantity },
        ],
      },
    },
  });
  await prisma.$transaction((tx) =>
    OrderInventoryHandler.reservarNaCriacao(tx, order.id, storeId),
  );
  await OrderInventoryHandler.onOrderPreparing(order.id);
  return order;
}

const consumos = (itemId: string) =>
  prisma.inventoryMovement.findMany({
    where: { storeId, itemId, type: "CONSUMPTION" },
  });

describe("PRODUÇÃO + receita → custo apurável", () => {
  it("a venda consome os ingredientes com o custo congelado", async () => {
    // custo unitário: R$ 2,00
    const massa = await item("Massa", "INGREDIENT", 2);
    // custo unitário: R$ 3,00
    const queijo = await item("Queijo", "INGREDIENT", 3);
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    await ficha(p.id, [
      [massa.id, 1],
      [queijo.id, 2],
    ]);

    const order = await vender(p.id, 1);

    const cm = await consumos(massa.id);
    const cq = await consumos(queijo.id);
    expect(cm).toHaveLength(1);
    expect(cq).toHaveLength(1);
    expect(Number(cm[0].costAtTime)).toBeCloseTo(2, 4);
    expect(Number(cq[0].costAtTime)).toBeCloseTo(3, 4);

    // 1 massa × 2,00 + 2 queijos × 3,00 = 8,00
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(8, 4);
  });

  it("o custo escala com a quantidade vendida", async () => {
    const massa = await item("Massa", "INGREDIENT", 2);
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    await ficha(p.id, [[massa.id, 1]]);

    const order = await vender(p.id, 3);

    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(6, 4); // 3 × 2,00
  });

  /*
   * A REGRA QUE NÃO PODE SER RELAXADA: receita existindo não basta. Um insumo
   * sem custo conhecido deixa a linha fora da apuração — o sistema prefere
   * perder cobertura a fabricar margem. Isto NÃO foi alterado; está aqui para
   * que ninguém "conserte" achando que é bug.
   */
  it("ingrediente SEM custo não vira custo zero — fica fora da apuração", async () => {
    const massa = await item("Massa", "INGREDIENT", 2);
    const misterioso = await itemSemCusto("Tempero sem compra");
    const p = await produto("Pizza", { tipoDeControle: "PRODUCAO" });
    await ficha(p.id, [
      [massa.id, 1],
      [misterioso.id, 1],
    ]);

    const order = await vender(p.id, 1);

    const semCusto = await consumos(misterioso.id);
    expect(semCusto).toHaveLength(1);
    expect(semCusto[0].costAtTime).toBeNull();

    // O custo apurado conta só o que tem custo conhecido — não inventa zero.
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(2, 4);
  });
});

describe("REVENDA + item de estoque → custo apurável", () => {
  it("a venda consome o item vinculado, com o custo dele", async () => {
    // custo unitário: R$ 5,00 a lata
    const coca = await item("Coca lata", "RESALE", 5);
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });

    const order = await vender(p.id, 4);

    const c = await consumos(coca.id);
    expect(c).toHaveLength(1);
    expect(Number(c[0].quantity)).toBe(-4);
    expect(Number(c[0].costAtTime)).toBeCloseTo(5, 4);

    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(20, 4); // 4 × 5,00
  });

  it("REVENDA não precisa de receita para o custo funcionar", async () => {
    const coca = await item("Coca lata", "RESALE", 5);
    const p = await produto("Coca-Cola", {
      tipoDeControle: "REVENDA",
      inventoryItemId: coca.id,
    });

    const fichas = await prisma.productComposition.count({
      where: { productId: p.id },
    });
    expect(fichas).toBe(0);

    const order = await vender(p.id, 1);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(5, 4);
  });
});

describe("NAO_CONTROLA e produto legado", () => {
  it("NAO_CONTROLA não gera consumo nenhum — e portanto nenhum custo", async () => {
    const coca = await item("Coca lata", "RESALE", 5);
    const p = await produto("Taxa de entrega", {
      tipoDeControle: "NAO_CONTROLA",
      inventoryItemId: coca.id,
    });

    const order = await vender(p.id, 2);

    expect(await consumos(coca.id)).toHaveLength(0);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBe(0);
  });

  /*
   * O produto anterior a esta pergunta continua sendo resolvido pela dedução
   * antiga — ficha primeiro, vínculo depois — e o custo chega ao financeiro
   * exatamente como chegava.
   */
  it("produto LEGADO com ficha continua apurando custo", async () => {
    const massa = await item("Massa", "INGREDIENT", 2);
    const p = await produto("Bolo caseiro"); // tipoDeControle = NULL
    await ficha(p.id, [[massa.id, 2]]);

    const order = await vender(p.id, 1);

    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(4, 4); // 2 × 2,00
  });

  it("produto LEGADO com vínculo continua apurando custo", async () => {
    const coca = await item("Coca lata", "RESALE", 5);
    const p = await produto("Refri antigo", { inventoryItemId: coca.id });

    const order = await vender(p.id, 2);

    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(10, 4);
  });
});
