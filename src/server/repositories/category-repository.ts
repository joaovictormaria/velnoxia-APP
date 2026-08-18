import type { CategoryKind } from "@prisma/client";
import { prisma } from "../db/client";

export type CategoryInput = {
  name: string;
  slug: string;
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
    include: { _count: { select: { products: true } } },
  });
}

export function listActiveCategories(storeId: string) {
  return prisma.category.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function getCategoryById(storeId: string, id: string) {
  return prisma.category.findFirst({ where: { id, storeId } });
}

export function createCategory(storeId: string, data: CategoryInput) {
  return prisma.category.create({ data: { ...data, storeId } });
}

/** storeId is part of the filter so an id from another store matches nothing. */
export function updateCategory(storeId: string, id: string, data: Partial<CategoryInput>) {
  return prisma.category.update({ where: { id, storeId }, data });
}

export function deleteCategory(storeId: string, id: string) {
  return prisma.category.delete({ where: { id, storeId } });
}

export function countProductsInCategory(storeId: string, id: string) {
  return prisma.product.count({ where: { categoryId: id, storeId } });
}
