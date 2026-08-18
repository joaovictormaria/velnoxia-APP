import { prisma } from "../db/client";

export type CouponInput = {
  code: string;
  description?: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  minOrderValue?: number | null;
  maxUsage?: number | null;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
};

/** Codes are typed by customers in any case; storing them upper-case keeps the
 *  lookup at checkout — which upper-cases too — a plain equality match. */
const normalize = (code: string) => code.trim().toUpperCase();

export function listCoupons(storeId: string) {
  return prisma.coupon.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } });
}

export function createCoupon(storeId: string, data: CouponInput) {
  return prisma.coupon.create({ data: { ...data, code: normalize(data.code), storeId } });
}

/** storeId is part of the filter so an id from another store matches nothing. */
export function updateCoupon(storeId: string, id: string, data: CouponInput) {
  return prisma.coupon.update({
    where: { id, storeId },
    data: { ...data, code: normalize(data.code) },
  });
}

export function deleteCoupon(storeId: string, id: string) {
  return prisma.coupon.delete({ where: { id, storeId } });
}

export function findCouponByCode(storeId: string, code: string) {
  return prisma.coupon.findFirst({ where: { storeId, code: normalize(code) } });
}
