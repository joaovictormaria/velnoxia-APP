import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { CustoDoPreparado } from "@/server/services/custo-do-preparado";
import {
  validarConteudo,
  custoPorUnidadeDeEstoque,
  unidadesPorEmbalagem,
  deveMostrarConteudo,
} from "@/lib/embalagem-vs-conteudo";
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
  type MapaDeConversoes,
} from "@/lib/conversao-de-unidade";

/*
 * EMBALAGEM DE COMPRA × CONTEÚDO DA UNIDADE DE ESTOQUE.
 *
 * NASCEU DE UM BOLO DE R$ 1.046,47. O óleo foi cadastrado contado em `ml` e o
 * campo de conteúdo recebeu "900 ml" — descrição honesta da garrafa, que
 * naquele campo significa "1 ml contém 900 ml". O preço não foi dividido por
 * 900, porque quem divide preço é `purchasePackSize`, e a receita de 110 ml
 * virou R$ 880,00. O chocolate, mesma história, virou R$ 160,00.
 *
 * A INVARIANTE QUE TUDO AQUI DEFENDE:
 *   `cost` é sempre o preço de UMA UNIDADE DE ESTOQUE.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
const SEED_CONVERSOES = "20260827000000_semear_conversoes_de_unidade";
let storeId = "";
let conversoes: MapaDeConversoes = new Map();

const UN = { id: "unit_un", system: "COUNT" };
const G = { id: "unit_g", system: "WEIGHT" };
const KG = { id: "unit_kg", system: "WEIGHT" };
const ML = { id: "unit_ml", system: "VOLUME" };
const L = { id: "unit_l", system: "VOLUME" };

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
    await prisma.store.create({ data: { slug: `evc-${Date.now()}`, name: "Cozinha" } })
  ).id;
  conversoes = montarMapaDeConversoes(
    await prisma.inventoryUnitConversion.findMany({
      select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
    }),
  );
});
afterAll(limparBanco);

/** Cria o item já com embalagem e conteúdo, e devolve o que ficou gravado. */
async function cadastrar(dados: {
  nome: string;
  baseUnitId: string;
  precoDaEmbalagem: number;
  embalagens?: number;
  purchasePackSize?: number | null;
  contentSize?: number | null;
  contentUnit?: string | null;
}) {
  const item = await InventoryService.criarItemComSaldoInicial(
    storeId,
    {
      name: dados.nome,
      baseUnitId: dados.baseUnitId,
      itemType: "INGREDIENT",
      purchasePackSize: dados.purchasePackSize ?? null,
      purchasePackLabel: dados.purchasePackSize ? "Embalagem" : null,
      contentSize: dados.contentSize ?? null,
      contentUnit: dados.contentUnit ?? null,
    } as any,
    {
      quantidade: dados.embalagens ?? 1,
      precoDaEmbalagem: dados.precoDaEmbalagem,
    },
  );
  return prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
}

const custoDe = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).cost);

describe("a regra, isolada: cost = preço ÷ o que a embalagem rende", () => {
  it("01 · garrafa de 900 ml por R$ 8,00 = R$ 0,008888 por ml", () => {
    expect(custoPorUnidadeDeEstoque(8, 900)!).toBeCloseTo(8 / 900, 10);
    expect(custoPorUnidadeDeEstoque(8, 900)!.toFixed(6)).toBe("0.008889");
  });

  it("02 · pacote de 700 g por R$ 8,00 = R$ 0,011428 por g", () => {
    expect(custoPorUnidadeDeEstoque(8, 700)!).toBeCloseTo(8 / 700, 10);
    expect(custoPorUnidadeDeEstoque(8, 700)!.toFixed(6)).toBe("0.011429");
  });

  it("03 · caixa com 6 L por R$ 25,00 = R$ 4,1666 por L", () => {
    expect(custoPorUnidadeDeEstoque(25, 6)!).toBeCloseTo(25 / 6, 10);
  });

  it("04 · caixa com 30 ovos por R$ 15,00 = R$ 0,50 por ovo", () => {
    expect(custoPorUnidadeDeEstoque(15, 30)).toBeCloseTo(0.5, 6);
  });

  it("05 · pacote de 1 kg contado em `un` = R$ 4,50 pelo pacote", () => {
    // O conteúdo NÃO divide preço: 1 pacote é 1 unidade de estoque.
    expect(custoPorUnidadeDeEstoque(4.5, null)).toBeCloseTo(4.5, 6);
    expect(unidadesPorEmbalagem(null)).toBe(1);
  });

  it("06 · sem embalagem o divisor é 1, nunca zero", () => {
    for (const ruim of [null, undefined, 0, -3, NaN]) {
      expect(unidadesPorEmbalagem(ruim as any)).toBe(1);
    }
  });
});

