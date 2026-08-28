import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { transitionOrderStatus } from "@/server/services/order-service";

/*
 * QUAIS PEDIDOS SÃO RECEITA.
 *
 * O sistema tinha cinco respostas para esta pergunta: o painel somava tudo que
 * não fosse cancelado, os relatórios somavam só o concluído, o histórico somava
 * qualquer pedido, o monitoramento não filtrava nada, e a ficha do cliente
 * usava uma quarta lista de status. Quatro números diferentes, nenhum deles
 * errado por si, e nenhum jeito de dizer qual valia.
 *
 * A regra agora é uma: `status = COMPLETED` e `deletedAt IS NULL`.
 *
 * `paymentStatus` NÃO participa — e não é detalhe. Ele se auto-quita quando o
 * pedido é concluído, e pedidos de desconto em folha ficam PENDING para sempre
 * de propósito. Ancorar receita nele apagaria toda venda a funcionário.
 */

let storeId = "";
let unitUn = "";
let categoriaId = "";
let itemId = "";
let produtoLigadoId = "";
let numero = 1;

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await limparBanco();
  numero = 1;

  storeId = (await prisma.store.create({
    data: { slug: `rec-${Date.now()}`, name: "Cozinha" },
  })).id;

  unitUn = (await prisma.inventoryUnit.create({
    data: { code: "un", name: "Unidade", system: "COUNT", isBuiltIn: true },
  })).id;

  categoriaId = (await prisma.category.create({
    data: { storeId, name: "Doces", slug: `dc-${Date.now()}`, kind: "SIMPLE" },
  })).id;

  itemId = (await prisma.inventoryItem.create({
    data: {
      storeId, name: "Bolo", itemType: "PREPARED",
      baseUnitId: unitUn, quantityOnHand: 100, cost: 10,
    },
  })).id;

  produtoLigadoId = (await prisma.product.create({
    data: {
      storeId, categoryId: categoriaId, name: "Bolo", slug: `bl-${Date.now()}`,
      description: "", basePrice: 50, inventoryItemId: itemId,
    },
  })).id;
});
afterAll(limparBanco);

async function criarPedido(opcoes: {
  total?: number;
  produtoId?: string | null;
  paymentMethod?: string;
  paymentStatus?: "PENDING" | "PAID";
  quantity?: number;
} = {}) {
  return prisma.order.create({
    data: {
      storeId,
      number: numero++,
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: (opcoes.paymentMethod ?? "PIX") as any,
      paymentStatus: opcoes.paymentStatus ?? "PENDING",
      subtotal: opcoes.total ?? 100,
      total: opcoes.total ?? 100,
      items: {
        create: [{
          productId: opcoes.produtoId === undefined ? produtoLigadoId : opcoes.produtoId,
          productNameSnapshot: "Bolo",
          unitPrice: opcoes.total ?? 100,
          quantity: opcoes.quantity ?? 1,
        }],
      },
    },
    include: { items: true },
  });
}

/** Leva o pedido até COMPLETED pela máquina de estados, gerando o histórico. */
async function concluir(orderId: string) {
  await transitionOrderStatus(storeId, orderId, "PREPARING", { authorType: "SYSTEM" } as any);
  await OrderInventoryHandler.syncOrderStatus(orderId, "PREPARING");
  await transitionOrderStatus(storeId, orderId, "COMPLETED", { authorType: "SYSTEM" } as any);
}

const janelaLarga = () => ({
  de: new Date(Date.now() - 90 * 24 * 3600_000),
  ate: new Date(Date.now() + 24 * 3600_000),
});

/** Os pedidos que o motor financeiro considerou venda. */
async function pedidosContados() {
  const { de, ate } = janelaLarga();
  const r = await InventoryCostService.getCostReport(storeId, de, ate);
  return r.orders.map((o) => o.orderId);
}

const kpis = () => InventoryCostService.getFinancialKPIs(storeId, 90);

