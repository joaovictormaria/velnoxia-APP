import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { insumosDoPedido } from "@/server/services/composicao-do-pedido";

/*
 * PRODUTO DE CARDÁPIO → ITEM DE ESTOQUE.
 *
 * A cadeia inteira tem quatro elos, e cada um faz uma coisa só:
 *
 *   Receita → Preparado → Item de estoque → Produto de cardápio
 *
 * A receita diz o que o bolo leva. A produção consome os ingredientes e cria o
 * bolo. O item de estoque guarda quantos bolos existem e quanto cada um custou.
 * O produto de cardápio só APONTA para esse item.
 *
 * O QUE ESTE ARQUIVO DEFENDE É O ÚLTIMO ELO SER DE UM NÍVEL SÓ. Vender um bolo
 * reserva UMA unidade do item Bolo e para ali — não desce nos ovos, na farinha,
 * no óleo. Esses já foram debitados na PRODUÇÃO. Descer de novo cobraria a
 * farinha duas vezes, e o estoque de ingrediente iria a zero sozinho.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function semearUnidades() {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${SEED_UNIDADES}/migration.sql`),
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
  await semearUnidades();
  storeId = (
    await prisma.store.create({ data: { slug: `vin-${Date.now()}`, name: "Cozinha" } })
  ).id;
});
afterAll(limparBanco);

/** O bolo pronto: item PREPARED com saldo, como sai de uma produção. */
async function boloEmEstoque(unidades = 3) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Bolo de Chocolate", baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    { quantidade: unidades, precoDaEmbalagem: 9.71 },
  );
}

async function farinhaEmEstoque() {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Farinha", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
    { quantidade: 10, precoDaEmbalagem: 6 },
  );
}

/** Um produto de cardápio mínimo, sem tocar em preço, tamanhos ou opções. */
async function produtoDeCardapio(nome = "Bolo de Chocolate") {
  const categoria = await prisma.category.create({
    data: { storeId, name: "Doces", slug: `doces-${Date.now()}`, icon: "🍰", kind: "SIMPLE" },
  });
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      description: nome,
      basePrice: 25,
    },
  });
}

const lerProduto = (id: string) =>
  prisma.product.findUniqueOrThrow({ where: { id } });
const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantityOnHand);

describe("o ciclo do vínculo", () => {
  it("01 · vincular grava a referência no produto", async () => {
    const bolo = await boloEmEstoque();
    const produto = await produtoDeCardapio();

    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: bolo.id },
    });

    expect((await lerProduto(produto.id)).inventoryItemId).toBe(bolo.id);
  });

  it("02 · editar o vínculo troca de item, sem tocar em mais nada", async () => {
    const bolo = await boloEmEstoque();
    const farinha = await farinhaEmEstoque();
    const produto = await produtoDeCardapio();

    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: bolo.id },
    });
    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: farinha.id },
    });

    const depois = await lerProduto(produto.id);
    expect(depois.inventoryItemId).toBe(farinha.id);
    // Preço, nome e categoria intactos.
    expect(Number(depois.basePrice)).toBe(25);
    expect(depois.name).toBe("Bolo de Chocolate");
    expect(depois.categoryId).toBe(produto.categoryId);
  });

  it("03 · desvincular deixa NULL e não mexe em estoque nem histórico", async () => {
    const bolo = await boloEmEstoque();
    const produto = await produtoDeCardapio();
    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: bolo.id },
    });

    const saldoAntes = await saldo(bolo.id);
    const movsAntes = await prisma.inventoryMovement.count({ where: { itemId: bolo.id } });

    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: null },
    });

    expect((await lerProduto(produto.id)).inventoryItemId).toBeNull();
    expect(await saldo(bolo.id)).toBe(saldoAntes);
    expect(await prisma.inventoryMovement.count({ where: { itemId: bolo.id } })).toBe(movsAntes);
    // O item de estoque continua existindo, inteiro.
    expect(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: bolo.id } })).isActive,
    ).toBe(true);
  });

  it("04 · vincular de novo depois de desvincular funciona", async () => {
    const bolo = await boloEmEstoque();
    const produto = await produtoDeCardapio();

    for (const valor of [bolo.id, null, bolo.id]) {
      await prisma.product.update({
        where: { id: produto.id },
        data: { inventoryItemId: valor },
      });
    }

    expect((await lerProduto(produto.id)).inventoryItemId).toBe(bolo.id);
  });

  it("05 · produto sem vínculo continua com NULL — é o caso normal", async () => {
    const produto = await produtoDeCardapio("Refrigerante");
    expect((await lerProduto(produto.id)).inventoryItemId).toBeNull();
  });
});

