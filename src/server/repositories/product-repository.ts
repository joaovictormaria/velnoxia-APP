import type { HalfPizzaPricingRule, SizeLabel } from "@prisma/client";
import { prisma } from "../db/client";

export type ProductSizeInput = {
  size: SizeLabel;
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
      sizes: { where: { isAvailable: true }, orderBy: { price: "asc" } },
    },
  });
}

export function getProductById(storeId: string, id: string) {
  return prisma.product.findFirst({
    where: { id, storeId },
    include: { sizes: true },
  });
}

export async function createProduct(storeId: string, { sizes, ...data }: ProductInput) {
  // The category is re-checked against the store so a forged categoryId cannot
  // attach a product to someone else's category.
  await assertCategoryBelongsToStore(storeId, data.categoryId);
  return prisma.product.create({
    data: { ...data, storeId, sizes: { create: sizes } },
    include: { sizes: true },
  });
}

/** Sizes are replaced wholesale — the form always submits the complete set. */
export async function updateProduct(
  storeId: string,
  id: string,
  { sizes, ...data }: ProductInput,
) {
  await assertCategoryBelongsToStore(storeId, data.categoryId);
  return prisma.$transaction(async (tx) => {
    const owned = await tx.product.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!owned) throw new Error("NOT_FOUND");
    await tx.productSize.deleteMany({ where: { productId: id } });
    return tx.product.update({
      where: { id },
      data: { ...data, sizes: { create: sizes } },
      include: { sizes: true },
    });
  });
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
      products: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { sizes: { where: { isAvailable: true }, orderBy: { price: "asc" } } },
      },
    },
  });
}

export function getProductBySlug(storeId: string, slug: string) {
  return prisma.product.findUnique({
    where: { storeId_slug: { storeId, slug } },
    include: {
      category: true,
      sizes: { where: { isAvailable: true }, orderBy: { price: "asc" } },
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
