import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { CompositionService } from "@/server/services/composition-service";
import { createProduct } from "@/server/repositories/product-repository";
import { gerarSlugDeProduto, mensagemDeSlugDuplicado } from "@/lib/slug-de-produto";

/*
 * O PRODUTO FANTASMA, E O PRODUTO CRIADO DUAS VEZES.
 *
 * `adminCreateComposition` lia `data.productId` como se fosse NOME. O
 * CompositionBuilder sempre mandou o id de verdade, entao a busca por nome nao
 * achava nada e o endpoint criava um SEGUNDO produto — nome igual ao cuid,
 * preco zero — e prendia a receita nele. O produto real ficava sem receita.
 *
 * E o wizard lia `productId` da prop, que nunca muda: voltar da etapa da receita
 * e concluir de novo mandava um segundo CREATE com o mesmo slug, e o banco
 * respondia com P2002 cru na tela.
 *
 * Estes testes fixam as duas coisas do lado do servidor: a receita pertence ao
 * produto que existe, e o slug repetido sai como frase.
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
      slug: `fant-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      name: "Loja",
      settings: {
        create: { storeName: "Loja", whatsappNumber: "11999999999" },
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

const novoProduto = (nome: string, extra: Record<string, unknown> = {}) =>
  createProduct(storeId, {
    name: nome,
    slug: gerarSlugDeProduto(nome),
    description: nome,
    categoryId: categoriaId,
    basePrice: 10,
    imageUrl: null,
    tag: null,
    isActive: true,
    controlaEstoque: true,
    allowHalfAndHalf: false,
    halfPizzaPricingRule: "HIGHEST_PRICE",
    sortOrder: 0,
    sizes: [],
    optionGroups: [],
    ...extra,
  } as any);

describe("a receita pertence ao produto que existe", () => {
  it("a ficha fica no produto REAL, e nenhum outro produto nasce", async () => {
    const item = await prisma.inventoryItem.create({
      data: { storeId, name: "Açúcar", itemType: "INGREDIENT", baseUnitId: "unit_kg" },
    });
    const p: any = await novoProduto("Bolo de Cenoura", { tipoDeControle: "PRODUCAO" });

    const antes = await prisma.product.count({ where: { storeId } });

    const ficha: any = await CompositionService.createComposition(storeId, p.id, {
      productId: p.id,
      isActive: true,
      items: [{ inventoryItemId: item.id, quantity: 100, unitId: "unit_g", sortOrder: 0 }],
    } as any);

    expect(ficha.productId).toBe(p.id);
    // NENHUM produto novo: montar receita nao cadastra produto.
    expect(await prisma.product.count({ where: { storeId } })).toBe(antes);
    // E nada com nome de cuid.
    const fantasmas = await prisma.product.findMany({
      where: { storeId, name: { startsWith: "c" } },
    });
    expect(fantasmas.some((f) => /^c[a-z0-9]{20,}$/.test(f.name))).toBe(false);
  });

  it("o produto real fica com a receita ativa, e nao sem receita", async () => {
    const item = await prisma.inventoryItem.create({
      data: { storeId, name: "Farinha", itemType: "INGREDIENT", baseUnitId: "unit_kg" },
    });
    const p: any = await novoProduto("Pão", { tipoDeControle: "PRODUCAO" });

    await CompositionService.createComposition(storeId, p.id, {
      productId: p.id,
      isActive: true,
      items: [{ inventoryItemId: item.id, quantity: 500, unitId: "unit_g", sortOrder: 0 }],
    } as any);

    const ativa = await prisma.productComposition.findFirst({
      where: { productId: p.id, isActive: true },
      include: { items: true },
    });
    expect(ativa).not.toBeNull();
    expect(ativa!.items).toHaveLength(1);
    expect(ativa!.items[0].unitId).toBe("unit_g");
  });
});

describe("o produto nao nasce duas vezes", () => {
  /*
   * O segundo CREATE com o mesmo nome e exatamente o que o wizard fazia ao
   * voltar da etapa da receita e concluir de novo. O banco recusa — e essa
   * recusa e a rede de seguranca por tras da correcao de estado na tela.
   */
  it("criar o mesmo nome duas vezes na mesma loja e recusado pelo banco", async () => {
    await novoProduto("X-Burguer");
    await expect(novoProduto("X-Burguer")).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.product.count({ where: { storeId } })).toBe(1);
  });

  it("o P2002 do slug vira frase, e nao codigo de banco", async () => {
    await novoProduto("X-Burguer");
    let recado: string | null = null;
    try {
      await novoProduto("X-Burguer");
    } catch (e) {
      recado = mensagemDeSlugDuplicado(e);
    }
    expect(recado).toMatch(/já existe um produto com esse nome/i);
    expect(recado).not.toMatch(/P2002|Unique constraint|storeId/i);
  });

  /*
   * UPDATE nao colide consigo mesmo. E o caminho que a tela passa a usar depois
   * de guardar o id: concluir de novo edita o produto em vez de recria-lo.
   */
  it("atualizar o mesmo produto com o mesmo slug nao colide", async () => {
    const p: any = await novoProduto("X-Burguer");
    const atualizado = await prisma.product.update({
      where: { id: p.id },
      data: { basePrice: 42, slug: p.slug },
    });
    expect(Number(atualizado.basePrice)).toBe(42);
    expect(await prisma.product.count({ where: { storeId } })).toBe(1);
  });

  it("o mesmo nome em LOJAS diferentes continua permitido", async () => {
    await novoProduto("X-Burguer");
    const outra = await prisma.store.create({
      data: {
        slug: `outra-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        name: "Outra",
        settings: { create: { storeName: "Outra", whatsappNumber: "11999999999" } },
      },
    });
    const cat = await prisma.category.create({
      data: { storeId: outra.id, name: "Geral", slug: "geral", icon: "🍽", kind: "SIMPLE" },
    });
    const gemeo = await prisma.product.create({
      data: {
        storeId: outra.id,
        categoryId: cat.id,
        name: "X-Burguer",
        slug: gerarSlugDeProduto("X-Burguer"),
        description: "x",
        basePrice: 10,
      },
    });
    expect(gemeo.slug).toBe("x-burguer");
  });
});
