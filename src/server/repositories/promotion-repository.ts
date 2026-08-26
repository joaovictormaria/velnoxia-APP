import { prisma } from "../db/client";

export type PromotionInput = {
  eyebrow: string;
  title: string;
  description: string;
  discount?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function listPromotions(storeId: string) {
  return prisma.promotion.findMany({
    where: { storeId },
    orderBy: { sortOrder: "asc" },
  });
}

export function listActivePromotions(storeId: string) {
  return prisma.promotion.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function createPromotion(storeId: string, data: PromotionInput) {
  return prisma.promotion.create({ data: { ...data, storeId } });
}

/** storeId is part of the filter so an id from another store matches nothing. */
export function updatePromotion(storeId: string, id: string, data: PromotionInput) {
  return prisma.promotion.update({ where: { id }, data });
}

export function deletePromotion(storeId: string, id: string) {
  return prisma.promotion.delete({ where: { id } });
}
