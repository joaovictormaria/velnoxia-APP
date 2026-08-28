import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { InventoryCostService } from "@/server/services/inventory-cost-service";

/*
 * O custo histórico, contra o Postgres local.
 *
 * Dois defeitos moravam aqui, e os dois eram invisíveis:
 *
 * 1. O relatório multiplicava pelo custo ATUAL do item (`item.cost`) em vez
 *    do custo congelado no movimento (`costAtTime`). Subir o preço do tomate
 *    reescrevia o custo de tudo que já tinha sido vendido — o relatório de
 *    março mudava em abril sem nada ter acontecido em março. O motor da
 *    Fase 1 já gravava `costAtTime` justamente para impedir isso; ninguém
 *    lia.
 *
 * 2. O acumulador nascia como `(0 as Decimal)` — o número zero disfarçado de
 *    Decimal por uma asserção de tipo. Números não têm `.add`, então a
 *    primeira linha com custo derrubava a função com TypeError. O cenário 1
 *    cobre isso de graça: se o bug voltar, ele nem chega à asserção.
 */

let storeId = "";
let unitId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function semear() {
  await limparBanco();
  const loja = await prisma.store.create({
    data: { slug: `custo-${Date.now()}`, name: "Cozinha de Teste" },
  });
  storeId = loja.id;
  const kg = await prisma.inventoryUnit.create({
    data: { code: "kg", name: "Quilograma", system: "WEIGHT", isBuiltIn: true },
  });
  unitId = kg.id;
}

async function criarInsumo(nome: string, saldo: number, custo: number | null) {
  return prisma.inventoryItem.create({
    data: {
      storeId,
      name: nome,
      itemType: "INGREDIENT",
      baseUnitId: unitId,
      quantityOnHand: saldo,
      cost: custo,
    },
  });
}

/** Consome pelo motor da Fase 1, que congela `costAtTime` da linha travada. */
async function consumir(itemId: string, quantidade: number, pedidoId: string) {
  return InventoryService.recordMovement(storeId, {
    idempotencyKey: `${storeId}#ORDER#${pedidoId}#CONSUMPTION#${itemId}`,
    itemId,
    type: "CONSUMPTION",
    quantity: -quantidade,
    unitId,
    reference: pedidoId,
    referenceType: "ORDER",
    authorType: "SYSTEM",
    authorId: "TESTE",
    authorName: "Teste de custo",
  } as any);
}

/**
 * Um pedido concluido de verdade.
 *
 * `getCostReport` parte dos PEDIDOS reconhecidos, e nao dos movimentos soltos:
 * foi essa inversao que impediu cada corrida de producao de ser contada como
 * se fosse um pedido. A consequencia para os testes e que um `reference`
 * inventado deixou de ser custo de venda — precisa existir um Order.
 */
async function pedidoConcluido() {
  return prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 1000000),
      status: "COMPLETED",
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: "CASH",
      subtotal: 100,
      total: 100,
    },
  });
}

beforeEach(semear);
afterAll(limparBanco);

