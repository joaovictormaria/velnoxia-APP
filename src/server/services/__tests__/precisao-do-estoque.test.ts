import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
} from "@/lib/conversao-de-unidade";

/*
 * PRECISAO DECIMAL DO ESTOQUE E DO CUSTO.
 *
 * O estoque por conteudo de embalagem produz dizima: 40 ml tirados de uma
 * garrafa de 900 ml gastam 40/900 = 0,044444... de unidade. Com as quatro casas
 * antigas isso virava 0,0444, e o erro NAO se cancelava — a mesma receita da
 * sempre a mesma dizima e arredonda sempre para o mesmo lado, entao acumulava
 * linearmente e sempre para menos. Quatro litros de oleo a cada cem mil vendas,
 * e uma contagem fisica que nunca fechava.
 *
 * Estes testes fixam a precisao de `Decimal(19,8)` nos pontos onde ela e
 * realmente exercida, e medem a deriva contra o valor matematico em vez de
 * confiar numa tolerancia frouxa.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
const SEED_CONVERSOES = "20260827000000_semear_conversoes_de_unidade";

/** O que a coluna consegue guardar. Vale para quantidade e para custo. */
const CASAS = 8;
const TOLERANCIA = Math.pow(10, -CASAS) / 2;

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
  await semear(SEED_CONVERSOES);
  const loja = await prisma.store.create({
    data: {
      slug: `prec-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: "Precisão",
      settings: {
        create: { storeName: "P", whatsappNumber: "11999999999", inventoryControlEnabled: true },
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

const oleo = (contentSize = 900, qtd = 6, preco = 5) =>
  InventoryService.criarItemComSaldoInicial(
    storeId,
    {
      name: "Óleo",
      baseUnitId: "unit_un",
      itemType: "INGREDIENT",
      contentSize,
      contentUnit: "unit_ml",
    } as any,
    { quantidade: qtd, precoDaEmbalagem: preco },
  );

const produto = (nome: string) =>
  prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      description: nome,
      basePrice: 8,
      tipoDeControle: "PRODUCAO",
    },
  });

const ficha = (productId: string, itens: Array<{ inventoryItemId: string; quantity: number; unitId: string }>) =>
  CompositionService.createComposition(storeId, productId, {
    productId,
    isActive: true,
    items: itens.map((l, i) => ({ ...l, sortOrder: i })),
  } as any);

async function vender(productId: string, quantity: number) {
  const order = await prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 100000000),
      customerName: "C",
      customerPhone: "11999999999",
      paymentMethod: "PIX",
      status: "COMPLETED",
      subtotal: 8,
      total: 8,
      items: { create: [{ productId, productNameSnapshot: "x", unitPrice: 8, quantity }] },
    },
  });
  await prisma.$transaction((tx) => OrderInventoryHandler.reservarNaCriacao(tx, order.id, storeId));
  await OrderInventoryHandler.onOrderPreparing(order.id);
  return order;
}

const movimento = (itemId: string, orderId: string) =>
  prisma.inventoryMovement.findFirstOrThrow({
    where: { storeId, itemId, type: "CONSUMPTION", reference: orderId },
    include: { unit: true },
  });

const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityOnHand);

// ══════════════════════════════════════════════════════════════════════
describe("as colunas guardam oito casas de verdade", () => {
  /*
   * O teste mais direto que existe: grava uma dizima e le de volta. Se a coluna
   * voltar para quatro casas algum dia, este e o primeiro a cair.
   */
  it("o razao guarda 0,04444444 sem cortar", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const order = await vender(p.id, 1);
    const mov = await movimento(item.id, order.id);

    expect(mov.quantity.toString()).toBe("-0.04444444");
    expect(Number(mov.quantity)).toBeCloseTo(-(40 / 900), 7);
  });

  it("o saldo guarda 5,95555556 sem cortar", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    await vender(p.id, 1);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(depois.quantityOnHand.toString()).toBe("5.95555556");
  });

  it("costAtTime tambem tem oito casas", async () => {
    // R$ 5,00 o pacote de 900 ml, contado em ml: R$ 0,00555555.../ml
    const item = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Óleo a granel", baseUnitId: "unit_ml", itemType: "INGREDIENT", purchasePackSize: 900 } as any,
      { quantidade: 1, precoDaEmbalagem: 5 },
    );
    const gravado = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(gravado.cost!.toString()).toBe("0.00555556");
    // Com seis casas seria 0,005556 — oito casas dividem o erro por cem.
    expect(Math.abs(Number(gravado.cost) - 5 / 900)).toBeLessThan(1e-8);
  });
});

describe("CENÁRIO 1 — óleo 6 un × 900 ml, receita 40 ml", () => {
  it("movimento, saldo e custo, nos valores pedidos", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const order = await vender(p.id, 1);
    const mov = await movimento(item.id, order.id);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);

    expect(mov.unit.code).toBe("un");
    expect(Number(mov.quantity)).toBeCloseTo(-0.04444444, CASAS);
    expect(await saldo(item.id)).toBeCloseTo(5.95555556, CASAS);
    expect(Number(custo.totalCost)).toBeCloseTo(0.2222222, 7);
    // Contra o valor matematico, o desvio cabe na oitava casa.
    expect(Math.abs(Number(custo.totalCost) - (40 / 900) * 5)).toBeLessThan(1e-7);
  });
});

describe("CENÁRIO 2 — 1 ml de uma garrafa de 900 ml", () => {
  it("a fração mais dura ainda cabe: 0,00111111", async () => {
    const item = await oleo();
    const p = await produto("Gota");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 1, unitId: "unit_ml" }]);

    const order = await vender(p.id, 1);
    const mov = await movimento(item.id, order.id);

    expect(Number(mov.quantity)).toBeCloseTo(-0.00111111, CASAS);
    // Com quatro casas isto era 0,0011 — um por cento de erro.
    const erroRelativo = Math.abs(Math.abs(Number(mov.quantity)) - 1 / 900) / (1 / 900);
    expect(erroRelativo).toBeLessThan(1e-5);
  });
});

describe("CENÁRIO 3 — 100 vendas de 40 ml", () => {
  it("o consumo registrado acompanha o exato dentro da oitava casa", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const antes = await saldo(item.id);
    for (let i = 0; i < 100; i++) await vender(p.id, 1);
    const registrado = antes - (await saldo(item.id));

    const exato = 100 * (40 / 900);
    /*
     * A DERIVA ACUMULADA DE CEM VENDAS, medida e nao estimada.
     *
     * Cada venda erra 4,44x10^-9 un na oitava casa; em mililitros isso e
     * 4x10^-6 por venda, e cem vendas dao 0,0004 ml. Com as quatro casas
     * antigas o mesmo laco perdia 4 ML INTEIROS — dez mil vezes mais.
     *
     * O limite abaixo e 1/2500 de um mililitro. Nao e uma tolerancia frouxa
     * escolhida para o teste passar: e a projecao da auditoria (0,4 ml por cem
     * mil vendas) dividida por mil.
     */
    const derivaEmMl = Math.abs(exato - registrado) * 900;
    expect(derivaEmMl).toBeLessThan(1e-3);
    expect(derivaEmMl).toBeCloseTo(0.0004, 5);
    expect(registrado).toBeCloseTo(exato, 6);
    // 100 x 40 ml = 4000 ml. O razao entrega 3999,9996 — quatro decimos de
    // milesimo de mililitro de diferenca, os mesmos 0,0004 ml de acima.
    expect(registrado * 900).toBeCloseTo(4000, 3);
  });
});

describe("CENÁRIO 4 — dez vendas de 1 contra uma venda de 10", () => {
  it("os dois caminhos convergem", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const a0 = await saldo(item.id);
    for (let i = 0; i < 10; i++) await vender(p.id, 1);
    const dezVezesUm = a0 - (await saldo(item.id));

    const b0 = await saldo(item.id);
    await vender(p.id, 10);
    const umaDeDez = b0 - (await saldo(item.id));

    expect(dezVezesUm).toBeCloseTo(0.44444444, 7);
    expect(umaDeDez).toBeCloseTo(0.44444444, 7);
    /*
     * Nao sao identicos, e nem podem ser: a venda de dez arredonda uma vez, as
     * dez vendas arredondam dez vezes. Com quatro casas a diferenca era de
     * 0,36 ml; com oito ela nao chega a um decimo de milionesimo de mililitro.
     */
    expect(Math.abs(dezVezesUm - umaDeDez)).toBeLessThan(1e-6);
    expect(Math.abs(dezVezesUm - umaDeDez) * 900).toBeLessThan(1e-3);
  });
});

describe("CENÁRIO 5 — todas as conversões", () => {
  const mapa = () =>
    prisma.inventoryUnitConversion
      .findMany({ select: { fromUnitId: true, toUnitId: true, conversionFactor: true } })
      .then(montarMapaDeConversoes);

  /*
   * kg<->g e L<->ml sao potencias de dez: sempre exatos, com quatro casas ou
   * com oito. So o caminho do contentSize gera dizima — e e por ele que a
   * precisao importava.
   */
  it("kg <-> g e L <-> ml sao exatos", async () => {
    const m = await mapa();
    expect(converterParaUnidadeBase(100, "unit_g", { baseUnitId: "unit_kg" }, m)).toBe(0.1);
    expect(converterParaUnidadeBase(2, "unit_kg", { baseUnitId: "unit_g" }, m)).toBe(2000);
    expect(converterParaUnidadeBase(250, "unit_ml", { baseUnitId: "unit_l" }, m)).toBe(0.25);
    expect(converterParaUnidadeBase(2, "unit_l", { baseUnitId: "unit_ml" }, m)).toBe(2000);
  });

  it("kg <- g de ponta a ponta", async () => {
    const acucar = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Açúcar", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
      { quantidade: 10, precoDaEmbalagem: 5 },
    );
    const p = await produto("Bolo");
    await ficha(p.id, [{ inventoryItemId: acucar.id, quantity: 100, unitId: "unit_g" }]);
    const order = await vender(p.id, 1);
    expect(Number((await movimento(acucar.id, order.id)).quantity)).toBeCloseTo(-0.1, CASAS);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(0.5, CASAS);
  });

  it("L <- ml de ponta a ponta", async () => {
    const leite = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Leite", baseUnitId: "unit_l", itemType: "INGREDIENT" } as any,
      { quantidade: 10, precoDaEmbalagem: 4 },
    );
    const p = await produto("Vitamina");
    await ficha(p.id, [{ inventoryItemId: leite.id, quantity: 250, unitId: "unit_ml" }]);
    const order = await vender(p.id, 1);
    expect(Number((await movimento(leite.id, order.id)).quantity)).toBeCloseTo(-0.25, CASAS);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(1, CASAS);
  });

  it("un + contentSize <- L de ponta a ponta", async () => {
    const item = await oleo(900, 6, 5);
    const p = await produto("Fritura");
    // 1,8 L de uma garrafa de 900 ml = 2 garrafas exatas.
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 1.8, unitId: "unit_l" }]);
    const order = await vender(p.id, 1);
    expect(Number((await movimento(item.id, order.id)).quantity)).toBeCloseTo(-2, CASAS);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(10, CASAS);
  });
});

describe("o financeiro recebe o custo com a precisão nova", () => {
  it("CMV, lucro e margem saem da mesma quantidade de oito casas", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const order = await vender(p.id, 1);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);

    // O breakdown expoe a mesma quantidade que o razao guardou.
    expect(custo.costBreakdown).toHaveLength(1);
    const linha = custo.costBreakdown[0];
    expect(Number(linha.quantity)).toBeCloseTo(0.04444444, CASAS);
    expect(Number(linha.unitCost)).toBeCloseTo(5, CASAS);
    expect(Number(linha.totalCost)).toBeCloseTo(0.2222222, 7);

    // Lucro e margem sobre o pedido de R$ 8,00.
    const receita = 8;
    const lucro = receita - Number(custo.totalCost);
    expect(lucro).toBeCloseTo(7.7777778, 6);
    expect((lucro / receita) * 100).toBeCloseTo(97.2222225, 5);
  });

  /*
   * O somatorio de muitas vendas e onde o erro de precisao apareceria como
   * divergencia de CMV. Cem pedidos, cada um com sua propria linha.
   */
  it("o CMV de cem pedidos acompanha o exato", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    let acumulado = 0;
    for (let i = 0; i < 100; i++) {
      const o = await vender(p.id, 1);
      acumulado += Number((await InventoryCostService.calculateOrderCost(storeId, o.id)).totalCost);
    }

    const exato = 100 * (40 / 900) * 5;
    expect(acumulado).toBeCloseTo(exato, 4);
    // Menos de um centesimo de centavo de divergencia em cem pedidos.
    expect(Math.abs(acumulado - exato)).toBeLessThan(1e-4);
  });
});

describe("a reserva e o consumo se cancelam exatamente", () => {
  /*
   * `quantityReserved` tem a mesma escala de `quantityOnHand` de proposito. Com
   * escalas diferentes, a reserva de 0,04444444 e o consumo de 0,0444 nao se
   * anulariam, e sobraria reserva presa para sempre.
   */
  it("depois do preparo nao sobra reserva", async () => {
    const item = await oleo();
    const p = await produto("Salgado");
    await ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    await vender(p.id, 7);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(depois.quantityReserved)).toBe(0);
    expect(Number(depois.quantityOnHand)).toBeCloseTo(6 - 7 * (40 / 900), 7);
  });
});
