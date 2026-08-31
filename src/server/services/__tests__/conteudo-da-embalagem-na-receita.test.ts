import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";
import { InventoryService } from "@/server/services/inventory-service";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { InventoryCostService } from "@/server/services/inventory-cost-service";

/*
 * O CONTEUDO DA EMBALAGEM, USADO NA RECEITA.
 *
 * Oleo comprado em garrafa: o estoque conta GARRAFAS (`un`), a receita pede
 * MILILITROS. Sao grandezas diferentes — COUNT e VOLUME — e por um tempo a
 * validacao recusou a combinacao, obrigando a escrever "1 un de oleo" numa
 * receita que usa 40 ml. Vinte e duas vezes e meia o consumo real, no estoque
 * e no custo.
 *
 * `contentSize` + `contentUnit` sempre disseram quanto cabe numa unidade de
 * estoque, e `converterParaUnidadeBase` sempre soube dividir por esse numero.
 * O que faltava era a regra de compatibilidade enxergar o campo.
 *
 * Estes testes exercitam o caminho inteiro com a unidade da receita em OUTRA
 * GRANDEZA que a do estoque, ligadas so pelo conteudo declarado.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
const SEED_CONVERSOES = "20260827000000_semear_conversoes_de_unidade";
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
      slug: `conteudo-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: "Cozinha",
      settings: {
        create: {
          storeName: "Cozinha",
          whatsappNumber: "11999999999",
          inventoryControlEnabled: true,
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
 * Seis garrafas de 900 ml a R$ 5,00 cada.
 *
 * `precoDaEmbalagem` e o preco de UMA unidade de estoque — sem
 * `purchasePackSize`, a unidade de estoque E a garrafa. O total de R$ 30,00
 * sai de 6 x R$ 5,00, e o custo gravado e R$ 5,00 por garrafa.
 */
const oleo = () =>
  InventoryService.criarItemComSaldoInicial(
    storeId,
    {
      name: "Óleo",
      baseUnitId: "unit_un",
      itemType: "INGREDIENT",
      contentSize: 900,
      contentUnit: "unit_ml",
    } as any,
    { quantidade: 6, precoDaEmbalagem: 5 },
  );

const produto = (nome: string, dados: Record<string, unknown> = {}) =>
  prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      description: nome,
      basePrice: 8,
      ...dados,
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
      number: Math.floor(Math.random() * 1000000),
      customerName: "Cliente",
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

const consumo = (itemId: string, orderId: string) =>
  prisma.inventoryMovement.findFirst({
    where: { storeId, itemId, type: "CONSUMPTION", reference: orderId },
    include: { unit: true },
  });

const saldo = async (itemId: string) =>
  Number((await prisma.inventoryItem.findUnique({ where: { id: itemId } }))!.quantityOnHand);

describe("o cadastro representa 6 garrafas de 900 ml sem ambiguidade", () => {
  it("saldo conta garrafas; o conteudo fica no item", async () => {
    const item = await oleo();
    const gravado = await prisma.inventoryItem.findUnique({
      where: { id: item.id },
      include: { baseUnit: true },
    });
    expect(gravado!.baseUnit.code).toBe("un");
    expect(Number(gravado!.quantityOnHand)).toBe(6);
    expect(Number(gravado!.contentSize)).toBe(900);
    expect(gravado!.contentUnit).toBe("unit_ml");
    // R$ 30,00 / 6 garrafas: o custo e por unidade de ESTOQUE.
    expect(Number(gravado!.cost)).toBeCloseTo(5, 6);
  });
});

