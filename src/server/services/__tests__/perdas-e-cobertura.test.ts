import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import { InventoryService } from "@/server/services/inventory-service";
import { createOrderFromCheckout, type CheckoutInput } from "@/server/services/order-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";

/*
 * TRÊS CATEGORIAS, NÃO DUAS.
 *
 * O resultado do restaurante tem receita, CMV e PERDAS — e a terceira não é uma
 * variação das outras. Material que virou lixo não vendeu nada (não é receita) e
 * não é custo de venda nenhuma (não é CMV). Somá-lo ao CMV faria a margem cair
 * por um motivo que não é a margem; ignorá-lo, como acontecia, faz o dinheiro
 * sumir sem explicação.
 *
 * Junto vem a COBERTURA em reais: a porcentagem já existia, mas ninguém
 * administra um restaurante em porcentagem. A pergunta é quanto faturamento
 * ficou sem custo medido.
 *
 * E a marca de estoque inconsistente, que era gravada em quatro lugares e lida
 * em nenhum.
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

  slugDaLoja = `fin-${Date.now()}`;
  const loja = await prisma.store.create({ data: { slug: slugDaLoja, name: "Cozinha" } });
  storeId = loja.id;
  await prisma.storeSettings.create({
    data: { storeId, whatsappNumber: "11999999999" },
  });
});
afterAll(limparBanco);

const HOJE = () => {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 1);
  return { inicio, fim };
};

async function insumo(nome: string, saldo: number, custo: number | null) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: nome, baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    saldo > 0 && custo !== null
      ? { quantidade: saldo, precoDaEmbalagem: custo }
      : undefined,
  );
}

async function produto(nome: string, inventoryItemId?: string, preco = 30) {
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
      ...(inventoryItemId ? { inventoryItemId } : {}),
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

/** Leva o pedido até COMPLETED passando por PREPARING, que é quem baixa. */
async function concluir(orderId: string) {
  await OrderInventoryHandler.onOrderPreparing(orderId);
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "COMPLETED", statusHistory: { create: { status: "COMPLETED", authorType: "SYSTEM" } } },
  });
}

// ═══════════════════════════════ receita e apuração

describe("a regra de reconhecimento não mudou", () => {
  it("01 · venda COMPLETED continua sendo reconhecida", async () => {
    const item = await insumo("Bolo", 10, 12);
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.totalOrders).toBe(1);
    expect(kpi.totalSalesValue).toBeCloseTo(30, 2);
  });

  it("02 · pedido sem custo NÃO vira custo zero", async () => {
    /*
     * O defeito mais caro do relatório antigo: produto sem vínculo chegava como
     * custo zero e a tela anunciava margem de 100%. Ausência de dado virava
     * lucro.
     */
    const p = await produto("Refrigerante", undefined, 8);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.totalSalesValue).toBeCloseTo(8, 2);
    expect(kpi.receitaApurada).toBe(0);
    expect(kpi.margemApurada).toBeNull();
  });

  it("03 · venda sem CMV aparece como NÃO apurada", async () => {
    const p = await produto("Refrigerante", undefined, 8);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.pedidosSemVinculo).toBe(1);
    expect(kpi.pedidosApurados).toBe(0);
  });

  it("04 · a cobertura é calculada sobre a receita das LINHAS", async () => {
    const item = await insumo("Bolo", 10, 12);
    const medido = await produto("Bolo", item.id, 30);
    const semCusto = await produto("Refrigerante", undefined, 10);

    for (const p of [medido, semCusto]) {
      const r = await comprar(p.slug);
      if (!r.ok) throw new Error(r.error);
      await concluir(r.orderId);
    }

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    // 30 de 40 medidos.
    expect(kpi.receitaDasLinhas).toBeCloseTo(40, 2);
    expect(kpi.receitaApurada).toBeCloseTo(30, 2);
    expect(kpi.cobertura).toBeCloseTo(75, 1);
  });

  it("05 · o faturamento SEM custo apurado sai em reais", async () => {
    // A porcentagem já existia; o que faltava era o número que faz alguém ir
    // cadastrar o insumo.
    const item = await insumo("Bolo", 10, 12);
    const medido = await produto("Bolo", item.id, 30);
    const semCusto = await produto("Refrigerante", undefined, 10);

    for (const p of [medido, semCusto]) {
      const r = await comprar(p.slug);
      if (!r.ok) throw new Error(r.error);
      await concluir(r.orderId);
    }

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.receitaSemCusto).toBeCloseTo(10, 2);
    expect(kpi.receitaSemCusto).toBeCloseTo(kpi.receitaDasLinhas - kpi.receitaApurada, 6);
  });

  it("06 · a margem usa SOMENTE a receita apurada", async () => {
    const item = await insumo("Bolo", 10, 12);
    const medido = await produto("Bolo", item.id, 30);
    const semCusto = await produto("Refrigerante", undefined, 10);

    for (const p of [medido, semCusto]) {
      const r = await comprar(p.slug);
      if (!r.ok) throw new Error(r.error);
      await concluir(r.orderId);
    }

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    // (30 − 12) / 30 = 60%. Diluir por 40 daria 45% e pioraria conforme o
    // cadastro ficasse incompleto — o oposto do que a métrica deve fazer.
    expect(kpi.margemApurada).toBeCloseTo(60, 1);
    expect(kpi.custoApurado).toBeCloseTo(12, 2);
  });
});