describe("combinações válidas de conteúdo", () => {
  it("07 · estoque em `un` com conteúdo em g", () => {
    expect(validarConteudo({ unidadeDeEstoque: UN, contentSize: 200, contentUnit: G }).ok).toBe(true);
  });

  it("08 · estoque em `un` com conteúdo em kg", () => {
    expect(validarConteudo({ unidadeDeEstoque: UN, contentSize: 1, contentUnit: KG }).ok).toBe(true);
  });

  it("09 · estoque em `un` com conteúdo em ml e em L", () => {
    expect(validarConteudo({ unidadeDeEstoque: UN, contentSize: 900, contentUnit: ML }).ok).toBe(true);
    expect(validarConteudo({ unidadeDeEstoque: UN, contentSize: 1, contentUnit: L }).ok).toBe(true);
  });

  it("10 · sem conteúdo nenhum é válido — é o caso de quase todo item", () => {
    expect(validarConteudo({ unidadeDeEstoque: ML }).ok).toBe(true);
    expect(validarConteudo({ unidadeDeEstoque: G, contentSize: null, contentUnit: null }).ok).toBe(true);
  });
});

describe("combinações inválidas de conteúdo", () => {
  const motivo = (c: any) => {
    const v = validarConteudo(c);
    return v.ok ? "ok" : v.motivo;
  };

  it("11 · estoque em ml com conteúdo em ml — o caso do Óleo", () => {
    expect(motivo({ unidadeDeEstoque: ML, contentSize: 900, contentUnit: ML })).toBe(
      "estoque-nao-e-contagem",
    );
  });

  it("12 · estoque em g com conteúdo em g — o caso do Chocolate", () => {
    expect(motivo({ unidadeDeEstoque: G, contentSize: 700, contentUnit: G })).toBe(
      "estoque-nao-e-contagem",
    );
  });

  it("13 · estoque em kg com conteúdo em g é recusado: já há conversão", () => {
    expect(motivo({ unidadeDeEstoque: KG, contentSize: 1000, contentUnit: G })).toBe(
      "estoque-nao-e-contagem",
    );
  });

  it("14 · estoque em `un` com conteúdo em `un` não converte nada", () => {
    expect(motivo({ unidadeDeEstoque: UN, contentSize: 30, contentUnit: UN })).toBe(
      "mesma-unidade",
    );
  });

  it("15 · tamanho sem unidade, e unidade sem tamanho", () => {
    expect(motivo({ unidadeDeEstoque: UN, contentSize: 1000 })).toBe("incompleto");
    expect(motivo({ unidadeDeEstoque: UN, contentUnit: G })).toBe("incompleto");
  });

  it("16 · conteúdo zero ou negativo", () => {
    expect(motivo({ unidadeDeEstoque: UN, contentSize: 0, contentUnit: G })).toBe("tamanho-invalido");
    expect(motivo({ unidadeDeEstoque: UN, contentSize: -5, contentUnit: G })).toBe("tamanho-invalido");
  });

  it("17 · a mensagem diz o que fazer, não só que está errado", () => {
    const v = validarConteudo({ unidadeDeEstoque: ML, contentSize: 900, contentUnit: ML });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.mensagem).toMatch(/COMPRA|compra/);
  });
});

