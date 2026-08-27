import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { CustoDoPreparado } from "@/server/services/custo-do-preparado";
import { ProducaoService } from "@/server/services/producao-service";
import { CompositionService } from "@/server/services/composition-service";
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
} from "@/lib/conversao-de-unidade";

/*
 * Conversão de unidade entre a receita e o estoque, contra o Postgres local.
 *
 * NASCEU DE UMA RECEITA IMPOSSÍVEL. "Ficha de Bolo": 60 g de farinha, farinha
 * contada em kg. O formulário mostrava R$ 300,00 — tratava os 60 g como 60 kg —
 * e o servidor nem calculava: lançava, tanto no custo quanto na produção. O
 * item ficava cadastrado e impossível de produzir.
 *
 * A causa era não existir conversão nenhuma. `converterParaUnidadeBase` só
 * sabia converter por `contentSize`, que significa "1 pote = 500 g" — embalagem,
 * não escala métrica.
 *
 * O caso de referência destes cenários é o real, com os números reais:
 *   farinha a R$ 5,00/kg, 60 g na receita, rendimento 1 un  →  R$ 0,30
 */

const MIGRATIONS = [
  "20260826210000_semear_unidades_base",
  "20260827000000_semear_conversoes_de_unidade",
];

let storeId = "";
let farinhaId = "";
let boloId = "";
let receitaId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

/** Semeia pelos ARQUIVOS REAIS: os ids e os fatores têm que ser os de produção. */
async function semearPelasMigrations() {
  for (const nome of MIGRATIONS) {
    const sql = readFileSync(
      resolve(__dirname, `../../../../prisma/migrations/${nome}/migration.sql`),
      "utf8",
    )
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n")
      .trim();
    await prisma.$executeRawUnsafe(sql);
  }
}

beforeEach(async () => {
  await limparBanco();
  await semearPelasMigrations();

  storeId = (await prisma.store.create({
    data: { slug: `conv-${Date.now()}`, name: "Cozinha" },
  })).id;

  // Farinha: contada em kg, a R$ 5,00/kg. Os números do caso real.
  farinhaId = (await prisma.inventoryItem.create({
    data: {
      storeId, name: "Farinha de Trigo", itemType: "INGREDIENT",
      baseUnitId: "unit_kg", quantityOnHand: 10, cost: 5,
    },
  })).id;

  boloId = (await prisma.inventoryItem.create({
    data: {
      storeId, name: "Bolo", itemType: "PREPARED",
      baseUnitId: "unit_un", quantityOnHand: 0,
    },
  })).id;

  // 60 g de farinha rendem 1 bolo.
  const receita: any = await CompositionService.criarReceitaDePreparado(storeId, boloId, {
    items: [{ inventoryItemId: farinhaId, quantity: 60, unitId: "unit_g", sortOrder: 0 }],
    yieldQuantity: 1,
    yieldUnitId: "unit_un",
    isActive: true,
  });
  receitaId = receita.id;
});

afterAll(limparBanco);

