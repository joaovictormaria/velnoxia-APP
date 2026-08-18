import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import {
  createCoupon,
  deleteCoupon,
  findCouponByCode,
  listCoupons,
  updateCoupon,
} from "../repositories/coupon-repository";

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "O código precisa de pelo menos 3 caracteres.")
    .max(24)
    // Spaces and accents get lost or mistyped when a customer copies a code
    // from a story or a printed flyer.
    .regex(/^[A-Za-z0-9-]+$/, "Use apenas letras, números e hífen."),
  description: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null)),
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  discountValue: z.number().positive("O desconto precisa ser maior que zero."),
  minOrderValue: z.number().min(0).nullish(),
  maxUsage: z.number().int().positive().nullish(),
  validFrom: z.string().min(1),
  validUntil: z.string().min(1),
  isActive: z.boolean(),
});

export const listCouponsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return listCoupons(storeId);
});

export const saveCouponFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: couponSchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const d = data.data;

    if (d.discountType === "PERCENTAGE" && d.discountValue > 100) {
      return { ok: false as const, error: "Um desconto em porcentagem não passa de 100%." };
    }

    const validFrom = new Date(d.validFrom);
    // The end date arrives as a day, and a coupon valid "until the 20th" should
    // work through the whole 20th, not expire at its first minute.
    const validUntil = new Date(d.validUntil);
    validUntil.setHours(23, 59, 59, 999);
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
      return { ok: false as const, error: "Datas inválidas." };
    }
    if (validUntil < validFrom) {
      return { ok: false as const, error: "A data final não pode ser antes da inicial." };
    }

    // The unique index would raise anyway; catching it here gives the owner a
    // sentence instead of a stack trace.
    const existing = await findCouponByCode(storeId, d.code);
    if (existing && existing.id !== data.id) {
      return { ok: false as const, error: "Já existe um cupom com esse código." };
    }

    const input = { ...d, validFrom, validUntil };
    const coupon = data.id
      ? await updateCoupon(storeId, data.id, input)
      : await createCoupon(storeId, input);
    return { ok: true as const, coupon };
  });

export const deleteCouponFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await deleteCoupon(storeId, data.id);
    return { ok: true as const };
  });