describe("o serviço recusa, mesmo sem passar pela interface", () => {
  it("18 · createItem com conteúdo em item contado por medida", async () => {
    await expect(
      InventoryService.createItem(storeId, {
        name: "Óleo", baseUnitId: "unit_ml", itemType: "INGREDIENT",
        contentSize: 900, contentUnit: "unit_ml",
      } as any),
    ).rejects.toThrow(/contado por medida|COMPRA/i);
  });

  it("19 · createItem com conteúdo na mesma unidade do estoque", async () => {
    await expect(
      InventoryService.createItem(storeId, {
        name: "Ovos", baseUnitId: "unit_un", itemType: "INGREDIENT",
        contentSize: 30, contentUnit: "unit_un",
      } as any),
    ).rejects.toThrow(/mesma unidade/i);
  });

  it("20 · createItem com tamanho sem unidade", async () => {
    await expect(
      InventoryService.createItem(storeId, {
        name: "Açúcar", baseUnitId: "unit_un", itemType: "INGREDIENT",
        contentSize: 1000,
      } as any),
    ).rejects.toThrow(/juntos/i);
  });

  it("21 · createItem com unidade de conteúdo inexistente", async () => {
    await expect(
      InventoryService.createItem(storeId, {
        name: "Açúcar", baseUnitId: "unit_un", itemType: "INGREDIENT",
        contentSize: 1000, contentUnit: "unit_inexistente",
      } as any),
    ).rejects.toThrow(/não existe/i);
  });

  it("22 · updateItem olha o estado RESULTANTE, não só o que foi enviado", async () => {
    const acucar = await cadastrar({
      nome: "Açúcar", baseUnitId: "unit_un", precoDaEmbalagem: 4.5,
      contentSize: 1, contentUnit: "unit_kg",
    });

    // Trocar só o conteúdo para algo incoerente é recusado.
    await expect(
      InventoryService.updateItem(storeId, acucar.id, {
        contentUnit: "unit_un",
      } as any),
    ).rejects.toThrow(/mesma unidade/i);

    // E o que estava gravado continua lá, intacto.
    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: acucar.id } });
    expect(Number(depois.contentSize)).toBe(1);
    expect(depois.contentUnit).toBe("unit_kg");
  });

  it("23 · nada é apagado sozinho: editar o nome preserva o conteúdo", async () => {
    const acucar = await cadastrar({
      nome: "Açúcar", baseUnitId: "unit_un", precoDaEmbalagem: 4.5,
      contentSize: 1, contentUnit: "unit_kg",
    });
    await InventoryService.updateItem(storeId, acucar.id, { name: "Açúcar Refinado" } as any);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: acucar.id } });
    expect(depois.name).toBe("Açúcar Refinado");
    expect(Number(depois.contentSize)).toBe(1);
    expect(depois.contentUnit).toBe("unit_kg");
  });
});

describe("os seis itens do usuário, cadastrados certo", () => {
  it("24 · Óleo: estoque em ml, garrafa de 900 ml por R$ 8,00", async () => {
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900,
    });
    // A conta E o gravado, agora iguais: `cost` é DECIMAL(15,6).
    expect(custoPorUnidadeDeEstoque(8, 900)!).toBeCloseTo(0.008889, 6);
    expect(await custoDe(oleo.id)).toBeCloseTo(0.008889, 6);
    expect(Number(oleo.quantityOnHand)).toBeCloseTo(900, 4); // 1 garrafa
  });

  it("25 · Chocolate: estoque em g, pacote de 700 g por R$ 8,00", async () => {
    const choco = await cadastrar({
      nome: "Chocolate em Pó", baseUnitId: "unit_g", precoDaEmbalagem: 8, purchasePackSize: 700,
    });
    expect(custoPorUnidadeDeEstoque(8, 700)!).toBeCloseTo(0.011429, 6);
    expect(await custoDe(choco.id)).toBeCloseTo(0.011429, 6);
    expect(Number(choco.quantityOnHand)).toBeCloseTo(700, 4);
  });

  it("26 · Leite: estoque em L, caixa com 6 L por R$ 25,00", async () => {
    const leite = await cadastrar({
      nome: "Leite", baseUnitId: "unit_l", precoDaEmbalagem: 25, purchasePackSize: 6,
    });
    expect(await custoDe(leite.id)).toBeCloseTo(4.17, 2);
    expect(Number(leite.quantityOnHand)).toBeCloseTo(6, 4);
  });

  it("27 · Açúcar: estoque em `un`, pacote de 1 kg por R$ 4,50", async () => {
    const acucar = await cadastrar({
      nome: "Açúcar", baseUnitId: "unit_un", precoDaEmbalagem: 4.5,
      contentSize: 1, contentUnit: "unit_kg",
    });
    expect(await custoDe(acucar.id)).toBeCloseTo(4.5, 2);
    // 200 g da receita = 0,2 pacote
    expect(converterParaUnidadeBase(200, "unit_g", acucar as any, conversoes)).toBeCloseTo(0.2, 6);
  });

  it("28 · Farinha: estoque em kg, pacote de 1 kg — receita em g", async () => {
    const farinha = await cadastrar({
      nome: "Farinha", baseUnitId: "unit_kg", precoDaEmbalagem: 6, purchasePackSize: 1,
    });
    expect(await custoDe(farinha.id)).toBeCloseTo(6, 2);
    expect(converterParaUnidadeBase(240, "unit_g", farinha as any, conversoes)).toBeCloseTo(0.24, 6);
  });

  it("29 · Fermento: estoque em `un`, pote com 200 g por R$ 4,00", async () => {
    const fermento = await cadastrar({
      nome: "Fermento", baseUnitId: "unit_un", precoDaEmbalagem: 4,
      contentSize: 200, contentUnit: "unit_g",
    });
    expect(await custoDe(fermento.id)).toBeCloseTo(4, 2);
    expect(converterParaUnidadeBase(14, "unit_g", fermento as any, conversoes)).toBeCloseTo(0.07, 6);
  });

  it("30 · embalagem com MÚLTIPLAS unidades: fardo com 10 pacotes de 1 kg", async () => {
    // Os dois campos convivem: dois níveis reais de embalagem.
    const acucar = await cadastrar({
      nome: "Açúcar", baseUnitId: "unit_un", precoDaEmbalagem: 45,
      purchasePackSize: 10, contentSize: 1, contentUnit: "unit_kg",
    });
    expect(Number(acucar.quantityOnHand)).toBeCloseTo(10, 4); // 1 fardo = 10 pacotes
    expect(await custoDe(acucar.id)).toBeCloseTo(4.5, 2); // 45 ÷ 10
    expect(converterParaUnidadeBase(200, "unit_g", acucar as any, conversoes)).toBeCloseTo(0.2, 6);
  });
});