// ═══════════════════════════════ perdas

describe("perdas: a terceira categoria", () => {
  it("07 · cancelamento após o preparo vira PERDA, não CMV", async () => {
    const item = await insumo("Bolo", 10, 12);
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);

    await OrderInventoryHandler.onOrderPreparing(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);

    expect(perdas.total).toBeCloseTo(12, 2);
    expect(perdas.linhas).toHaveLength(1);
    expect(perdas.linhas[0].item).toBe("Bolo");
  });

  it("08 · o REVERSAL do par não é contado como perda", async () => {
    /*
     * O cancelamento grava REVERSAL + LOSS, que somam zero no saldo. Se os dois
     * entrassem, a perda apareceria em dobro; se o filtro fosse pelo saldo em
     * vez do tipo, apareceria zerada.
     */
    const item = await insumo("Bolo", 10, 12);
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await OrderInventoryHandler.onOrderPreparing(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);

    /*
     * Há MAIS de um REVERSAL: um estorna a reserva no preparo, outro anula o
     * consumo no cancelamento. Nenhum deles pode virar perda — o filtro é pelo
     * TIPO, não pelo efeito no saldo.
     */
    const reversals = await prisma.inventoryMovement.count({
      where: { storeId, type: "REVERSAL" },
    });
    expect(reversals).toBeGreaterThan(0);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    // ...e mesmo assim só a LOSS conta.
    expect(perdas.linhas).toHaveLength(1);
    expect(perdas.total).toBeCloseTo(12, 2);
  });

  it("09 · a mesma perda não é contada duas vezes", async () => {
    const item = await insumo("Bolo", 10, 12);
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await OrderInventoryHandler.onOrderPreparing(r.orderId);

    // Cancelar duas vezes: a segunda passada é idempotente por construção.
    await OrderInventoryHandler.onOrderCancelled(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    expect(perdas.linhas).toHaveLength(1);
    expect(perdas.total).toBeCloseTo(12, 2);
  });

  it("10 · o pedido cancelado sai do CMV e a receita não conta", async () => {
    const item = await insumo("Bolo", 10, 12);
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await OrderInventoryHandler.onOrderPreparing(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);
    await prisma.order.update({ where: { id: r.orderId }, data: { status: "CANCELLED" } });

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.totalOrders).toBe(0);
    expect(kpi.totalSalesValue).toBe(0);
    // O material aparece UMA vez: como perda.
    expect(kpi.perdas).toBeCloseTo(12, 2);
  });

  it("11 · perda com custo desconhecido não vira zero", async () => {
    // Mesma regra do CMV: ausência de dado não é ausência de valor.
    const item = await prisma.inventoryItem.create({
      data: {
        storeId,
        name: "Sem custo",
        itemType: "PREPARED",
        baseUnitId: "unit_un",
        quantityOnHand: 5,
        cost: null,
      },
    });
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#manual`,
      itemId: item.id,
      type: "LOSS",
      quantity: 2,
      unitId: "unit_un",
      authorType: "SYSTEM",
      note: "Quebra",
    } as any);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    expect(perdas.total).toBe(0);
    expect(perdas.semCusto).toBe(1);
    expect(perdas.linhas[0].valor).toBeNull();
  });

  it("12 · a perda carrega o rastro até a origem", async () => {
    const item = await insumo("Bolo", 10, 12);
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await OrderInventoryHandler.onOrderPreparing(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    expect(perdas.linhas[0].origem).toBe("ORDER");
    expect(perdas.linhas[0].referencia).toBe(r.orderId);
    expect(perdas.linhas[0].movimentoId).toBeTruthy();
  });

  it("13 · perda NÃO entra no CMV nem no faturamento", async () => {
    const item = await insumo("Bolo", 20, 12);
    const p = await produto("Bolo", item.id, 30);

    // Uma venda concluída...
    const venda = await comprar(p.slug);
    if (!venda.ok) throw new Error(venda.error);
    await concluir(venda.orderId);

    // ...e uma perda avulsa.
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#avulsa`,
      itemId: item.id,
      type: "LOSS",
      quantity: 3,
      unitId: "unit_un",
      costAtTime: 12,
      authorType: "SYSTEM",
    } as any);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.totalSalesValue).toBeCloseTo(30, 2);
    expect(kpi.custoApurado).toBeCloseTo(12, 2); // só o da venda
    expect(kpi.perdas).toBeCloseTo(36, 2); // 3 × 12, à parte
  });
});

