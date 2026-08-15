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

export function listProducts(filters?: { categoryId?: string; search?: string }) {
  return prisma.product.findMany({
    where: {
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

export function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { sizes: true },
  });
}

export async function createProduct({ sizes, ...data }: ProductInput) {
  return prisma.product.create({
    data: { ...data, sizes: { create: sizes } },
    include: { sizes: true },
  });
}

/** Sizes are replaced wholesale — the form always submits the complete set. */
export async function updateProduct(id: string, { sizes, ...data }: ProductInput) {
  return prisma.$transaction(async (tx) => {
    await tx.productSize.deleteMany({ where: { productId: id } });
    return tx.product.update({
      where: { id },
      data: { ...data, sizes: { create: sizes } },
      include: { sizes: true },
    });
  });
}

export function setProductActive(id: string, isActive: boolean) {
  return prisma.product.update({ where: { id }, data: { isActive } });
}

export function deleteProduct(id: string) {
  return prisma.product.delete({ where: { id } });
}

/** Public menu for the storefront: only active products in active categories. */
export function listMenuForStorefront() {
  return prisma.category.findMany({
    where: { isActive: true },
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

export function getProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      sizes: { where: { isAvailable: true }, orderBy: { price: "asc" } },
    },
  });
}