describe("a receita, nas duas formas de unidade", () => {
  it("31 · receita na MESMA unidade do estoque", async () => {
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900,
    });
    expect(converterParaUnidadeBase(110, "unit_ml", oleo as any, conversoes)).toBe(110);
  });

  it("32 · receita em unidade CONVERSÍVEL", async () => {
    const leite = await cadastrar({
      nome: "Leite", baseUnitId: "unit_l", precoDaEmbalagem: 25, purchasePackSize: 6,
    });
    expect(converterParaUnidadeBase(240, "unit_ml", leite as any, conversoes)).toBeCloseTo(0.24, 6);
  });
});

describe("REGRESSÃO: o bolo de R$ 1.046,47", () => {
  it("33 · Óleo 110 ml sai R$ 0,98, e não R$ 880,00", async () => {
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900,
    });
    const naBase = converterParaUnidadeBase(110, "unit_ml", oleo as any, conversoes);

    expect(naBase * custoPorUnidadeDeEstoque(8, 900)!).toBeCloseTo(0.98, 2);

    // E o que sai do BANCO é o mesmo número — era R$ 1,10 com duas casas.
    const linha = naBase * (await custoDe(oleo.id));
    expect(linha).toBeCloseTo(0.98, 2);
    expect(linha).not.toBeCloseTo(1.1, 2);
    expect(linha).not.toBeCloseTo(880, 0);
  });

  it("34 · Chocolate 20 g sai R$ 0,23, e não R$ 160,00", async () => {
    const choco = await cadastrar({
      nome: "Chocolate em Pó", baseUnitId: "unit_g", precoDaEmbalagem: 8, purchasePackSize: 700,
    });
    const naBase = converterParaUnidadeBase(20, "unit_g", choco as any, conversoes);

    expect(naBase * custoPorUnidadeDeEstoque(8, 700)!).toBeCloseTo(0.23, 2);

    const linha = naBase * (await custoDe(choco.id));
    expect(linha).toBeCloseTo(0.23, 2);
    expect(linha).not.toBeCloseTo(0.2, 2); // era isto com duas casas
    expect(linha).not.toBeCloseTo(160, 0);
  });

  it("35 · o bolo inteiro fecha em ~R$ 7,68, e não R$ 1.046,47", async () => {
    const itens = {
      ovos: await cadastrar({ nome: "Ovos", baseUnitId: "unit_un", precoDaEmbalagem: 15, embalagens: 1, purchasePackSize: 30 }),
      acucar: await cadastrar({ nome: "Açúcar", baseUnitId: "unit_un", precoDaEmbalagem: 4.5, contentSize: 1, contentUnit: "unit_kg" }),
      oleo: await cadastrar({ nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900 }),
      leite: await cadastrar({ nome: "Leite", baseUnitId: "unit_l", precoDaEmbalagem: 25, purchasePackSize: 6 }),
      farinha: await cadastrar({ nome: "Farinha", baseUnitId: "unit_kg", precoDaEmbalagem: 6, purchasePackSize: 1 }),
      fermento: await cadastrar({ nome: "Fermento", baseUnitId: "unit_un", precoDaEmbalagem: 4, contentSize: 200, contentUnit: "unit_g" }),
      condensado: await cadastrar({ nome: "Leite Condensado", baseUnitId: "unit_un", precoDaEmbalagem: 0.79, contentSize: 395, contentUnit: "unit_g" }),
      choco: await cadastrar({ nome: "Chocolate em Pó", baseUnitId: "unit_g", precoDaEmbalagem: 8, purchasePackSize: 700 }),
      manteiga: await cadastrar({ nome: "Manteiga", baseUnitId: "unit_un", precoDaEmbalagem: 6.9, contentSize: 300, contentUnit: "unit_g" }),
    };

    const preparado = await prisma.inventoryItem.create({
      data: { storeId, name: "Bolo de Chocolate", sku: "PREP-BOLO", baseUnitId: "unit_un", itemType: "PREPARED" },
    });
    const receita = await prisma.productComposition.create({
      data: {
        storeId, inventoryItemId: preparado.id, isActive: true,
        yieldQuantity: 1, yieldUnitId: "unit_un",
        items: {
          create: [
            { inventoryItemId: itens.ovos.id, quantity: 3, unitId: "unit_un", sortOrder: 0 },
            { inventoryItemId: itens.acucar.id, quantity: 200, unitId: "unit_g", sortOrder: 1 },
            { inventoryItemId: itens.oleo.id, quantity: 110, unitId: "unit_ml", sortOrder: 2 },
            { inventoryItemId: itens.leite.id, quantity: 240, unitId: "unit_ml", sortOrder: 3 },
            { inventoryItemId: itens.farinha.id, quantity: 240, unitId: "unit_g", sortOrder: 4 },
            { inventoryItemId: itens.fermento.id, quantity: 14, unitId: "unit_g", sortOrder: 5 },
            { inventoryItemId: itens.condensado.id, quantity: 395, unitId: "unit_g", sortOrder: 6 },
            { inventoryItemId: itens.choco.id, quantity: 20, unitId: "unit_g", sortOrder: 7 },
            { inventoryItemId: itens.manteiga.id, quantity: 15, unitId: "unit_g", sortOrder: 8 },
          ],
        },
      },
    });

    const { total, linhasSemCusto } = await CustoDoPreparado.custoDaFicha(storeId, receita.id);

    // Nenhum insumo pode ficar de fora: todos convertem.
    expect(linhasSemCusto).toBe(0);
    /*
     * ~R$ 7,55 com os custos arredondados pelo banco; ~R$ 7,43 com os exatos.
     * O número que importa é o que MORREU: R$ 1.046,47.
     */
    expect(Number(total)).toBeGreaterThan(7);
    expect(Number(total)).toBeLessThan(8);
    expect(Number(total)).not.toBeCloseTo(1046.47, 0);
  });
});