describe("custo histórico", () => {
  it("1 · calcula o custo de um pedido sem estourar, e com o valor certo", async () => {
    const tomate = await criarInsumo("Tomate", 100, 8);
    await consumir(tomate.id, 5, "pedido-1");

    const custo = await InventoryCostService.calculateOrderCost(storeId, "pedido-1");

    /*
     * Que esta linha seja alcançada já prova a correção do `(0 as Decimal)`:
     * com o bug, `totalCost.add()` derrubava a função antes de retornar.
     */
    expect(Number(custo.totalCost)).toBeCloseTo(40, 2); // 5 × 8
    expect(custo.costBreakdown).toHaveLength(1);
    expect(custo.costBreakdown[0].itemName).toBe("Tomate");
    expect(Number(custo.costBreakdown[0].unitCost)).toBeCloseTo(8, 2);
  });

  it("2 · mudar o preço do insumo NÃO reescreve o custo do que já foi vendido", async () => {
    const tomate = await criarInsumo("Tomate", 100, 8);
    await consumir(tomate.id, 5, "pedido-1");

    const antes = await InventoryCostService.calculateOrderCost(storeId, "pedido-1");
    expect(Number(antes.totalCost)).toBeCloseTo(40, 2);

    // O fornecedor reajustou. Isso vale para as próximas compras, não para o
    // pedido de ontem.
    await prisma.inventoryItem.update({
      where: { id: tomate.id },
      data: { cost: 99 },
    });

    const depois = await InventoryCostService.calculateOrderCost(storeId, "pedido-1");

    /*
     * A asserção central desta correção. Lendo `item.cost`, daria 495 — e o
     * histórico teria mudado sozinho.
     */
    expect(Number(depois.totalCost)).toBeCloseTo(40, 2);
    expect(Number(depois.totalCost)).not.toBeCloseTo(495, 2);
  });

  it("3 · soma vários insumos do mesmo pedido", async () => {
    const tomate = await criarInsumo("Tomate", 100, 8);
    const queijo = await criarInsumo("Queijo", 100, 30);
    await consumir(tomate.id, 2, "pedido-1"); // 16
    await consumir(queijo.id, 1, "pedido-1"); // 30

    const custo = await InventoryCostService.calculateOrderCost(storeId, "pedido-1");
    expect(Number(custo.totalCost)).toBeCloseTo(46, 2);
    expect(custo.costBreakdown).toHaveLength(2);
  });

  it("4 · insumo sem custo conhecido fica fora, em vez de entrar como zero", async () => {
    const semCusto = await criarInsumo("Sem custo", 100, null);
    const comCusto = await criarInsumo("Com custo", 100, 10);
    await consumir(semCusto.id, 5, "pedido-1");
    await consumir(comCusto.id, 2, "pedido-1");

    const custo = await InventoryCostService.calculateOrderCost(storeId, "pedido-1");
    expect(Number(custo.totalCost)).toBeCloseTo(20, 2);
    expect(custo.costBreakdown).toHaveLength(1);
    expect(custo.costBreakdown[0].itemName).toBe("Com custo");
  });

  it("5 · não mistura o custo de outro pedido", async () => {
    const tomate = await criarInsumo("Tomate", 100, 8);
    await consumir(tomate.id, 5, "pedido-1"); // 40
    await consumir(tomate.id, 1, "pedido-2"); // 8

    const um = await InventoryCostService.calculateOrderCost(storeId, "pedido-1");
    const dois = await InventoryCostService.calculateOrderCost(storeId, "pedido-2");
    expect(Number(um.totalCost)).toBeCloseTo(40, 2);
    expect(Number(dois.totalCost)).toBeCloseTo(8, 2);
  });

  it("6 · o relatório do período também usa o custo congelado", async () => {
    const tomate = await criarInsumo("Tomate", 100, 8);
    /*
     * O PEDIDO PRECISA EXISTIR. Este teste usava o `reference` fabricado
     * "pedido-1", como os cenarios acima — mas aqueles verificam
     * `calculateOrderCost`, que casa movimentos por referencia, enquanto este
     * verifica `getCostReport`, que parte dos pedidos validos. Um custo orfao
     * nao e custo de venda.
     */
    const pedido = await pedidoConcluido();
    await consumir(tomate.id, 5, pedido.id);

    await prisma.inventoryItem.update({
      where: { id: tomate.id },
      data: { cost: 99 },
    });

    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const relatorio = await InventoryCostService.getCostReport(storeId, ontem, amanha);

    // Mesma regra do cenário 2, no outro relatório.
    expect(Number(relatorio.summary.totalCost)).toBeCloseTo(40, 2);
    expect(relatorio.summary.totalOrders).toBe(1);
    expect(relatorio.topExpensiveItems[0].itemName).toBe("Tomate");
    expect(Number(relatorio.topExpensiveItems[0].totalCost)).toBeCloseTo(40, 2);

    // E o custo por tipo de movimento, que lia `item.cost` por conta própria.
    expect(Number(relatorio.summary.costByType.CONSUMPTION.total)).toBeCloseTo(40, 2);
  });

  it("7 · relatório de período vazio devolve zero em vez de estourar", async () => {
    /*
     * O caminho em que nenhum movimento tem custo é o único que a versão
     * antiga sobrevivia, porque o acumulador quebrado nunca chegava a
     * receber `.add`. Fica registrado para não regredir do outro lado.
     */
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const relatorio = await InventoryCostService.getCostReport(storeId, ontem, amanha);

    expect(Number(relatorio.summary.totalCost)).toBe(0);
    expect(Number(relatorio.summary.averageCostPerOrder)).toBe(0);
    expect(relatorio.summary.totalOrders).toBe(0);
    expect(relatorio.topExpensiveItems).toEqual([]);
  });

  it("8 · calculateMargin devolve Decimal utilizável mesmo com preço zero", async () => {
    const { Decimal } = await import("@prisma/client/runtime/client");

    const normal = InventoryCostService.calculateMargin(
      new Decimal(100),
      new Decimal(40),
    );
    expect(Number(normal.profitAmount)).toBeCloseTo(60, 2);
    expect(Number(normal.marginPercent)).toBeCloseTo(60, 2);

    // Divisão por zero evitada — e o retorno segue sendo Decimal, não number.
    const gratis = InventoryCostService.calculateMargin(
      new Decimal(0),
      new Decimal(40),
    );
    expect(Number(gratis.marginPercent)).toBe(0);
    expect(typeof (gratis.marginPercent as any).add).toBe("function");
  });
});
