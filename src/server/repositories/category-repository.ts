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

export function listCategories() {
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

export function listActiveCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function getCategoryById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

export function createCategory(data: CategoryInput) {
  return prisma.category.create({ data });
}

export function updateCategory(id: string, data: Partial<CategoryInput>) {
  return prisma.category.update({ where: { id }, data });
}

export function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } });
}

export function countProductsInCategory(id: string) {
  return prisma.product.count({ where: { categoryId: id } });
}
