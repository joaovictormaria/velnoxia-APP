import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { CustoDoPreparado } from "@/server/services/custo-do-preparado";
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
  type MapaDeConversoes,
} from "@/lib/conversao-de-unidade";

/*
 * O CONTEÚDO DA EMBALAGEM: 1 un = 1000 g.
 *
 * NASCEU DE UM CASO REAL. "Açúcar" é contado em `un` — pacotes, que é como se
 * compra e como se enxerga na prateleira — e a ficha do Bolo pede 300 g. Não
 * existe `un → g` universal: um pacote pode ter 1 kg ou 5 kg. O sistema recusava
 * e o açúcar ficava fora do custo, que aparecia menor do que é.
 *
 * `contentSize` + `contentUnit` são a resposta: o item diz o que cabe dentro de
 * uma unidade de estoque, e a receita passa a poder falar em gramas.
 *
 * E A CONVERSÃO É EM DUAS ETAPAS, não uma divisão. Antes se dividia direto pelo
 * número, ignorando `contentUnit`, então "600 g" e "600 kg" davam os mesmos 0,6
 * pacotes — mesmo número, significado errado, nenhum erro. Primeiro a
 * quantidade vem para a unidade do conteúdo, só então divide.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
const SEED_CONVERSOES = "20260827000000_semear_conversoes_de_unidade";
let storeId = "";
let conversoes: MapaDeConversoes = new Map();

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

async function rodarMigration(nome: string) {
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

beforeEach(async () => {
  await limparBanco();
  await rodarMigration(SEED_UNIDADES);
  await rodarMigration(SEED_CONVERSOES);
  storeId = (
    await prisma.store.create({
      data: { slug: `cont-${Date.now()}`, name: "Cozinha" },
    })
  ).id;
  conversoes = montarMapaDeConversoes(
    await prisma.inventoryUnitConversion.findMany({
      select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
    }),
  );
});
afterAll(limparBanco);

/** Açúcar como o João tem: contado em `un`, pacote de 1000 g. */
const acucar = { baseUnitId: "unit_un", contentSize: 1000, contentUnit: "unit_g" };

describe("a conversão pelo conteúdo, isolada", () => {
  it("01 · 600 g num pacote de 1000 g = 0,6 un", () => {
    expect(
      converterParaUnidadeBase(600, "unit_g", acucar, conversoes),
    ).toBeCloseTo(0.6, 6);
  });

  it("02 · 0,6 kg dá o MESMO resultado que 600 g", () => {
    const emGramas = converterParaUnidadeBase(600, "unit_g", acucar, conversoes);
    const emQuilos = converterParaUnidadeBase(0.6, "unit_kg", acucar, conversoes);
    expect(emQuilos).toBeCloseTo(0.6, 6);
    expect(emQuilos).toBeCloseTo(emGramas, 6);
    // O bug que isto fecha: dividir direto daria 0,6 / 1000 = 0,0006.
    expect(emQuilos).not.toBeCloseTo(0.0006, 6);
  });

  it("03 · 600 kg são 600.000 g = 600 pacotes, e não 0,6", () => {
    expect(
      converterParaUnidadeBase(600, "unit_kg", acucar, conversoes),
    ).toBeCloseTo(600, 6);
  });

  it("04 · 300 g — o caso da ficha do Bolo", () => {
    expect(
      converterParaUnidadeBase(300, "unit_g", acucar, conversoes),
    ).toBeCloseTo(0.3, 6);
  });

  it("05 · embalagens diferentes, cada uma com seu conteúdo", () => {
    const margarina = { baseUnitId: "unit_un", contentSize: 500, contentUnit: "unit_g" };
    const fermento = { baseUnitId: "unit_un", contentSize: 100, contentUnit: "unit_g" };

    expect(converterParaUnidadeBase(100, "unit_g", margarina, conversoes)).toBeCloseTo(0.2, 6);
    expect(converterParaUnidadeBase(15, "unit_g", fermento, conversoes)).toBeCloseTo(0.15, 6);
  });

  it("06 · volume: 250 ml numa caixa de 1 L", () => {
    const leite = { baseUnitId: "unit_un", contentSize: 1, contentUnit: "unit_l" };
    expect(converterParaUnidadeBase(250, "unit_ml", leite, conversoes)).toBeCloseTo(0.25, 6);
  });

  it("07 · a ficha na MESMA unidade do conteúdo não precisa de conversão", () => {
    const semMapa = converterParaUnidadeBase(600, "unit_g", acucar);
    expect(semMapa).toBeCloseTo(0.6, 6);
  });
});

describe("o que tem que ser recusado", () => {
  it("08 · massa contra volume é recusado, não chutado", () => {
    // Pacote em gramas, receita em mililitros: não há fator sem densidade.
    expect(() =>
      converterParaUnidadeBase(250, "unit_ml", acucar, conversoes),
    ).toThrow(/não é compatível com a unidade do conteúdo/i);
  });

  it("09 · contentSize SEM contentUnit é recusado", () => {
    /*
     * Adivinhar que o número está na unidade da ficha faria "1 un = 1000" valer
     * 1000 g numa receita em gramas e 1000 ml em outra, no mesmo item.
     */
    expect(() =>
      converterParaUnidadeBase(
        600,
        "unit_g",
        { baseUnitId: "unit_un", contentSize: 1000 },
        conversoes,
      ),
    ).toThrow(/contentUnit/i);
  });

  it("10 · sem contentSize e sem conversão continua recusando", () => {
    expect(() =>
      converterParaUnidadeBase(
        300,
        "unit_g",
        { baseUnitId: "unit_un", contentSize: null, contentUnit: null },
        conversoes,
      ),
    ).toThrow(/contentSize/i);
  });

  it("11 · contentSize zero ou negativo é recusado", () => {
    for (const ruim of [0, -5]) {
      expect(() =>
        converterParaUnidadeBase(
          600,
          "unit_g",
          { baseUnitId: "unit_un", contentSize: ruim, contentUnit: "unit_g" },
          conversoes,
        ),
      ).toThrow(/contentSize/i);
    }
  });
});