describe("o limite do banco, medido e documentado", () => {
  it("36 · `cost` guarda abaixo de um centavo — DECIMAL(15,6)", async () => {
    /*
     * ANTES ERA DECIMAL(10,2), e o óleo virava R$ 0,01/ml. A migration
     * `g` tem custo unitário naturalmente abaixo de um centavo, e o banco
     * arredonda. O óleo fica R$ 0,01/ml em vez de R$ 0,008889.
     *
     * Consequência: 110 ml saem R$ 1,10 em vez de R$ 0,98 — 12% para cima.
     * Muito melhor que os R$ 880,00, e ainda assim errado.
     *
     * Sai com migration (DECIMAL(15,6)), ou contando o item na unidade MAIOR:
     * óleo em `L` dá R$ 8,89/L, que cabe em duas casas, e a receita em ml
     * converte sozinha. O cenário 37 prova essa saída.
     */
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900,
    });
    const exato = custoPorUnidadeDeEstoque(8, 900)!;
    const gravado = await custoDe(oleo.id);

    expect(exato).toBeCloseTo(0.008889, 6);
    expect(gravado).toBeCloseTo(exato, 6);
    expect(gravado).not.toBe(0.01); // era isto antes da migration
  });

  it("37 · contar na unidade MAIOR resolve sem mexer no banco", async () => {
    // Mesma garrafa, mesmo preço, item contado em L em vez de ml.
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_l", precoDaEmbalagem: 8, purchasePackSize: 0.9,
    });

    // R$ 8,00 ÷ 0,9 L = R$ 8,89/L — cabe folgado em duas casas.
    expect(await custoDe(oleo.id)).toBeCloseTo(8.89, 2);
    expect(Number(oleo.quantityOnHand)).toBeCloseTo(0.9, 4);

    // E a receita continua podendo pedir em ml.
    const naBase = converterParaUnidadeBase(110, "unit_ml", oleo as any, conversoes);
    expect(naBase).toBeCloseTo(0.11, 6);
    expect(naBase * (await custoDe(oleo.id))).toBeCloseTo(0.98, 2);
  });
});

