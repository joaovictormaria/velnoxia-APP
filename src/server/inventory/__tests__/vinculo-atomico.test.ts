import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { createProduct, updateProduct } from "@/server/repositories/product-repository";
import {
  ErroDeVinculoDeEstoque,
  exigirVinculoDeEstoque,
} from "@/server/inventory/guarda-de-receita";

/*
 * O VÍNCULO E A ATIVAÇÃO SÃO UMA ESCRITA SÓ.
 *
 * Antes eram duas chamadas em sequência: `saveProductFn` gravava o produto e
 * `adminLinkProductToInventory` gravava o vínculo depois. Com o controle de
 * estoque ligado isso tornava impossível o gesto mais natural do cadastro —
 * escolher o item e marcar "Ativo" na mesma tela — porque a guarda rodava na
 * primeira chamada e lia um banco onde o vínculo ainda não existia. E, quando
 * a segunda falhava, sobrava produto salvo sem vínculo.
 *
 * Estes testes exercitam a MESMA sequência que `saveProductFn` executa —
 * conferir o item contra a loja, abrir a transação, guardar, gravar — porque
 * server function não roda em vitest (o `AsyncLocalStorage` não existe aqui).
 * O que eles provam é o comportamento da transação e da guarda sobre o estado
 * PROPOSTO, que é onde o defeito morava.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";

let lojaA = "";
let lojaB = "";
let categoriaA = "";
let categoriaB = "";

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

async function criarLoja(slug: string, estoqueAtivo: boolean) {
  const loja = await prisma.store.create({ data: { slug, name: slug } });
  await prisma.storeSettings.create({
    data: {
      storeId: loja.id,
      whatsappNumber: "11999999999",
      inventoryControlEnabled: estoqueAtivo,
    },
  });
  const categoria = await prisma.category.create({
    data: {
      storeId: loja.id,
      name: "Pratos",
      slug: `pratos-${slug}`,
      kind: "SIMPLE",
      isActive: true,
    },
  });
  return { storeId: loja.id, categoriaId: categoria.id };
}

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();
  const marca = Date.now();
  const a = await criarLoja(`atom-a-${marca}`, true);
  const b = await criarLoja(`atom-b-${marca}`, false);
  lojaA = a.storeId;
  categoriaA = a.categoriaId;
  lojaB = b.storeId;
  categoriaB = b.categoriaId;
});
afterAll(limparBanco);

function payload(nome: string, extras: Record<string, unknown> = {}) {
  return {
    name: nome,
    slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 8)}`,
    description: nome,
    basePrice: 10,
    isActive: true,
    controlaEstoque: true,
    allowHalfAndHalf: false,
    halfPizzaPricingRule: "HIGHEST_PRICE" as const,
    sortOrder: 0,
    sizes: [],
    optionGroups: [],
    ...extras,
  };
}

async function itemDeEstoque(storeId: string, nome: string) {
  return prisma.inventoryItem.create({
    data: { storeId, name: nome, baseUnitId: "unit_un", itemType: "RESALE" },
  });
}

/**
 * O caminho de EDIÇÃO de `saveProductFn`, replicado.
 *
 * Se esta função e o handler divergirem, o teste deixa de dizer o que promete
 * — por isso ela é curta e espelha os quatro passos de lá na mesma ordem.
 */
async function salvarEdicao(
  storeId: string,
  productId: string,
  dados: any,
  inventoryItemId: string | null | undefined,
) {
  if (inventoryItemId !== undefined && inventoryItemId !== null) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, storeId },
      select: { id: true },
    });
    if (!item) throw new Error("Item de estoque não encontrado.");
  }
  return prisma.$transaction(async (tx) => {
    await exigirVinculoDeEstoque(
      storeId,
      productId,
      {
        isActive: dados.isActive,
        controlaEstoque: dados.controlaEstoque,
        ...(inventoryItemId !== undefined ? { inventoryItemId } : {}),
      },
      tx,
    );
    return updateProduct(storeId, productId, { ...dados, inventoryItemId }, tx);
  });
}