// ═══════════════════════════════ estoque inconsistente

describe("estoque inconsistente é visível e NÃO cancela receita", () => {
  it("14 · pedido com estoque insuficiente é marcado e continua faturando", async () => {
    /*
     * O ponto inteiro desta tarefa. A marca existia no banco e não chegava a
     * ninguém; um pedido podia concluir sem consumo e derrubar a cobertura em
     * silêncio.
     */
    const item = await insumo("Bolo", 1, 12);
    const p = await produto("Bolo", item.id, 30);

    const r = await comprar(p.slug, 3); // 1 em estoque, cliente pede 3
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await concluir(r.orderId);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);

    expect(kpi.pedidosInconsistentes).toBe(1);
    expect(kpi.valorInconsistente).toBeCloseTo(90, 2);
    // A RECEITA CONTINUA VALENDO — é a frase que o painel precisa dizer.
    expect(kpi.totalSalesValue).toBeCloseTo(90, 2);
    expect(kpi.totalOrders).toBe(1);
  });

  it("15 · sem inconsistência, os indicadores ficam zerados", async () => {
    // Um aviso que aparece sempre vira moldura e ninguém lê no dia que importa.
    const item = await insumo("Bolo", 10, 12);
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await concluir(r.orderId);

    const kpi = await InventoryCostService.getFinancialKPIs(storeId, 1);
    expect(kpi.pedidosInconsistentes).toBe(0);
    expect(kpi.valorInconsistente).toBe(0);
  });

  it("16 · estoque insuficiente continua NÃO bloqueando a compra", async () => {
    const item = await insumo("Bolo", 0, 12);
    const p = await produto("Bolo", item.id, 30);

    const r = await comprar(p.slug, 2);

    expect(r.ok).toBe(true);
    // E nada de estoque vaza para o cliente.
    expect(JSON.stringify(r)).not.toMatch(/estoque|dispon|resta/i);
  });
});

// ═══════════════════════════════ isolamento

describe("isolamento por loja", () => {
  it("17 · perdas de outra loja não entram", async () => {
    const outra = await prisma.store.create({
      data: { slug: `outra-${Date.now()}`, name: "Outra" },
    });
    const itemDela = await prisma.inventoryItem.create({
      data: {
        storeId: outra.id,
        name: "Bolo de fora",
        itemType: "PREPARED",
        baseUnitId: "unit_un",
        quantityOnHand: 10,
        cost: 50,
      },
    });
    await InventoryService.recordMovement(outra.id, {
      idempotencyKey: `${outra.id}#LOSS#x`,
      itemId: itemDela.id,
      type: "LOSS",
      quantity: 2,
      unitId: "unit_un",
      costAtTime: 50,
      authorType: "SYSTEM",
    } as any);

    const { inicio, fim } = HOJE();
    const minhas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);

    expect(minhas.total).toBe(0);
    expect(minhas.linhas).toHaveLength(0);
  });
});

// ═══════════════════════════════ a tela de perdas