describe("o que NÃO é receita", () => {
  it("01 · RECEIVED + PENDING não é receita", async () => {
    const p = await criarPedido();
    expect(await pedidosContados()).not.toContain(p.id);
    expect((await kpis()).totalSalesValue).toBe(0);
  });

  it("02 · RECEIVED + PAID ainda não é receita", async () => {
    /*
     * O dinheiro entrou, mas a venda não se realizou. Pagamento é caixa;
     * receita é competência, e o evento que a reconhece é a conclusão.
     */
    const p = await criarPedido({ paymentStatus: "PAID" });
    expect(await pedidosContados()).not.toContain(p.id);
    expect((await kpis()).totalSalesValue).toBe(0);
  });

  it("03 · RECEIVED → CANCELLED não gera receita nem CMV", async () => {
    const p = await criarPedido();
    await OrderInventoryHandler.onOrderReceived(p.id);
    await transitionOrderStatus(storeId, p.id, "CANCELLED", { authorType: "SYSTEM" } as any);
    await OrderInventoryHandler.syncOrderStatus(p.id, "CANCELLED");

    const k = await kpis();
    expect(k.totalSalesValue).toBe(0);
    expect(k.totalCost).toBe(0);
  });

  it("04 · PREPARING → CANCELLED não gera receita, e a perda não vira CMV", async () => {
    /*
     * O consumo aconteceu de verdade e virou LOSS. Mas perda não é custo de
     * venda: não houve venda. O `reversedBy` gravado no consumo é o que o
     * mantém fora do CMV.
     */
    const p = await criarPedido();
    await OrderInventoryHandler.onOrderReceived(p.id);
    await transitionOrderStatus(storeId, p.id, "PREPARING", { authorType: "SYSTEM" } as any);
    await OrderInventoryHandler.syncOrderStatus(p.id, "PREPARING");
    await transitionOrderStatus(storeId, p.id, "CANCELLED", { authorType: "SYSTEM" } as any);
    await OrderInventoryHandler.syncOrderStatus(p.id, "CANCELLED");

    const k = await kpis();
    expect(k.totalSalesValue).toBe(0);
    expect(k.totalCost).toBe(0);
    // A perda existe no estoque, só não no CMV.
    expect(await prisma.inventoryMovement.count({ where: { storeId, type: "LOSS" } })).toBe(1);
  });

  it("05 · pedido apagado (deletedAt) sai da receita", async () => {
    const p = await criarPedido();
    await concluir(p.id);
    expect((await kpis()).totalSalesValue).toBe(100);

    await prisma.order.update({ where: { id: p.id }, data: { deletedAt: new Date() } });

    expect((await kpis()).totalSalesValue).toBe(0);
    expect(await pedidosContados()).not.toContain(p.id);
  });
});

