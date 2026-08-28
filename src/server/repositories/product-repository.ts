import type { HalfPizzaPricingRule } from "@prisma/client";
import { prisma } from "../db/client";
import {
  criarGrupos,
  sincronizarGrupos,
  type OptionGroupInput,
} from "./option-group-sync";

/** Um preço para um tamanho que a categoria do produto oferece. */
export type ProductSizeInput = {
  categorySizeId: string;
  price: number;
  isAvailable: boolean;
};

export type ProductInput = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  basePrice: number;
  imageUrl?: string | null;
  tag?: string | null;
  isActive: boolean;
  allowHalfAndHalf: boolean;
  halfPizzaPricingRule: HalfPizzaPricingRule;
  sortOrder: number;
  sizes: ProductSizeInput[];
  /**
   * Perguntas só deste produto, ao lado das que a categoria já faz. É o que
   * permite o suco perguntar laranja ou maracujá sem obrigar o refrigerante da
   * mesma categoria a oferecer a mesma lista.
   */
  optionGroups?: OptionGroupInput[];
};

export function listProducts(
  storeId: string,
  filters?: { categoryId?: string; search?: string },
) {
  return prisma.product.findMany({
    where: {
      storeId,
      categoryId: filters?.categoryId,
      name: filters?.search
        ? { contains: filters.search, mode: "insensitive" }
        : undefined,
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: {
      category: { select: { id: true, name: true } },
      // O nome do tamanho vem junto: a listagem mostra "Brotinho, Grande" e
      // não teria como saber disso só com o id.
      sizes: {
        where: { isAvailable: true },
        orderBy: { categorySize: { sortOrder: "asc" } },
        include: { categorySize: { select: { id: true, label: true, sortOrder: true } } },
      },
    },
  });
}

export function getProductById(storeId: string, id: string) {
  return prisma.product.findFirst({
    where: { id, storeId },
    include: {
      sizes: { include: { categorySize: { select: { id: true, label: true, sortOrder: true } } } },
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

export async function createProduct(
  storeId: string,
  { sizes, optionGroups, ...data }: ProductInput,
) {
  // The category is re-checked against the store so a forged categoryId cannot
  // attach a product to someone else's category.
  await assertCategoryBelongsToStore(storeId, data.categoryId);
  await assertSizesBelongToCategory(data.categoryId, sizes);
  return prisma.product.create({
    data: {
      ...data,
      storeId,
      sizes: { create: sizes },
      optionGroups: criarGrupos(optionGroups ?? []),
    },
    include: { sizes: true },
  });
}

/** Sizes are replaced wholesale — the form always submits the complete set. */
export async function updateProduct(
  storeId: string,
  id: string,
  { sizes, optionGroups, ...data }: ProductInput,
) {
  await assertCategoryBelongsToStore(storeId, data.categoryId);
  await assertSizesBelongToCategory(data.categoryId, sizes);
  return prisma.$transaction(async (tx) => {
    const owned = await tx.product.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!owned) throw new Error("NOT_FOUND");
    await tx.productSize.deleteMany({ where: { productId: id } });
    // Os tamanhos podem ser recriados porque ninguém guarda o id deles; as
    // perguntas, não — um pedido em aberto aponta para a opção escolhida.
    if (optionGroups) await sincronizarGrupos(tx, { productId: id }, optionGroups);
    return tx.product.update({
      where: { id },
      data: { ...data, sizes: { create: sizes } },
      include: { sizes: true },
    });
  });
}

/**
 * Os preços só podem apontar para tamanhos da categoria do próprio produto.
 *
 * Sem isso, um categorySizeId de outra categoria — ou de outra loja — entraria
 * pelo formulário e o produto passaria a ter um tamanho que a vitrine dele nem
 * mostra, cobrando um preço que ninguém consegue explicar.
 */
async function assertSizesBelongToCategory(categoryId: string, sizes: ProductSizeInput[]) {
  if (sizes.length === 0) return;
  const validos = await prisma.categorySize.count({
    where: { categoryId, id: { in: sizes.map((s) => s.categorySizeId) } },
  });
  if (validos !== new Set(sizes.map((s) => s.categorySizeId)).size) {
    throw new Error("SIZE_NOT_IN_CATEGORY");
  }
}

export function setProductActive(storeId: string, id: string, isActive: boolean) {
  return prisma.product.update({ where: { id, storeId }, data: { isActive } });
}

export function deleteProduct(storeId: string, id: string) {
  return prisma.product.delete({ where: { id, storeId } });
}

/** Public menu for the storefront: only active products in active categories. */
export function listMenuForStorefront(storeId: string) {
  return prisma.category.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            where: { isAvailable: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      products: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          /*
           * O item de estoque que este produto consome, se houver.
           *
           * Só os dois saldos: o cardápio precisa saber SE pode vender, não
           * QUANTO existe. O número vira um booleano na server function e
           * nunca chega ao navegador — saldo é informação de negócio, e a
           * vitrine é pública.
           */
          inventoryItem: {
            select: { quantityOnHand: true, quantityReserved: true, isActive: true },
          },
          optionGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              options: { where: { isAvailable: true }, orderBy: { sortOrder: "asc" } },
            },
          },
          sizes: {
            where: { isAvailable: true },
            orderBy: { categorySize: { sortOrder: "asc" } },
            include: { categorySize: { select: { id: true, label: true } } },
          },
        },
      },
    },
  });
}

export function getProductBySlug(storeId: string, slug: string) {
  return prisma.product.findUnique({
    where: { storeId_slug: { storeId, slug } },
    include: {
      category: true,
      sizes: {
        where: { isAvailable: true },
        orderBy: { categorySize: { sortOrder: "asc" } },
        include: { categorySize: { select: { id: true, label: true } } },
      },
    },
  });
}

async function assertCategoryBelongsToStore(storeId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, storeId },
    select: { id: true },
  });
  if (!category) throw new Error("CATEGORY_NOT_FOUND");
}