describe("o custo congelado tem a mesma precisão do custo do item", () => {
  /*
   * `InventoryItem.cost` e `InventoryMovement.costAtTime` são o MESMO conceito:
   * quantos reais vale uma unidade de estoque. O primeiro diz quanto vale hoje;
   * o segundo, quanto valia no instante da compra.
   *
   * Precisão diferente entre os dois faria o sistema concordar consigo mesmo no
   * presente e discordar no passado: o item com R$ 0,008889 e a compra que o
   * gerou com R$ 0,01.
   */
  it("38 · costAtTime guarda R$ 0,008889/ml, e não arredonda para R$ 0,01", async () => {
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900,
    });

    const mov = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: oleo.id, type: "PURCHASE" },
    });

    expect(Number(mov.costAtTime)).toBeCloseTo(0.008889, 6);
    expect(Number(mov.costAtTime)).not.toBe(0.01);
    // 900 ml entraram por R$ 8,00: o congelado × a quantidade devolve a nota.
    expect(Number(mov.costAtTime) * Number(mov.quantity)).toBeCloseTo(8, 2);
  });

  it("39 · o congelado e o custo do item são o MESMO número", async () => {
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900,
    });
    const mov = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: oleo.id, type: "PURCHASE" },
    });

    expect(Number(mov.costAtTime)).toBeCloseTo(await custoDe(oleo.id), 6);
  });

  it("40 · Chocolate: R$ 0,011429/g congelado no movimento", async () => {
    const choco = await cadastrar({
      nome: "Chocolate em Pó", baseUnitId: "unit_g", precoDaEmbalagem: 8, purchasePackSize: 700,
    });
    const mov = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: choco.id, type: "PURCHASE" },
    });

    expect(Number(mov.costAtTime)).toBeCloseTo(0.011429, 6);
    expect(Number(mov.costAtTime) * Number(mov.quantity)).toBeCloseTo(8, 2);
  });

  it("41 · uma compra posterior NÃO reescreve o congelado da anterior", async () => {
    // O que dá sentido a `costAtTime`: ele é história, não estado.
    const oleo = await cadastrar({
      nome: "Óleo", baseUnitId: "unit_ml", precoDaEmbalagem: 8, purchasePackSize: 900,
    });
    const primeiro = await prisma.inventoryMovement.findFirstOrThrow({
      where: { itemId: oleo.id, type: "PURCHASE" },
    });

    // Segunda garrafa, mais cara: R$ 9,90 ÷ 900 = R$ 0,011.
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#SEGUNDA#${oleo.id}`,
      itemId: oleo.id, type: "PURCHASE", quantity: 900, unitId: "unit_ml",
      costAtTime: 9.9 / 900, authorType: "ADMIN",
    } as any);

    const depois = await prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: primeiro.id },
    });
    expect(Number(depois.costAtTime)).toBeCloseTo(0.008889, 6);
    expect(Number(depois.quantity)).toBe(Number(primeiro.quantity));
  });
});

