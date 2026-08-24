import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createOrderFromCheckout } from "../services/order-service";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { permitido } from "../security/rate-limit";

const checkoutSchema = z.object({
  storeSlug: z.string().min(1),
  items: z
    .array(
      z.object({
        productSlug: z.string().min(1),
        sizeId: z.string().optional(),
        optionIds: z.array(z.string()).max(30).optional(),
        secondProductSlug: z.string().optional(),
        extraIds: z.array(z.string()).default([]),
        quantity: z.number().int().min(1).max(50),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1),
  customerName: z.string().min(2, "Informe seu nome."),
  customerPhone: z.string().min(10, "Informe um telefone vÃ¡lido."),
  type: z.enum(["DELIVERY", "PICKUP"]),
  // PAYROLL entra aqui, mas quem o libera Ã© o plano do funcionÃ¡rio: o serviÃ§o
  // recusa quando nÃ£o houver um, e ele nunca estÃ¡ em `acceptedPaymentMethods`.
  paymentMethod: z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH", "PAYROLL"]),
  couponCode: z.string().optional(),
  /** Quatro dÃ­gitos, quando a pessoa se declara funcionÃ¡ria. */
  employeePin: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  customerNote: z.string().max(500).optional(),
  /** Mesa QRCode ID para pedidos de balcÃ£o/mesa. */
  tableId: z.string().uuid().optional(),
  /** Device token para pedidos de mesa (autorizaÃ§Ã£o de dispositivo). */
  deviceToken: z.string().optional(),
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

/** Public â€” creates a real order. All pricing is recomputed server-side. */
export const submitCheckoutFn = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    // 8 pedidos por minuto por origem: um cliente real faz um; um script
    // que enche o Kanban de uma loja bate no teto na primeira rajada.
    if (!permitido("checkout", { max: 8, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitos pedidos seguidos. Aguarde um instante." };
    }
    if (data.type === "DELIVERY" && !data.delivery?.street) {
      return { ok: false as const, error: "Informe o endereÃ§o de entrega." };
    }
    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) {
      return { ok: false as const, error: "Esta loja nÃ£o estÃ¡ disponÃ­vel no momento." };
    }
    return createOrderFromCheckout(store.id, data, data.deviceToken);
  });