describe("a receita aceita a unidade do conteudo", () => {
  it("grava 40 ml num insumo contado em un", async () => {
    const item = await oleo();
    const salgado = await produto("Salgado", { tipoDeControle: "PRODUCAO" });

    const f: any = await ficha(salgado.id, [
      { inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" },
    ]);

    const linha = await prisma.compositionItem.findFirst({
      where: { compositionId: f.id },
      include: { unit: true },
    });
    expect(linha!.unit.code).toBe("ml");
    expect(Number(linha!.quantity)).toBe(40);
    // O item NAO foi tocado: a unidade da receita nao mexe no estoque.
    const depois = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(depois!.baseUnitId).toBe("unit_un");
  });

  it("aceita tambem a outra unidade da mesma grandeza do conteudo (L)", async () => {
    const item = await oleo();
    const p = await produto("Fritura grande", { tipoDeControle: "PRODUCAO" });
    const f: any = await ficha(p.id, [
      { inventoryItemId: item.id, quantity: 1.8, unitId: "unit_l" },
    ]);
    expect(f.id).toBeTruthy();
  });

  it("continua aceitando a propria unidade base", async () => {
    const item = await oleo();
    const p = await produto("Fritura inteira", { tipoDeControle: "PRODUCAO" });
    const f: any = await ficha(p.id, [
      { inventoryItemId: item.id, quantity: 1, unitId: "unit_un" },
    ]);
    expect(f.id).toBeTruthy();
  });
});

describe("massa contra volume continua impossivel", () => {
  it("recusa 40 g num insumo cujo conteudo e ml", async () => {
    const item = await oleo();
    const p = await produto("Errado g", { tipoDeControle: "PRODUCAO" });
    await expect(
      ficha(p.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_g" }]),
    ).rejects.toThrow(/outra grandeza|não se converte/i);
    expect(await prisma.productComposition.count({ where: { productId: p.id } })).toBe(0);
  });

  it("recusa kg tambem", async () => {
    const item = await oleo();
    const p = await produto("Errado kg", { tipoDeControle: "PRODUCAO" });
    await expect(
      ficha(p.id, [{ inventoryItemId: item.id, quantity: 1, unitId: "unit_kg" }]),
    ).rejects.toThrow(/outra grandeza|não se converte/i);
  });

  /*
   * Sem conteudo declarado, `un` volta a falar so com `un`. E o caso dos ovos:
   * uma duzia nao tem "quanto cabe dentro".
   */
  it("insumo em un SEM conteudo recusa ml", async () => {
    const ovos = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Ovos", baseUnitId: "unit_un", itemType: "INGREDIENT" } as any,
      { quantidade: 30, precoDaEmbalagem: 0.8 },
    );
    const p = await produto("Omelete", { tipoDeControle: "PRODUCAO" });
    await expect(
      ficha(p.id, [{ inventoryItemId: ovos.id, quantity: 40, unitId: "unit_ml" }]),
    ).rejects.toThrow(/não se converte|grandeza/i);
  });
});

/*
 * O RAZAO TEM OITO CASAS.
 *
 * Eram quatro, e quatro nao bastavam: 40/900 = 0,044444... virava 0,0444 na
 * gravacao. O erro nao se cancelava — a mesma receita da sempre a mesma dizima
 * e arredonda sempre para o mesmo lado —, entao acumulava linearmente e sempre
 * para menos. Quatro litros de oleo a cada cem mil vendas.
 *
 * Com `Decimal(19,8)` o desvio cai para 0,4 ml nas mesmas cem mil vendas, e as
 * afirmacoes abaixo podem ser EXATAS em vez de aproximadas. `comoORazaoGrava`
 * continua aqui, agora com oito, porque a coluna ainda tem um limite e um teste
 * de precisao deve dize-lo em vez de escondê-lo atras de tolerancia frouxa.
 */
const CASAS_DO_RAZAO = 8;
const comoORazaoGrava = (n: number) => Number(n.toFixed(CASAS_DO_RAZAO));

describe("CRITÉRIO DE ACEITE — venda com receita em ml", () => {
  it("1 salgado com 40 ml: baixa 0,0444444 un e custa R$ 0,2222222", async () => {
    const item = await oleo();
    const salgado = await produto("Salgado", { tipoDeControle: "PRODUCAO" });
    await ficha(salgado.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const order = await vender(salgado.id, 1);

    const mov = await consumo(item.id, order.id);
    expect(mov!.type).toBe("CONSUMPTION");
    // O razao fala em unidade BASE, sempre.
    expect(mov!.unit.code).toBe("un");
    // 40/900 = 0,0444444... -> o razao grava 0,0444
    expect(Number(mov!.quantity)).toBeCloseTo(-comoORazaoGrava(40 / 900), 6);
    expect(Number(mov!.quantity)).toBeCloseTo(-0.04444444, 8);
    expect(Number(mov!.costAtTime)).toBeCloseTo(5, 6);

    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    /*
      O CUSTO HERDA A PRECISAO DA QUANTIDADE, e e assim que deve ser: ele e o
      produto de uma quantidade ja gravada por um custo unitario. As oito casas
      do razao chegam intactas ate aqui — o que sobra de erro contra o valor
      matematico e o arredondamento da OITAVA casa, nao um corte novo.
    */
    expect(Number(custo.totalCost)).toBeCloseTo(comoORazaoGrava(40 / 900) * 5, 10);
    // Exato: R$ 0,222222222... O razao entrega R$ 0,2222222.
    expect(Number(custo.totalCost)).toBeCloseTo((40 / 900) * 5, 6);
    expect(Math.abs(Number(custo.totalCost) - (40 / 900) * 5)).toBeLessThan(1e-7);

    // 6 un − 0,0444 = 5,9556
    expect(await saldo(item.id)).toBeCloseTo(6 - comoORazaoGrava(40 / 900), 6);
    expect(await saldo(item.id)).toBeCloseTo(5.95555556, 8);
  });

  it("10 salgados: 400 ml viram 0,4444444 un e sobram 5,5555556", async () => {
    const item = await oleo();
    const salgado = await produto("Salgado", { tipoDeControle: "PRODUCAO" });
    await ficha(salgado.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const order = await vender(salgado.id, 10);

    const mov = await consumo(item.id, order.id);
    expect(Number(mov!.quantity)).toBeCloseTo(-comoORazaoGrava(400 / 900), 6);
    expect(Number(mov!.quantity)).toBeCloseTo(-0.44444444, 8);
    expect(await saldo(item.id)).toBeCloseTo(6 - comoORazaoGrava(400 / 900), 6);
    expect(await saldo(item.id)).toBeCloseTo(5.55555556, 8);
    // 5,5556 garrafas x 900 ml = 5000,04 ml: os 5,4 L menos os 400 ml usados.
    expect((6 - comoORazaoGrava(400 / 900)) * 900).toBeCloseTo(5000, 4);

    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(comoORazaoGrava(400 / 900) * 5, 6);
  });

  /*
   * ONDE O ARREDONDAMENTO ACONTECE, e a consequencia dele.
   *
   * A conversao e o custo trabalham em ponto flutuante e Decimal de 6 casas; o
   * unico corte e na GRAVACAO do movimento, de 4 casas. Por isso vender dez de
   * uma vez NAO da o mesmo que dez vendas de um: a primeira arredonda uma vez
   * (0,4444), a segunda arredonda dez vezes (10 x 0,0444 = 0,4440).
   *
   * Com oito casas a diferenca cai para 4x10^-8 un — trinta e seis milionesimos
   * de mililitro. Os dois caminhos convergem, que era o que o Cenario 4 pedia.
   */
  it("10 vendas de 1 e 1 venda de 10 convergem", async () => {
    const item = await oleo();
    const salgado = await produto("Salgado", { tipoDeControle: "PRODUCAO" });
    await ficha(salgado.id, [{ inventoryItemId: item.id, quantity: 40, unitId: "unit_ml" }]);

    const um = await vender(salgado.id, 1);
    const dez = await vender(salgado.id, 10);

    const cUm = Number((await InventoryCostService.calculateOrderCost(storeId, um.id)).totalCost);
    const cDez = Number((await InventoryCostService.calculateOrderCost(storeId, dez.id)).totalCost);
    expect(cUm).toBeCloseTo((40 / 900) * 5, 6);
    expect(cDez).toBeCloseTo((400 / 900) * 5, 6);
    // Uma venda de 10 arredonda UMA vez; dez vendas de 1 arredondam dez vezes.
    // Com oito casas a diferenca some abaixo do decimo de centavo.
    expect(Math.abs(cDez - cUm * 10)).toBeLessThan(1e-5);
  });

  it("a caixa de 6 L tambem funciona: 250 ml custam R$ 1,0416667", async () => {
    const caixa = await InventoryService.criarItemComSaldoInicial(
      storeId,
      {
        name: "Leite em caixa",
        baseUnitId: "unit_un",
        itemType: "INGREDIENT",
        contentSize: 6,
        contentUnit: "unit_l",
      } as any,
      { quantidade: 4, precoDaEmbalagem: 25 },
    );
    const p = await produto("Café com leite", { tipoDeControle: "PRODUCAO" });
    await ficha(p.id, [{ inventoryItemId: caixa.id, quantity: 250, unitId: "unit_ml" }]);

    const order = await vender(p.id, 1);

    const mov = await consumo(caixa.id, order.id);
    expect(Number(mov!.quantity)).toBeCloseTo(-comoORazaoGrava(0.25 / 6), 6);
    expect(Number(mov!.quantity)).toBeCloseTo(-0.04166667, 8);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(comoORazaoGrava(0.25 / 6) * 25, 10);
    expect(Number(custo.totalCost)).toBeCloseTo((25 / 6) * 0.25, 6);
    expect(Math.abs(Number(custo.totalCost) - (25 / 6) * 0.25)).toBeLessThan(1e-6);
  });
});

describe("o que ja funcionava continua igual", () => {
  it("acucar em kg com receita em g", async () => {
    const acucar = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Açúcar", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
      { quantidade: 10, precoDaEmbalagem: 5 },
    );
    const p = await produto("Bolo", { tipoDeControle: "PRODUCAO" });
    await ficha(p.id, [{ inventoryItemId: acucar.id, quantity: 100, unitId: "unit_g" }]);

    const order = await vender(p.id, 1);
    expect(Number((await consumo(acucar.id, order.id))!.quantity)).toBeCloseTo(-0.1, 6);
    const custo = await InventoryCostService.calculateOrderCost(storeId, order.id);
    expect(Number(custo.totalCost)).toBeCloseTo(0.5, 6);
  });

  it("REVENDA com item em un continua baixando 1 por venda", async () => {
    const lata = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Coca lata", baseUnitId: "unit_un", itemType: "RESALE" } as any,
      { quantidade: 50, precoDaEmbalagem: 5 },
    );
    const p = await produto("Coca", { tipoDeControle: "REVENDA", inventoryItemId: lata.id });
    const order = await vender(p.id, 3);
    expect(Number((await consumo(lata.id, order.id))!.quantity)).toBeCloseTo(-3, 6);
  });
});