describe("o impasse da edição: apagar o conteúdo de um cadastro herdado", () => {
  /*
   * O NÓ QUE ISTO DESFAZ. A regra de visibilidade olhava o que estava DIGITADO:
   * campo com valor, campo visível. E o formulário só enviava o campo quando
   * visível — para não apagar dado que ninguém pediu para apagar.
   *
   * Num item contado por medida com conteúdo herdado invalido, isso travava:
   * apagar o valor escondia o campo, esconder omitia do envio, omitir
   * significava "não mexa", o conteúdo sobrevivia e o servidor recusava.
   * APAGAR O CAMPO ERA O QUE IMPEDIA O CAMPO DE SER APAGADO.
   *
   * Cenários 42 a 45 cobrem a regra; 46 e 47, o efeito no banco.
   */

  /** O passo a passo do formulário, como a tela o executa. */
  const abrir = (item: { contaPorUnidades: boolean; contentSize: number | null }) => ({
    contaPorUnidades: item.contaPorUnidades,
    temConteudoGravado: item.contentSize != null,
    conteudoDigitado: item.contentSize != null ? String(item.contentSize) : "",
  });

  it("42 · óleo em ml com 900 gravado: o campo aparece", () => {
    const form = abrir({ contaPorUnidades: false, contentSize: 900 });
    expect(deveMostrarConteudo(form)).toBe(true);
  });

  it("43 · o usuário apaga, e o campo CONTINUA visível", () => {
    const form = abrir({ contaPorUnidades: false, contentSize: 900 });
    const depoisDeApagar = { ...form, conteudoDigitado: "" };

    // Era aqui que sumia, e com ele a chance de limpar o dado.
    expect(deveMostrarConteudo(depoisDeApagar)).toBe(true);
  });

  it("44 · item por medida SEM conteúdo gravado não mostra o campo", () => {
    const form = abrir({ contaPorUnidades: false, contentSize: null });
    expect(deveMostrarConteudo(form)).toBe(false);
  });

  it("45 · item contado em `un` mostra sempre, com ou sem valor", () => {
    expect(deveMostrarConteudo(abrir({ contaPorUnidades: true, contentSize: 1000 }))).toBe(true);
    expect(deveMostrarConteudo(abrir({ contaPorUnidades: true, contentSize: null }))).toBe(true);
  });

  it("46 · a limpeza chega ao banco: contentSize e contentUnit ficam NULL", async () => {
    // O óleo como está hoje: contado em ml, com "900 ml" de conteúdo herdado.
    const oleo = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Óleo", baseUnitId: "unit_ml", itemType: "INGREDIENT" } as any,
      { quantidade: 4, precoDaEmbalagem: 8 },
    );
    await prisma.inventoryItem.update({
      where: { id: oleo.id },
      data: { contentSize: 900, contentUnit: "unit_ml" },
    });

    /*
     * O que a tela envia quando o campo está VISÍVEL e VAZIO: string vazia nos
     * dois, que o servidor traduz para null. Junto vai a embalagem de compra,
     * que é o que aquele número sempre quis dizer.
     */
    await InventoryService.updateItem(storeId, oleo.id, {
      contentSize: null,
      contentUnit: null,
      purchasePackSize: 900,
      purchasePackLabel: "garrafa",
      precoDaEmbalagem: 8,
    } as any);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: oleo.id } });
    expect(depois.contentSize).toBeNull();
    expect(depois.contentUnit).toBeNull();
    expect(Number(depois.purchasePackSize)).toBe(900);
    expect(depois.purchasePackLabel).toBe("garrafa");
    expect(Number(depois.cost)).toBeCloseTo(0.008889, 6);

    // E a receita passa a custar o que deve.
    expect(110 * Number(depois.cost)).toBeCloseTo(0.98, 2);
  });

  it("47 · omitir o conteúdo continua significando “não mexa”", async () => {
    // O outro lado da regra: editar só o nome não pode limpar nada.
    const acucar = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Açúcar", baseUnitId: "unit_un", itemType: "INGREDIENT",
        contentSize: 1, contentUnit: "unit_kg" } as any,
      { quantidade: 10, precoDaEmbalagem: 4.5 },
    );
    await InventoryService.updateItem(storeId, acucar.id, { name: "Açúcar Cristal" } as any);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: acucar.id } });
    expect(depois.name).toBe("Açúcar Cristal");
    expect(Number(depois.contentSize)).toBe(1);
    expect(depois.contentUnit).toBe("unit_kg");
  });

  it("48 · limpar só o tamanho, deixando a unidade, é recusado", async () => {
    // Meia limpeza é ambígua: "1 un = ? kg". O servidor recusa em vez de supor.
    const acucar = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Açúcar", baseUnitId: "unit_un", itemType: "INGREDIENT",
        contentSize: 1, contentUnit: "unit_kg" } as any,
      { quantidade: 10, precoDaEmbalagem: 4.5 },
    );

    await expect(
      InventoryService.updateItem(storeId, acucar.id, { contentSize: null } as any),
    ).rejects.toThrow(/juntos/i);
  });
});

