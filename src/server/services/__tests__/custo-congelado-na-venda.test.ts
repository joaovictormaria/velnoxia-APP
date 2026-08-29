import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import { InventoryService } from "@/server/services/inventory-service";
import { createOrderFromCheckout, type CheckoutInput } from "@/server/services/order-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";

/*
 * O CUSTO DA VENDA É O DO DIA DA VENDA — e já era.
 *
 * Estes testes NÃO acompanham uma correção. Eles trancam uma garantia que o
 * sistema já dava e que ninguém provava: `recordMovement` carimba
 * `costAtTime` por padrão, com o custo lido da LINHA TRAVADA no instante do
 * movimento. O comentário que descreve isso está em `inventory-service.ts`,
 * junto ao `create`.
 *
 * Escrevi este arquivo achando que o consumo saía sem custo e que o CMV caía
 * para `item.cost` em tempo de leitura. Estava errado: a mutação — remover o
 * carimbo do lado do chamador — não derrubou teste nenhum, porque o carimbo
 * nunca vinha do chamador.
 *
 * Ficam porque a garantia é cara e não tinha cobertura: alterar o preço de um
 * insumo NÃO pode reescrever a margem de vendas já fechadas. É a mesma razão
 * pela qual `unitPrice` é copiado para o OrderItem em vez de lido do produto
 * na hora do relatório.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";
let slugDaLoja = "";

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
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${SEED_UNIDADES}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);

  slugDaLoja = `cc-${Date.now()}`;
  const loja = await prisma.store.create({ data: { slug: slugDaLoja, name: "Cozinha" } });
  storeId = loja.id;
  await prisma.storeSettings.create({ data: { storeId, whatsappNumber: "11999999999" } });
});
afterAll(limparBanco);

const HOJE = () => {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 1);
  return { inicio, fim };
};

async function insumo(nome: string, saldo: number, custoUnitario: number) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: nome, baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    { quantidade: saldo, precoDaEmbalagem: custoUnitario },
  );
}

async function produto(nome: string, inventoryItemId: string, preco = 50) {
  const categoria = await prisma.category.create({
    data: {
      storeId,
      name: "Doces",
      slug: `d-${Math.random().toString(36).slice(2, 8)}`,
      kind: "SIMPLE",
    },
  });
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`,
      description: nome,
      basePrice: preco,
      inventoryItemId,
    },
  });
}

const comprar = (slug: string, quantidade = 1) =>
  createOrderFromCheckout(storeId, {
    storeSlug: slugDaLoja,
    items: [{ productSlug: slug, quantity: quantidade, extraIds: [] }],
    customerName: "Cliente",
    customerPhone: "11999999999",
    type: "PICKUP",
    paymentMethod: "CASH",
  } as CheckoutInput);

async function concluir(orderId: string) {
  await OrderInventoryHandler.onOrderPreparing(orderId);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "COMPLETED",
      statusHistory: { create: { status: "COMPLETED", authorType: "SYSTEM" } },
    },
  });
}

const consumoDe = (orderId: string) =>
  prisma.inventoryMovement.findFirstOrThrow({
    where: { reference: orderId, type: "CONSUMPTION", referenceType: "ORDER" },
  });

describe("o consumo carimba o custo", () => {
  it("01 · a venda grava CONSUMPTION com costAtTime preenchido", async () => {
    // Sem ninguém passar o campo: o padrão de `recordMovement` é o custo da
    // linha travada no momento da baixa.
    const item = await insumo("Bolo", 10, 10);
    const p = await produto("Bolo", item.id, 50);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    const mov = await consumoDe(r.orderId);
    expect(mov.costAtTime).not.toBeNull();
    expect(Number(mov.costAtTime)).toBeCloseTo(10, 4);
  });

  it("02 · o CMV usa o costAtTime do movimento", async () => {
    const item = await insumo("Bolo", 10, 10);
    const p = await produto("Bolo", item.id, 50);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.custoApurado).toBeCloseTo(10, 2);
    expect(kpi.receitaApurada).toBeCloseTo(50, 2);
  });

  it("03 · mudar o custo do insumo NÃO reescreve a venda passada", async () => {
    /*
     * A GARANTIA CENTRAL. Se o CMV lesse `item.cost` em tempo de leitura,
     * dobrar o preço do insumo dobraria o custo de vendas já fechadas e a
     * margem do mês passado se moveria sozinha. O carimbo impede isso.
     */
    const item = await insumo("Bolo", 10, 10);
    const p = await produto("Bolo", item.id, 50);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { cost: 20 },
    });

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.custoApurado).toBeCloseTo(10, 2); // e NÃO 20
    expect(kpi.margemApurada).toBeCloseTo(80, 1); // (50 − 10) / 50
  });

  it("04 · a venda NOVA usa o custo novo", async () => {
    // O congelamento não é imobilismo: quem vende depois da alta paga a alta.
    const item = await insumo("Bolo", 10, 10);
    const p = await produto("Bolo", item.id, 50);

    const antiga = await comprar(p.slug);
    if (!antiga.ok) throw new Error(antiga.error);
    await concluir(antiga.orderId);

    await prisma.inventoryItem.update({ where: { id: item.id }, data: { cost: 20 } });

    const nova = await comprar(p.slug);
    if (!nova.ok) throw new Error(nova.error);
    await concluir(nova.orderId);

    expect(Number((await consumoDe(antiga.orderId)).costAtTime)).toBeCloseTo(10, 4);
    expect(Number((await consumoDe(nova.orderId)).costAtTime)).toBeCloseTo(20, 4);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.custoApurado).toBeCloseTo(30, 2); // 10 + 20
  });

  it("05 · insumo SEM custo grava nulo, não zero", async () => {
    /*
     * A regra que sustenta o CMV inteiro: ausência de dado não é ausência de
     * valor. Zero afirmaria que o ingrediente é de graça — foi essa afirmação
     * que produzia margem de 100%.
     */
    const item = await prisma.inventoryItem.create({
      data: {
        storeId,
        name: "Sem custo",
        itemType: "PREPARED",
        baseUnitId: "unit_un",
        quantityOnHand: 10,
        cost: null,
      },
    });
    const p = await produto("Sem custo", item.id, 50);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    expect((await consumoDe(r.orderId)).costAtTime).toBeNull();

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.pedidosSemCusto).toBe(1);
    expect(kpi.receitaApurada).toBe(0);
    expect(kpi.margemApurada).toBeNull();
  });
});