describe("a função de conversão", () => {
  it("01 · 60 g de um item contado em kg viram 0,06 kg", async () => {
    const conversoes = montarMapaDeConversoes(
      await prisma.inventoryUnitConversion.findMany(),
    );

    const r = converterParaUnidadeBase(
      60,
      "unit_g",
      { baseUnitId: "unit_kg", contentSize: null },
      conversoes,
    );

    /*
     * A asserção que reprovava antes: sem conversão cadastrada, esta chamada
     * LANÇAVA, e a receita inteira ficava impossível de usar.
     */
    expect(r).toBeCloseTo(0.06, 6);
  });

  it("02 · mesma unidade não converte nada", async () => {
    const conversoes = montarMapaDeConversoes(
      await prisma.inventoryUnitConversion.findMany(),
    );
    expect(
      converterParaUnidadeBase(5.2, "unit_kg", { baseUnitId: "unit_kg", contentSize: null }, conversoes),
    ).toBe(5.2);
  });

  it("03 · peso não vira volume — sem densidade, não há conversão", async () => {
    const conversoes = montarMapaDeConversoes(
      await prisma.inventoryUnitConversion.findMany(),
    );

    /*
     * 1 kg de farinha e 1 L de leite não se convertem sem densidade, que o
     * sistema não guarda. O par ausente é recusado de propósito — devolver a
     * quantidade crua seria inventar um número.
     */
    expect(() =>
      converterParaUnidadeBase(1, "unit_l", { baseUnitId: "unit_kg", contentSize: null }, conversoes),
    ).toThrow(/não há conversão cadastrada|contentSize/i);
  });

  it("04 · a conversão cadastrada vem ANTES do contentSize", async () => {
    const conversoes = montarMapaDeConversoes(
      await prisma.inventoryUnitConversion.findMany(),
    );

    /*
     * Um item pode ter os dois — farinha contada em kg, comprada em saco de
     * 5 kg. Nesse caso "60 g" quer dizer sessenta gramas, não sessenta sacos:
     * a escala métrica é a leitura literal do que foi escrito na receita.
     */
    const r = converterParaUnidadeBase(
      60,
      "unit_g",
      { baseUnitId: "unit_kg", contentSize: 5 },
      conversoes,
    );
    expect(r).toBeCloseTo(0.06, 6);
    expect(r).not.toBeCloseTo(12, 6); // 60 ÷ 5, se o contentSize vencesse
  });

  it("05 · sem conversão e sem contentSize, recusa em vez de inventar", () => {
    expect(() =>
      converterParaUnidadeBase(60, "unit_g", { baseUnitId: "unit_kg", contentSize: null }, new Map()),
    ).toThrow();
  });
});