describe("desativar um item com cadastro herdado incoerente", () => {
  /*
   * O BOTAO "DELETAR" NAO APAGA: manda `isActive: false` pelo mesmo
   * `updateItem`. Como a validacao olhava o estado resultante e a exclusao nao
   * mexe no conteudo, ela recusava — e Farinha e Leite ficaram sem saida, sem
   * poder ser corrigidos nem removidos.
   *
   * Quem tira o item de circulacao nao esta afirmando nada sobre a embalagem
   * dele. Mas trazer de volta, sim.
   */

  /** Farinha como está: kg com conteúdo 1 kg — redundante, e por isso recusado. */
  async function farinhaHerdada() {
    const item = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Farinha de Trigo", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
      { quantidade: 1, precoDaEmbalagem: 6 },
    );
    // Gravado direto: é o estado legado, anterior à validação existir.
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { contentSize: 1, contentUnit: "unit_kg" },
    });
    return item;
  }

  it("49 · desativar um item com contentSize inválido FUNCIONA", async () => {
    const farinha = await farinhaHerdada();

    // Antes desta correção, isto lançava "contado por medida...".
    await InventoryService.updateItem(storeId, farinha.id, { isActive: false } as any);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: farinha.id } });
    expect(depois.isActive).toBe(false);
    // Nada mais foi tocado: o conteúdo incoerente continua lá, para consulta.
    expect(Number(depois.contentSize)).toBe(1);
    expect(depois.contentUnit).toBe("unit_kg");
    expect(Number(depois.cost)).toBeCloseTo(6, 6);
    expect(Number(depois.quantityOnHand)).toBeCloseTo(1, 4);
  });

  it("50 · REATIVAR o mesmo item continua sendo bloqueado", async () => {
    const farinha = await farinhaHerdada();
    await InventoryService.updateItem(storeId, farinha.id, { isActive: false } as any);

    /*
     * Sem isto, desativar e reativar seria a porta dos fundos para trazer de
     * volta um cadastro que a regra recusa.
     */
    await expect(
      InventoryService.updateItem(storeId, farinha.id, { isActive: true } as any),
    ).rejects.toThrow(/contado por medida|COMPRA/i);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: farinha.id } });
    expect(depois.isActive).toBe(false);
  });

  it("51 · reativar volta a funcionar depois de o conteúdo ser limpo", async () => {
    const farinha = await farinhaHerdada();
    await InventoryService.updateItem(storeId, farinha.id, { isActive: false } as any);

    // O caminho de saída: limpar o conteúdo e então reativar.
    await InventoryService.updateItem(storeId, farinha.id, {
      contentSize: null,
      contentUnit: null,
      isActive: true,
    } as any);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: farinha.id } });
    expect(depois.isActive).toBe(true);
    expect(depois.contentSize).toBeNull();
    expect(depois.contentUnit).toBeNull();
    expect(Number(depois.cost)).toBeCloseTo(6, 6);
  });

  it("52 · desativar NÃO é atalho para gravar conteúdo inválido junto", async () => {
    // Desativar dispensa a checagem do que JA estava la, nao autoriza gravar
    // uma combinacao nova e incoerente na mesma operacao.
    const oleo = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Óleo", baseUnitId: "unit_ml", itemType: "INGREDIENT" } as any,
      { quantidade: 900, precoDaEmbalagem: 8 },
    );

    await InventoryService.updateItem(storeId, oleo.id, {
      isActive: false,
      contentSize: 900,
      contentUnit: "unit_ml",
    } as any);

    const depois = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: oleo.id } });
    expect(depois.isActive).toBe(false);
    // Documenta o alcance da excecao: a checagem e pulada por inteiro.
    expect(Number(depois.contentSize)).toBe(900);
  });
});