describe("os caminhos antigos não regridem", () => {
  it("12 · g ↔ kg: 500 g num item contado em kg = 0,5 kg", () => {
    const farinha = { baseUnitId: "unit_kg", contentSize: null, contentUnit: null };
    expect(converterParaUnidadeBase(500, "unit_g", farinha, conversoes)).toBeCloseTo(0.5, 6);
  });

  it("13 · ml ↔ L: 250 ml num item contado em L = 0,25 L", () => {
    const leite = { baseUnitId: "unit_l", contentSize: null, contentUnit: null };
    expect(converterParaUnidadeBase(250, "unit_ml", leite, conversoes)).toBeCloseTo(0.25, 6);
  });

  it("14 · mesma unidade continua passando reto", () => {
    const ovos = { baseUnitId: "unit_un", contentSize: null, contentUnit: null };
    expect(converterParaUnidadeBase(4, "unit_un", ovos, conversoes)).toBe(4);
  });

  it("15 · a conversão cadastrada TEM prioridade sobre o contentSize", () => {
    /*
     * Farinha contada em kg, comprada em saco de 5 kg. "60 g" quer dizer
     * sessenta gramas, não sessenta sacos: a escala métrica é a leitura literal
     * do que foi escrito na receita.
     */
    const farinha = { baseUnitId: "unit_kg", contentSize: 5, contentUnit: "unit_kg" };
    expect(converterParaUnidadeBase(60, "unit_g", farinha, conversoes)).toBeCloseTo(0.06, 6);
    expect(converterParaUnidadeBase(60, "unit_g", farinha, conversoes)).not.toBeCloseTo(12, 6);
  });
});

describe("custo e baixa de estoque usam a MESMA conta", () => {
  async function acucarNoBanco(saldoEmPacotes: number, precoDoPacote: number) {
    const item = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Açúcar", baseUnitId: "unit_un", itemType: "INGREDIENT" } as any,
      { quantidade: saldoEmPacotes, precoDaEmbalagem: precoDoPacote },
    );
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { contentSize: 1000, contentUnit: "unit_g" },
    });
    return item;
  }

  it("16 · o custo da ficha usa o conteúdo: 300 g de um pacote de R$ 4,00", async () => {
    const item = await acucarNoBanco(10, 4);
    const preparado = await prisma.inventoryItem.create({
      data: {
        storeId, name: "Bolo", sku: "PREP-1",
        baseUnitId: "unit_un", itemType: "PREPARED",
      },
    });
    const receita = await prisma.productComposition.create({
      data: {
        storeId, inventoryItemId: preparado.id, isActive: true,
        yieldQuantity: 1, yieldUnitId: "unit_un",
        items: {
          create: [{ inventoryItemId: item.id, quantity: 300, unitId: "unit_g", sortOrder: 0 }],
        },
      },
    });

    const { total, linhas } = await CustoDoPreparado.custoDaFicha(storeId, receita.id);

    // 300 g ÷ 1000 = 0,3 pacote × R$ 4,00 = R$ 1,20.
    expect(linhas[0].quantidadeNaBase).toBeCloseTo(0.3, 6);
    expect(Number(total)).toBeCloseTo(1.2, 4);
    // Sem o conteúdo isto lançava, e o açúcar ficava FORA da soma.
    expect(Number(total)).not.toBe(0);
  });

  it("17 · a BAIXA reduz 0,3 do pacote, e não 300", async () => {
    const item = await acucarNoBanco(10, 4);
    const antes = Number(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantityOnHand,
    );
    expect(antes).toBeCloseTo(10, 4);

    const gravado = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    const naBase = converterParaUnidadeBase(300, "unit_g", gravado as any, conversoes);

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#BAIXA#${item.id}`,
      itemId: item.id,
      type: "CONSUMPTION",
      quantity: -naBase,
      unitId: "unit_un",
      authorType: "SYSTEM",
    } as any);

    const depois = Number(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantityOnHand,
    );
    // 10 pacotes − 0,3 = 9,7. Nunca 10 − 300.
    expect(depois).toBeCloseTo(9.7, 4);
    expect(depois).toBeGreaterThan(0);
  });

  it("18 · custo e baixa chegam ao MESMO número", async () => {
    const item = await acucarNoBanco(10, 4);
    const gravado = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });

    // A mesma função serve as duas pontas: é isso que impede de divergirem.
    const paraOCusto = converterParaUnidadeBase(300, "unit_g", gravado as any, conversoes);
    const paraABaixa = converterParaUnidadeBase(300, "unit_g", gravado as any, conversoes);
    expect(paraOCusto).toBe(paraABaixa);
    expect(paraOCusto).toBeCloseTo(0.3, 6);
  });
});