describe("o caso real: R$ 5,00/kg + 60 g + rendimento 1 un", () => {
  it("06 · o custo da ficha é R$ 0,30 — e não R$ 300,00", async () => {
    const { total, linhas } = await CustoDoPreparado.custoDaFicha(storeId, receitaId);

    /*
     * 60 g = 0,06 kg; 0,06 × R$ 5,00 = R$ 0,30.
     *
     * Sem conversão, a tela mostrava R$ 300,00 — mil vezes mais — porque
     * multiplicava 60 por 5 direto. E o servidor nem chegava a esse número:
     * lançava antes.
     */
    expect(Number(total)).toBeCloseTo(0.3, 4);
    expect(Number(total)).not.toBeCloseTo(300, 2);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].quantidadeNaBase).toBeCloseTo(0.06, 6);
    expect(Number(linhas[0].custoUnitario)).toBe(5);
  });

  it("07 · o custo é somado em Decimal, não em number", async () => {
    const { total } = await CustoDoPreparado.custoDaFicha(storeId, receitaId);
    expect(typeof (total as any).add, "dinheiro tem que sair como Decimal").toBe("function");
    expect(typeof (total as any).toNumber).toBe("function");
  });

  it("08 · a receita PRODUZ, e baixa 0,06 kg de farinha", async () => {
    const corrida = await ProducaoService.produzir(storeId, {
      compositionId: receitaId,
      plannedQuantity: 1,
      producedQuantity: 1,
      runToken: `t-${Date.now()}`,
    });

    expect(corrida.status).toBe("COMPLETED");
    expect(Number(corrida.totalInputCost)).toBeCloseTo(0.3, 4);
    expect(Number(corrida.unitCost)).toBeCloseTo(0.3, 4);

    const farinha = await prisma.inventoryItem.findUnique({ where: { id: farinhaId } });
    // 10 kg − 0,06 kg. Sem conversão isto teria tentado baixar 60 kg.
    expect(Number(farinha!.quantityOnHand)).toBeCloseTo(9.94, 4);

    const bolo = await prisma.inventoryItem.findUnique({ where: { id: boloId } });
    expect(Number(bolo!.quantityOnHand)).toBeCloseTo(1, 4);
    expect(Number(bolo!.cost)).toBeCloseTo(0.3, 4);
  });

  it("09 · produzir 10 bolos escala a conversão junto", async () => {
    const corrida = await ProducaoService.produzir(storeId, {
      compositionId: receitaId,
      plannedQuantity: 10,
      producedQuantity: 10,
      runToken: `t-${Date.now()}`,
    });

    // 600 g = 0,6 kg × R$ 5,00 = R$ 3,00; por bolo, R$ 0,30.
    expect(Number(corrida.totalInputCost)).toBeCloseTo(3, 4);
    expect(Number(corrida.unitCost)).toBeCloseTo(0.3, 4);

    const farinha = await prisma.inventoryItem.findUnique({ where: { id: farinhaId } });
    expect(Number(farinha!.quantityOnHand)).toBeCloseTo(9.4, 4);
  });

  it("10 · o pedido que consome o bolo também respeita a conversão", async () => {
    await ProducaoService.produzir(storeId, {
      compositionId: receitaId, plannedQuantity: 10, producedQuantity: 10,
      runToken: `t-${Date.now()}`,
    });
    const farinhaAntes = Number(
      (await prisma.inventoryItem.findUnique({ where: { id: farinhaId } }))!.quantityOnHand,
    );

    const categoria = await prisma.category.create({
      data: { storeId, name: "Doces", slug: `d-${Date.now()}`, kind: "SIMPLE" },
    });
    const produto = await prisma.product.create({
      data: {
        storeId, categoryId: categoria.id, name: "Fatia de bolo",
        slug: `f-${Date.now()}`, description: "", basePrice: 10,
      },
    });
    await prisma.productComposition.create({
      data: {
        storeId, productId: produto.id, version: 1,
        items: { create: [{ inventoryItemId: boloId, quantity: 1, unitId: "unit_un" }] },
      },
    });

    const pedido = await prisma.order.create({
      data: {
        storeId, number: 1, customerName: "C", customerPhone: "1",
        paymentMethod: "PIX", subtotal: 10, total: 10,
        items: { create: [{ productId: produto.id, productNameSnapshot: "Fatia", unitPrice: 10, quantity: 2 }] },
      },
    });

    const { OrderInventoryHandler } = await import("@/server/services/order-inventory-handler");
    await OrderInventoryHandler.onOrderReceived(pedido.id);
    await OrderInventoryHandler.onOrderPreparing(pedido.id);

    const bolo = await prisma.inventoryItem.findUnique({ where: { id: boloId } });
    expect(Number(bolo!.quantityOnHand)).toBeCloseTo(8, 4);

    // E a farinha não é tocada pelo pedido — ela saiu na produção.
    const farinha = await prisma.inventoryItem.findUnique({ where: { id: farinhaId } });
    expect(Number(farinha!.quantityOnHand)).toBeCloseTo(farinhaAntes, 4);
  });
});

describe("os fatores semeados", () => {
  it("11 · a migration cria os quatro pares, e só do mesmo sistema", async () => {
    const linhas = await prisma.inventoryUnitConversion.findMany({
      orderBy: { id: "asc" },
    });
    const pares = linhas.map((l) => `${l.fromUnitId}->${l.toUnitId}=${Number(l.conversionFactor)}`);

    expect(pares.sort()).toEqual(
      [
        "unit_g->unit_kg=0.001",
        "unit_kg->unit_g=1000",
        "unit_l->unit_ml=1000",
        "unit_ml->unit_l=0.001",
      ].sort(),
    );

    // Nenhum par atravessa sistema: peso não vira volume.
    for (const l of linhas) {
      const de = await prisma.inventoryUnit.findUnique({ where: { id: l.fromUnitId } });
      const para = await prisma.inventoryUnit.findUnique({ where: { id: l.toUnitId } });
      expect(de!.system).toBe(para!.system);
    }
  });

  it("12 · a migration é idempotente", async () => {
    const antes = await prisma.inventoryUnitConversion.count();
    await semearPelasMigrations();
    expect(await prisma.inventoryUnitConversion.count()).toBe(antes);
  });
});