describe("o que não pode ter mudado", () => {
  it("06 · LOSS continua carimbando o próprio custo", async () => {
    const item = await insumo("Bolo", 10, 10);
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#x`,
      itemId: item.id,
      type: "LOSS",
      quantity: 2,
      unitId: "unit_un",
      costAtTime: 10,
      authorType: "SYSTEM",
    } as any);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    expect(perdas.total).toBeCloseTo(20, 2);
  });

  it("07 · cancelamento após PREPARING continua virando perda pelo custo do dia", async () => {
    const item = await insumo("Bolo", 10, 10);
    const p = await produto("Bolo", item.id, 50);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);

    await OrderInventoryHandler.onOrderPreparing(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);

    // O consumo saiu do CMV...
    const consumo = await consumoDe(r.orderId);
    const estorno = await prisma.inventoryMovement.findFirst({
      where: { originalMovementId: consumo.id, type: "REVERSAL" },
    });
    expect(estorno).not.toBeNull();

    // ...e virou perda, pelo custo carimbado no consumo.
    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    expect(perdas.total).toBeCloseTo(10, 2);
  });

  it("08 · a alta posterior do insumo não reescreve nem a perda", async () => {
    const item = await insumo("Bolo", 10, 10);
    const p = await produto("Bolo", item.id, 50);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await OrderInventoryHandler.onOrderPreparing(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);

    await prisma.inventoryItem.update({ where: { id: item.id }, data: { cost: 20 } });

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    expect(perdas.total).toBeCloseTo(10, 2);
  });

  it("09 · estoque insuficiente continua NÃO bloqueando a venda", async () => {
    const item = await insumo("Bolo", 1, 10);
    const p = await produto("Bolo", item.id, 50);

    const r = await comprar(p.slug, 3);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await concluir(r.orderId);

    // E o custo carimbado vale para as três unidades.
    const mov = await consumoDe(r.orderId);
    expect(Number(mov.costAtTime)).toBeCloseTo(10, 4);
    expect(Math.abs(Number(mov.quantity))).toBe(3);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.custoApurado).toBeCloseTo(30, 2);
    expect(kpi.pedidosInconsistentes).toBe(1);
  });
});