describe("detalhe da perda: o que a tela precisa mostrar", () => {
  it("18 · cada linha traz unidade, custo unitário e total coerentes", async () => {
    /*
     * O unitário sai do MESMO custo que compõe o total — não é uma segunda
     * conta. Se os dois discordassem, o dono não teria como saber qual acreditar.
     */
    const item = await insumo("Bolo", 20, 12);
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#detalhe`,
      itemId: item.id,
      type: "LOSS",
      quantity: 3,
      unitId: "unit_un",
      costAtTime: 12,
      authorType: "SYSTEM",
      note: "Caiu no chão",
    } as any);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    const linha = perdas.linhas[0];

    expect(linha.quantidade).toBe(3);
    expect(linha.unidade).toBe("un");
    expect(linha.custoUnitario).toBeCloseTo(12, 4);
    expect(linha.valor).toBeCloseTo(36, 2);
    // O total da tela é a soma das linhas, sem arredondamento pelo caminho.
    expect(perdas.total).toBeCloseTo(linha.valor!, 6);
    expect(linha.motivo).toBe("Caiu no chão");
  });

  it("19 · a perda sem custo tem unitário e valor NULOS, não zero", async () => {
    const item = await prisma.inventoryItem.create({
      data: {
        storeId,
        name: "Sem custo",
        itemType: "PREPARED",
        baseUnitId: "unit_un",
        quantityOnHand: 5,
        cost: null,
      },
    });
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#nulo`,
      itemId: item.id,
      type: "LOSS",
      quantity: 2,
      unitId: "unit_un",
      authorType: "SYSTEM",
    } as any);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);

    expect(perdas.linhas[0].custoUnitario).toBeNull();
    expect(perdas.linhas[0].valor).toBeNull();
    // A linha APARECE na tela; o que não aparece é um valor inventado.
    expect(perdas.linhas).toHaveLength(1);
    expect(perdas.semCusto).toBe(1);
  });

  it("20 · o custo HISTÓRICO manda, mesmo se o do item mudar depois", async () => {
    // `costAtTime` é o que o material valia quando saiu. O preço de hoje não
    // descreve o prejuízo de ontem.
    const item = await insumo("Bolo", 20, 12);
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#historico`,
      itemId: item.id,
      type: "LOSS",
      quantity: 2,
      unitId: "unit_un",
      costAtTime: 12,
      authorType: "SYSTEM",
    } as any);

    await prisma.inventoryItem.update({ where: { id: item.id }, data: { cost: 99 } });

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);
    expect(perdas.total).toBeCloseTo(24, 2); // 2 × 12, não 2 × 99
  });

  it("21 · LOSS revertida some da lista", async () => {
    const item = await insumo("Bolo", 20, 12);
    const perda = await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#estornavel`,
      itemId: item.id,
      type: "LOSS",
      quantity: 2,
      unitId: "unit_un",
      costAtTime: 12,
      authorType: "SYSTEM",
    } as any);

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#REVERSAL#${(perda as any).id}`,
      itemId: item.id,
      type: "REVERSAL",
      quantity: 2,
      unitId: "unit_un",
      originalMovementId: (perda as any).id,
      authorType: "SYSTEM",
    } as any);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);

    expect(perdas.linhas).toHaveLength(0);
    expect(perdas.total).toBe(0);
  });

  it("22 · a origem distingue pedido, produção e lançamento manual", async () => {
    const item = await insumo("Bolo", 30, 12);

    // manual: sem referência
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#LOSS#manual2`,
      itemId: item.id,
      type: "LOSS",
      quantity: 1,
      unitId: "unit_un",
      costAtTime: 12,
      authorType: "SYSTEM",
    } as any);

    // pedido cancelado depois do preparo
    const p = await produto("Bolo", item.id, 30);
    const r = await comprar(p.slug);
    if (!r.ok) throw new Error(r.error);
    await OrderInventoryHandler.onOrderPreparing(r.orderId);
    await OrderInventoryHandler.onOrderCancelled(r.orderId);

    const { inicio, fim } = HOJE();
    const perdas = await InventoryCostService.perdasNoPeriodo(storeId, inicio, fim);

    const doPedido = perdas.linhas.find((l) => l.origem === "ORDER");
    const manual = perdas.linhas.find((l) => l.origem === null);

    expect(doPedido?.referencia).toBe(r.orderId);
    expect(manual).toBeTruthy();
    expect(manual?.referencia).toBeNull();
    // Toda linha carrega o id do movimento, para conferir contra o razão.
    for (const l of perdas.linhas) expect(l.movimentoId).toBeTruthy();
  });
});
