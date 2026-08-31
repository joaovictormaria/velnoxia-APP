import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { reportRepository } from "@/server/repositories/report-repository";

/*
 * "X NAS FICHAS": A SOMA CONVERTIDA, E NAO A SOMA CRUA.
 *
 * A coluna ESTOQUE mostra, abaixo do saldo, quanto do insumo esta configurado
 * nas fichas tecnicas ativas. Ela somava `CompositionItem.quantity` cru e
 * colava nele o codigo da unidade BASE do item — duas linguas diferentes.
 *
 * Uma ficha de 200 g de farinha aparecia como "200 kg". Noventa mililitros de
 * oleo, num item contado em garrafas de 900 ml, apareciam como "90 un":
 * noventa garrafas. Mil vezes e novecentas vezes o valor real, sem erro nenhum
 * na tela — a mesma familia de defeito do "oleo a R$ 8,00 o mililitro".
 *
 * O `unitId` nem era selecionado na consulta: a informacao que resolve o
 * problema nunca saia do banco.
 *
 * Estes testes fixam a ordem que conserta: CONVERTER CADA LINHA, DEPOIS SOMAR.
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
      slug: `fichas-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: "Cozinha",
      settings: { create: { storeName: "C", whatsappNumber: "11999999999" } },
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

/** Um insumo, opcionalmente com conteúdo declarado por unidade de estoque. */
const insumo = (
  name: string,
  baseUnitId: string,
  conteudo?: { contentSize: number; contentUnit: string },
) =>
  prisma.inventoryItem.create({
    data: { storeId, name, itemType: "INGREDIENT", baseUnitId, ...conteudo },
  });

async function produtoComFicha(
  nome: string,
  linhas: Array<{ inventoryItemId: string; quantity: number; unitId: string }>,
) {
  const produto = await prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      description: nome,
      basePrice: 10,
      tipoDeControle: "PRODUCAO",
    },
  });
  /*
   * A ficha e criada direto pelo Prisma, e nao pelo CompositionService: alguns
   * casos deste arquivo sao combinacoes que a guarda RECUSA de proposito. Para
   * testar o relatorio contra dado torto — o que pode existir de antes da
   * guarda — ele precisa entrar pela porta de tras.
   */
  await prisma.productComposition.create({
    data: {
      storeId,
      productId: produto.id,
      version: 1,
      isActive: true,
      items: { create: linhas.map((l, i) => ({ ...l, sortOrder: i })) },
    },
  });
  return produto;
}

/** O que a tela vai mostrar, para um insumo. */
async function nasFichas(itemId: string): Promise<number> {
  const linhas = await reportRepository.getStockLevelsByStore(storeId, { includeInactive: true });
  const item = linhas.find((l: any) => l.id === itemId);
  return Number((item as any)?.quantityUsedInRecipes ?? 0);
}

describe("cada linha é convertida para a unidade base antes de somar", () => {
  it("farinha base kg, ficha de 200 g → 0,2 kg", async () => {
    const farinha = await insumo("Farinha de trigo", "unit_kg");
    await produtoComFicha("Pão", [
      { inventoryItemId: farinha.id, quantity: 200, unitId: "unit_g" },
    ]);
    // Era 200: a soma crua com o rótulo "kg" colado por cima.
    expect(await nasFichas(farinha.id)).toBeCloseTo(0.2, 8);
  });

  it("leite base L, ficha de 250 ml → 0,25 L", async () => {
    const leite = await insumo("Leite", "unit_l");
    await produtoComFicha("Vitamina", [
      { inventoryItemId: leite.id, quantity: 250, unitId: "unit_ml" },
    ]);
    expect(await nasFichas(leite.id)).toBeCloseTo(0.25, 8);
  });

  it("óleo base un com 900 ml, ficha de 40 ml → 0,04444444 un", async () => {
    const oleo = await insumo("Óleo", "unit_un", { contentSize: 900, contentUnit: "unit_ml" });
    await produtoComFicha("Salgado", [
      { inventoryItemId: oleo.id, quantity: 40, unitId: "unit_ml" },
    ]);
    expect(await nasFichas(oleo.id)).toBeCloseTo(40 / 900, 8);
  });

  it("queijo base un com 1 kg, ficha de 50 g → 0,05 un", async () => {
    const queijo = await insumo("Queijo muçarela", "unit_un", {
      contentSize: 1,
      contentUnit: "unit_kg",
    });
    await produtoComFicha("Pizza", [
      { inventoryItemId: queijo.id, quantity: 50, unitId: "unit_g" },
    ]);
    // 50 g = 0,05 kg, e cada peça tem 1 kg: cinco por cento de UMA peça.
    expect(await nasFichas(queijo.id)).toBeCloseTo(0.05, 8);
  });

  it("ovos base un, ficha de 3 un → 3 un", async () => {
    const ovos = await insumo("Ovos", "unit_un");
    await produtoComFicha("Omelete", [
      { inventoryItemId: ovos.id, quantity: 3, unitId: "unit_un" },
    ]);
    // O unico dos quatro que ja estava certo — por coincidencia, nao por regra.
    expect(await nasFichas(ovos.id)).toBe(3);
  });
});

