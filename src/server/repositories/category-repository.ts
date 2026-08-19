import type { CategoryKind } from "@prisma/client";
import { prisma } from "../db/client";

export type CategoryInput = {
  /** Nomes dos tamanhos, na ordem. Lista vazia = categoria sem tamanhos. */
  sizes?: string[];
  name: string;
  slug: string;
  badge?: string | null;
  headline?: string | null;
  subhead?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  kind: CategoryKind;
  sortOrder: number;
  isActive: boolean;
};

export function listCategories(storeId: string) {
  return prisma.category.findMany({
    where: { storeId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { products: true } },
      sizes: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export function listActiveCategories(storeId: string) {
  return prisma.category.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: "asc" },
    // Os tamanhos vêm junto porque o formulário de produto precisa deles para
    // saber o que oferecer: é a categoria que decide se existe "P/M/G".
    include: { sizes: { orderBy: { sortOrder: "asc" } } },
  });
}

export function getCategoryById(storeId: string, id: string) {
  return prisma.category.findFirst({ where: { id, storeId } });
}

export function createCategory(storeId: string, { sizes, ...data }: CategoryInput) {
  return prisma.category.create({
    data: {
      ...data,
      storeId,
      sizes: { create: (sizes ?? []).map((label, i) => ({ label, sortOrder: i + 1 })) },
    },
  });
}

/**
 * storeId is part of the filter so an id from another store matches nothing.
 *
 * Os tamanhos são conciliados em vez de recriados: apagar e refazer geraria
 * ids novos, e os preços dos produtos apontam para eles — a loja perderia toda
 * a tabela de preços a cada vez que o dono salvasse a categoria.
 */
export async function updateCategory(
  storeId: string,
  id: string,
  { sizes, ...data }: Partial<CategoryInput>,
) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.category.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!owned) throw new Error("NOT_FOUND");

    if (sizes) {
      const atuais = await tx.categorySize.findMany({ where: { categoryId: id } });
      const querAgora = new Set(sizes);

      // Some quem saiu — leva junto os preços que dependiam dele, que sem o
      // tamanho não teriam como ser mostrados.
      const removidos = atuais.filter((s) => !querAgora.has(s.label)).map((s) => s.id);
      if (removidos.length) {
        await tx.categorySize.deleteMany({ where: { id: { in: removidos } } });
      }

      for (const [i, label] of sizes.entries()) {
        const existente = atuais.find((s) => s.label === label);
        if (existente) {
          await tx.categorySize.update({ where: { id: existente.id }, data: { sortOrder: i + 1 } });
        } else {
          await tx.categorySize.create({ data: { categoryId: id, label, sortOrder: i + 1 } });
        }
      }
    }

    return tx.category.update({ where: { id }, data });
  });
}

export function deleteCategory(storeId: string, id: string) {
  return prisma.category.delete({ where: { id, storeId } });
}

export function countProductsInCategory(storeId: string, id: string) {
  return prisma.product.count({ where: { categoryId: id, storeId } });
}
