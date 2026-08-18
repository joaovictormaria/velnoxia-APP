import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createOrderFromCheckout } from "../services/order-service";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";

const checkoutSchema = z.object({
  storeSlug: z.string().min(1),
  items: z
    .array(
      z.object({
        productSlug: z.string().min(1),
        sizeKey: z.string().optional(),
        secondProductSlug: z.string().optional(),
        extraIds: z.array(z.string()).default([]),
        quantity: z.number().int().min(1).max(50),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1),
  customerName: z.string().min(2, "Informe seu nome."),
  customerPhone: z.string().min(10, "Informe um telefone válido."),
  type: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH"]),
  couponCode: z.string().optional(),
  customerNote: z.string().max(500).optional(),
  delivery: z
    .object({
      street: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
    })
    .optional(),
});

/** Public — creates a real order. All pricing is recomputed server-side. */
export const submitCheckoutFn = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    if (data.type === "DELIVERY" && !data.delivery?.street) {
      return { ok: false as const, error: "Informe o endereço de entrega." };
    }
    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) {
      return { ok: false as const, error: "Esta loja não está disponível no momento." };
    }
    return createOrderFromCheckout(store.id, data);
  });