describe("F-2: vincular e ativar na mesma gravação", () => {
  it("produto sem vínculo + item escolhido + Ativo → sucesso", async () => {
    // O gesto que era recusado, e a razão inteira desta correção.
    const p = await createProduct(
      lojaA,
      payload("Coca-Cola", { categoryId: categoriaA, isActive: false }) as any,
    );
    const item = await itemDeEstoque(lojaA, "Coca lata 350ml");

    const salvo = await salvarEdicao(
      lojaA,
      p.id,
      payload("Coca-Cola", { categoryId: categoriaA, slug: p.slug, isActive: true }),
      item.id,
    );

    expect(salvo.isActive).toBe(true);
    expect(salvo.inventoryItemId).toBe(item.id);
  });

  it("os dois campos entram na MESMA linha, numa escrita só", async () => {
    const p = await createProduct(
      lojaA,
      payload("Guaraná", { categoryId: categoriaA, isActive: false }) as any,
    );
    const item = await itemDeEstoque(lojaA, "Guaraná lata");

    await salvarEdicao(
      lojaA,
      p.id,
      payload("Guaraná", { categoryId: categoriaA, slug: p.slug, isActive: true }),
      item.id,
    );

    const noBanco = await prisma.product.findUnique({ where: { id: p.id } });
    expect(noBanco?.isActive).toBe(true);
    expect(noBanco?.inventoryItemId).toBe(item.id);
  });

  it("item de OUTRA loja é recusado, e nada é gravado", async () => {
    const p = await createProduct(
      lojaA,
      payload("Suco", { categoryId: categoriaA, isActive: false }) as any,
    );
    const itemDaB = await itemDeEstoque(lojaB, "Item da loja B");

    await expect(
      salvarEdicao(
        lojaA,
        p.id,
        payload("Suco", { categoryId: categoriaA, slug: p.slug, isActive: true }),
        itemDaB.id,
      ),
    ).rejects.toThrow("Item de estoque não encontrado.");

    // O produto continua exatamente como estava: sem vínculo e inativo.
    const noBanco = await prisma.product.findUnique({ where: { id: p.id } });
    expect(noBanco?.inventoryItemId).toBeNull();
    expect(noBanco?.isActive).toBe(false);
  });

  it("ativação recusada NÃO deixa o vínculo salvo pela metade", async () => {
    /*
     * A garantia que o desenho antigo não dava. Aqui o produto é isento na
     * origem, tenta ativar-se participando do estoque e sem item nenhum: a
     * guarda recusa DENTRO da transação, e o rollback leva tudo junto.
     */
    const p = await createProduct(
      lojaA,
      payload("Prato sem origem", {
        categoryId: categoriaA,
        isActive: false,
      }) as any,
    );

    await expect(
      salvarEdicao(
        lojaA,
        p.id,
        payload("Prato sem origem", {
          categoryId: categoriaA,
          slug: p.slug,
          isActive: true,
        }),
        null,
      ),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);

    const noBanco = await prisma.product.findUnique({ where: { id: p.id } });
    expect(noBanco?.isActive).toBe(false);
    expect(noBanco?.inventoryItemId).toBeNull();
  });

  it("falha DEPOIS da guarda desfaz a gravação inteira", async () => {
    /*
     * Prova o rollback de verdade: guarda passa, produto é gravado, e então a
     * transação morre. Se a escrita não estivesse na transação, o produto
     * ficaria ativo e vinculado com a operação tendo falhado.
     */
    const p = await createProduct(
      lojaA,
      payload("Prato de teste", { categoryId: categoriaA, isActive: false }) as any,
    );
    const item = await itemDeEstoque(lojaA, "Item bom");

    await expect(
      prisma.$transaction(async (tx) => {
        await exigirVinculoDeEstoque(
          lojaA,
          p.id,
          { isActive: true, controlaEstoque: true, inventoryItemId: item.id },
          tx,
        );
        await updateProduct(
          lojaA,
          p.id,
          {
            ...payload("Prato de teste", {
              categoryId: categoriaA,
              slug: p.slug,
              isActive: true,
            }),
            inventoryItemId: item.id,
          } as any,
          tx,
        );
        throw new Error("falha depois de gravar");
      }),
    ).rejects.toThrow("falha depois de gravar");

    const noBanco = await prisma.product.findUnique({ where: { id: p.id } });
    expect(noBanco?.isActive).toBe(false);
    expect(noBanco?.inventoryItemId).toBeNull();
  });

  it("desvincular e continuar ativo é recusado, sem gravar nada", async () => {
    const item = await itemDeEstoque(lojaA, "Item atual");
    const p = await createProduct(
      lojaA,
      payload("Refri ativo", {
        categoryId: categoriaA,
        isActive: true,
        inventoryItemId: item.id,
      }) as any,
    );

    await expect(
      salvarEdicao(
        lojaA,
        p.id,
        payload("Refri ativo", {
          categoryId: categoriaA,
          slug: p.slug,
          isActive: true,
        }),
        null,
      ),
    ).rejects.toBeInstanceOf(ErroDeVinculoDeEstoque);

    const noBanco = await prisma.product.findUnique({ where: { id: p.id } });
    expect(noBanco?.inventoryItemId).toBe(item.id);
  });

  it("com o controle DESLIGADO, desvincular e ficar ativo continua livre", async () => {
    // A garantia de que a loja que não usa estoque não sentiu nada disto.
    const item = await itemDeEstoque(lojaB, "Item da B");
    const p = await createProduct(
      lojaB,
      payload("Produto da B", {
        categoryId: categoriaB,
        isActive: true,
        inventoryItemId: item.id,
      }) as any,
    );

    const salvo = await salvarEdicao(
      lojaB,
      p.id,
      payload("Produto da B", {
        categoryId: categoriaB,
        slug: p.slug,
        isActive: true,
      }),
      null,
    );

    expect(salvo.isActive).toBe(true);
    expect(salvo.inventoryItemId).toBeNull();
  });

  it("produto isento pode ficar ativo sem vínculo, com o controle ligado", async () => {
    const p = await createProduct(
      lojaA,
      payload("Taxa de entrega", {
        categoryId: categoriaA,
        isActive: false,
        controlaEstoque: false,
      }) as any,
    );

    const salvo = await salvarEdicao(
      lojaA,
      p.id,
      payload("Taxa de entrega", {
        categoryId: categoriaA,
        slug: p.slug,
        isActive: true,
        controlaEstoque: false,
      }),
      null,
    );

    expect(salvo.isActive).toBe(true);
  });
});
