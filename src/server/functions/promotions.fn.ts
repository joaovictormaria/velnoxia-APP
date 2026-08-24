// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import {
  createPromotion,
  deletePromotion,
  listPromotions,
  updatePromotion,
} from "../repositories/promotion-repository";

const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const promotionSchema = z.object({
  eyebrow: z.string().trim().min(1, "Informe a chamada."),
  title: z.string().trim().min(1, "Informe o tÃ­tulo."),
  description: z.string().trim().min(1, "Informe a descriÃ§Ã£o."),
  discount: optionalText,
  price: z.number().min(0).nullish(),
  originalPrice: z.number().min(0).nullish(),
  imageUrl: optionalText,
  sortOrder: z.number().int().default(0),
  isActive: z.boolean(),
});

export const listPromotionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return listPromotions(storeId);
});

export const savePromotionFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: promotionSchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    // A crossed-out price below the current one reads as a price increase, so
    // it is refused here rather than shown to customers.
    if (
      data.data.price != null &&
      data.data.originalPrice != null &&
      data.data.originalPrice <= data.data.price
    ) {
      return {
        ok: false as const,
        error: "O preÃ§o antigo precisa ser maior que o preÃ§o promocional.",
      };
    }
    const promotion = data.id
      ? await updatePromotion(storeId, data.id, data.data)
      : await createPromotion(storeId, data.data);
    return { ok: true as const, promotion };
  });

export const deletePromotionFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await deletePromotion(storeId, data.id);
    return { ok: true as const };
  });