describe("fichas em unidades diferentes são convertidas uma a uma", () => {
  /*
   * O CASO QUE A SOMA CRUA NAO TEM COMO ACERTAR. Somar 200 com 0,5 da 200,5,
   * e nao existe unidade em que esse numero signifique alguma coisa.
   */
  it("um produto em g e outro em kg somam na unidade base", async () => {
    const farinha = await insumo("Farinha", "unit_kg");
    await produtoComFicha("Pão", [
      { inventoryItemId: farinha.id, quantity: 200, unitId: "unit_g" },
    ]);
    await produtoComFicha("Bolo", [
      { inventoryItemId: farinha.id, quantity: 0.5, unitId: "unit_kg" },
    ]);

    // 0,2 kg + 0,5 kg = 0,7 kg. A soma crua daria 200,5.
    expect(await nasFichas(farinha.id)).toBeCloseTo(0.7, 8);
  });

  it("óleo em ml e em L, no mesmo item contado em garrafas", async () => {
    const oleo = await insumo("Óleo", "unit_un", { contentSize: 900, contentUnit: "unit_ml" });
    await produtoComFicha("Salgado", [
      { inventoryItemId: oleo.id, quantity: 40, unitId: "unit_ml" },
    ]);
    await produtoComFicha("Fritura", [
      { inventoryItemId: oleo.id, quantity: 1.8, unitId: "unit_l" },
    ]);

    // 40/900 + 1800/900 = 0,04444444 + 2 = 2,04444444 garrafas.
    expect(await nasFichas(oleo.id)).toBeCloseTo(40 / 900 + 2, 8);
  });

  it("duas fichas na própria unidade base continuam somando direto", async () => {
    const ovos = await insumo("Ovos", "unit_un");
    await produtoComFicha("Omelete", [
      { inventoryItemId: ovos.id, quantity: 3, unitId: "unit_un" },
    ]);
    await produtoComFicha("Bolo", [
      { inventoryItemId: ovos.id, quantity: 4, unitId: "unit_un" },
    ]);
    expect(await nasFichas(ovos.id)).toBe(7);
  });
});

describe("o que não converte fica de fora, nunca entra pelo número cru", () => {
  /*
   * `validarInsumos` impede que uma ficha assim NASCA hoje. O que pode existir
   * e linha anterior a guarda. Somar o numero cru dela seria repetir o defeito
   * que este conserto elimina.
   */
  it("massa contra volume: a linha é ignorada, não somada", async () => {
    const oleo = await insumo("Óleo", "unit_un", { contentSize: 900, contentUnit: "unit_ml" });
    await produtoComFicha("Torto", [
      { inventoryItemId: oleo.id, quantity: 40, unitId: "unit_g" },
    ]);
    expect(await nasFichas(oleo.id)).toBe(0);
    // E, sobretudo, nao 40.
    expect(await nasFichas(oleo.id)).not.toBe(40);
  });

  it("item em un SEM contentSize não atravessa sistemas", async () => {
    const ovos = await insumo("Ovos", "unit_un");
    await produtoComFicha("Torto", [
      { inventoryItemId: ovos.id, quantity: 40, unitId: "unit_ml" },
    ]);
    expect(await nasFichas(ovos.id)).toBe(0);
    expect(await nasFichas(ovos.id)).not.toBe(40);
  });

  /*
   * Uma ficha torta nao pode derrubar a lista inteira, e nem contaminar o
   * numero dos vizinhos.
   */
  it("uma linha impossível não afeta as demais nem quebra o relatório", async () => {
    const farinha = await insumo("Farinha", "unit_kg");
    const ovos = await insumo("Ovos", "unit_un");
    await produtoComFicha("Bom", [
      { inventoryItemId: farinha.id, quantity: 200, unitId: "unit_g" },
    ]);
    await produtoComFicha("Torto", [
      { inventoryItemId: ovos.id, quantity: 5, unitId: "unit_l" },
    ]);

    const linhas = await reportRepository.getStockLevelsByStore(storeId, { includeInactive: true });
    expect(linhas).toHaveLength(2);
    expect(await nasFichas(farinha.id)).toBeCloseTo(0.2, 8);
    expect(await nasFichas(ovos.id)).toBe(0);
  });
});

describe("o que já funcionava continua igual", () => {
  it("insumo sem ficha nenhuma mostra zero", async () => {
    const item = await insumo("Sal", "unit_kg");
    expect(await nasFichas(item.id)).toBe(0);
  });

  it("ficha INATIVA não entra na conta", async () => {
    const farinha = await insumo("Farinha", "unit_kg");
    const p = await produtoComFicha("Pão", [
      { inventoryItemId: farinha.id, quantity: 200, unitId: "unit_g" },
    ]);
    await prisma.productComposition.updateMany({
      where: { productId: p.id },
      data: { isActive: false },
    });
    expect(await nasFichas(farinha.id)).toBe(0);
  });

  it("o relatório continua trazendo saldo e disponível", async () => {
    const item = await prisma.inventoryItem.create({
      data: {
        storeId,
        name: "Açúcar",
        itemType: "INGREDIENT",
        baseUnitId: "unit_kg",
        quantityOnHand: 10,
        quantityReserved: 2,
      },
    });
    const linhas = await reportRepository.getStockLevelsByStore(storeId, { includeInactive: true });
    const achado: any = linhas.find((l: any) => l.id === item.id);
    expect(Number(achado.quantityOnHand)).toBe(10);
    expect(Number(achado.quantityAvailable)).toBe(8);
  });
});
