import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { permitido } from "../security/rate-limit";
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
    .min(3, "O cÃ³digo precisa de pelo menos 3 caracteres.")
    .max(24)
    // Spaces and accents get lost or mistyped when a customer copies a code
    // from a story or a printed flyer.
    .regex(/^[A-Za-z0-9-]+$/, "Use apenas letras, nÃºmeros e hÃ­fen."),
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
      return { ok: false as const, error: "Um desconto em porcentagem nÃ£o passa de 100%." };
    }

    const validFrom = new Date(d.validFrom);
    // The end date arrives as a day, and a coupon valid "until the 20th" should
    // work through the whole 20th, not expire at its first minute.
    const validUntil = new Date(d.validUntil);
    validUntil.setHours(23, 59, 59, 999);
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
      return { ok: false as const, error: "Datas invÃ¡lidas." };
    }
    if (validUntil < validFrom) {
      return { ok: false as const, error: "A data final nÃ£o pode ser antes da inicial." };
    }

    // The unique index would raise anyway; catching it here gives the owner a
    // sentence instead of a stack trace.
    const existing = await findCouponByCode(storeId, d.code);
    if (existing && existing.id !== data.id) {
      return { ok: false as const, error: "JÃ¡ existe um cupom com esse cÃ³digo." };
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

/* ---- pÃºblico: conferir um cupom antes de fechar o pedido ---- */

/**
 * Checks a code the customer typed and answers with the discount it would give.
 * The order service validates again when the order is placed â€” this is the
 * preview, not the authority, and it must never be the only check.
 */
export const previewCouponFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      storeSlug: z.string().min(1),
      code: z.string().trim().min(1),
      subtotal: z.number().min(0),
    }),
  )
  .handler(async ({ data }) => {
    // PÃºblico e diz se um cÃ³digo Ã© vÃ¡lido: sem teto, dÃ¡ para varrer cÃ³digos e
    // achar cupom nÃ£o divulgado. 20/min por origem Ã© folgado para quem digita
    // um cÃ³digo e intransponÃ­vel para um dicionÃ¡rio.
    if (!permitido("coupon-preview", { max: 20, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
    }
    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) return { ok: false as const, error: "Loja indisponÃ­vel." };

    const coupon = await findCouponByCode(store.id, data.code);
    // Every refusal says which one it is: a customer who is told only "invalid"
    // retypes the same correct code again.
    if (!coupon || !coupon.isActive) return { ok: false as const, error: "Cupom nÃ£o encontrado." };
    const agora = new Date();
    if (agora < coupon.validFrom) return { ok: false as const, error: "Esse cupom ainda nÃ£o comeÃ§ou." };
    if (agora > coupon.validUntil) return { ok: false as const, error: "Esse cupom jÃ¡ venceu." };
    if (coupon.maxUsage !== null && coupon.usageCount >= coupon.maxUsage) {
      return { ok: false as const, error: "Esse cupom jÃ¡ atingiu o limite de usos." };
    }
    if (coupon.minOrderValue !== null && data.subtotal < Number(coupon.minOrderValue)) {
      return {
        ok: false as const,
        error: `Esse cupom vale a partir de ${Number(coupon.minOrderValue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      };
    }

    const bruto =
      coupon.discountType === "PERCENTAGE"
        ? (data.subtotal * Number(coupon.discountValue)) / 100
        : Number(coupon.discountValue);
    const discount = Math.min(Math.round(bruto * 100) / 100, data.subtotal);
    return { ok: true as const, code: coupon.code, discount };
  });