describe("o que É receita", () => {
  it("06 · COMPLETED entra com Order.total", async () => {
    const p = await criarPedido({ total: 137.5 });
    await concluir(p.id);

    const k = await kpis();
    expect(k.totalSalesValue).toBeCloseTo(137.5, 4);
    expect(k.totalOrders).toBe(1);
    expect(await pedidosContados()).toContain(p.id);
  });

  it("07 · o desconto NÃO é subtraído de novo", async () => {
    /*
     * `Order.total` já é `subtotal + deliveryFee − discount`, feito no
     * checkout. Um relatório que subtraísse `discount` outra vez entregaria uma
     * receita menor do que o cliente efetivamente pagou.
     */
    const p = await prisma.order.create({
      data: {
        storeId, number: numero++, customerName: "C", customerPhone: "11999999999",
        paymentMethod: "PIX", subtotal: 100, discount: 30, deliveryFee: 0, total: 70,
        items: { create: [{ productId: produtoLigadoId, productNameSnapshot: "Bolo", unitPrice: 100, quantity: 1 }] },
      },
    });
    await concluir(p.id);

    expect((await kpis()).totalSalesValue).toBeCloseTo(70, 4); // não 40
  });

  it("08 · PAYROLL entra na receita mesmo ficando PENDING para sempre", async () => {
    /*
     * O CENÁRIO QUE PROÍBE ANCORAR RECEITA EM `paymentStatus`.
     *
     * Concluir um pedido quita o pagamento sozinho — menos no desconto em
     * folha, que continua PENDING de propósito porque o acerto é no salário.
     * Uma regra baseada em PAID apagaria toda venda a funcionário.
     */
    const p = await criarPedido({ paymentMethod: "PAYROLL", total: 80 });
    await concluir(p.id);

    const depois = await prisma.order.findUniqueOrThrow({ where: { id: p.id } });
    expect(depois.paymentStatus).toBe("PENDING");
    expect(depois.status).toBe("COMPLETED");

    expect((await kpis()).totalSalesValue).toBeCloseTo(80, 4);
  });

  it("09 · estorno é redutor da receita", async () => {
    const p = await criarPedido({ total: 100 });
    await concluir(p.id);
    await prisma.order.update({
      where: { id: p.id },
      data: { refund: 40, refundedAt: new Date() },
    });

    expect((await kpis()).totalSalesValue).toBeCloseTo(60, 4);
  });
});

describe("data de competência", () => {
  it("10 · a venda pertence ao dia em que foi CONCLUÍDA, não ao da criação", async () => {
    /*
     * Pedido feito ontem 23h50, concluído hoje 00h10. Agrupar por `createdAt`
     * jogaria a receita no dia de ontem — e o fechamento de ontem mudaria
     * depois de fechado, todo fim de expediente.
     */
    const p = await criarPedido();
    await concluir(p.id);

    const ontem = new Date(Date.now() - 24 * 3600_000);
    await prisma.order.update({ where: { id: p.id }, data: { createdAt: ontem } });

    // Janela que cobre só HOJE: a criação está fora, a conclusão está dentro.
    const soHoje = await InventoryCostService.getCostReport(
      storeId,
      new Date(Date.now() - 3600_000),
      new Date(Date.now() + 3600_000),
    );
    expect(soHoje.orders.map((o) => o.orderId)).toContain(p.id);
  });

  it("11 · pedido legado sem histórico cai no createdAt", async () => {
    /*
     * Pedidos concluídos antes de o histórico de status passar a ser gravado
     * não têm a linha COMPLETED. Descartá-los apagaria vendas reais do
     * passado, então esses — e só esses — voltam a usar a data de criação.
     */
    const p = await prisma.order.create({
      data: {
        storeId, number: numero++, customerName: "C", customerPhone: "11999999999",
        paymentMethod: "PIX", status: "COMPLETED", subtotal: 90, total: 90,
        items: { create: [{ productId: produtoLigadoId, productNameSnapshot: "Bolo", unitPrice: 90, quantity: 1 }] },
      },
    });
    expect(await prisma.orderStatusHistory.count({ where: { orderId: p.id } })).toBe(0);

    expect((await kpis()).totalSalesValue).toBeCloseTo(90, 4);
    expect(await pedidosContados()).toContain(p.id);
  });
});

describe("ticket médio", () => {
  it("12 · é receita por pedido, não custo por pedido", async () => {
    /*
     * O campo `averageOrderValue` era preenchido com `averageCostPerOrder`.
     * Aqui a diferença é gritante de propósito: 100 de receita contra 10 de
     * custo. Se o número voltar a ser 10, o defeito voltou.
     */
    const a = await criarPedido({ total: 100 });
    const b = await criarPedido({ total: 300 });
    await concluir(a.id);
    await concluir(b.id);

    const k = await kpis();
    expect(k.totalOrders).toBe(2);
    expect(k.averageOrderValue).toBeCloseTo(200, 4); // (100 + 300) / 2
    expect(k.averageOrderValue).not.toBeCloseTo(k.totalCost / 2, 4);
  });
});