describe("a venda consome UM nível, e só", () => {
  it("06 · vender 1 bolo reserva 1 un do bolo, e NÃO baixa a farinha", async () => {
    const bolo = await boloEmEstoque(3);
    const farinha = await farinhaEmEstoque();
    const produto = await produtoDeCardapio();
    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: bolo.id },
    });

    /*
     * A receita do bolo EXISTE e leva farinha. É justamente por isso que o
     * cenário importa: se a venda descesse na receita, a farinha cairia — e ela
     * já caiu quando o bolo foi produzido.
     */
    await prisma.productComposition.create({
      data: {
        storeId,
        inventoryItemId: bolo.id,
        isActive: true,
        yieldQuantity: 1,
        yieldUnitId: "unit_un",
        items: {
          create: [
            { inventoryItemId: farinha.id, quantity: 240, unitId: "unit_g", sortOrder: 0 },
          ],
        },
      },
    });

    const farinhaAntes = await saldo(farinha.id);
    const { insumos } = await insumosDoPedido([
      { productId: produto.id, quantity: 1, compositionVersionId: null },
    ]);

    const doBolo = insumos.find((i: any) => i.inventoryItemId === bolo.id);
    const daFarinha = insumos.find((i: any) => i.inventoryItemId === farinha.id);

    expect(doBolo).toBeTruthy();
    expect(doBolo!.quantidade).toBe(1);
    // O que este arquivo inteiro existe para provar:
    expect(daFarinha).toBeUndefined();
    expect(await saldo(farinha.id)).toBe(farinhaAntes);
  });

  it("07 · vender 3 bolos reserva 3, na unidade do item", async () => {
    const bolo = await boloEmEstoque(5);
    const produto = await produtoDeCardapio();
    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: bolo.id },
    });

    const { insumos } = await insumosDoPedido([
      { productId: produto.id, quantity: 3, compositionVersionId: null },
    ]);
    const doBolo = insumos.find((i: any) => i.inventoryItemId === bolo.id);

    expect(doBolo!.quantidade).toBe(3);
    expect(doBolo!.unitId).toBe("unit_un");
  });

  it("08 · produto SEM vínculo não gera baixa nenhuma", async () => {
    const produto = await produtoDeCardapio("Refrigerante");
    const { insumos } = await insumosDoPedido([
      { productId: produto.id, quantity: 2, compositionVersionId: null },
    ]);
    expect(insumos).toHaveLength(0);
  });

  it("09 · desvincular para a baixa: a venda deixa de consumir", async () => {
    const bolo = await boloEmEstoque(3);
    const produto = await produtoDeCardapio();
    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: bolo.id },
    });

    expect(
      (await insumosDoPedido([
        { productId: produto.id, quantity: 1, compositionVersionId: null },
      ])).insumos,
    ).toHaveLength(1);

    await prisma.product.update({
      where: { id: produto.id },
      data: { inventoryItemId: null },
    });

    expect(
      (await insumosDoPedido([
        { productId: produto.id, quantity: 1, compositionVersionId: null },
      ])).insumos,
    ).toHaveLength(0);
  });
});
