import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createOrderFromCheckout } from "../services/order-service";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { estadoComercialDaLoja } from "@/server/billing/plano-da-loja";
import { recursoNoEstado } from "@/lib/planos/resolucao";
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
  customerPhone: z.string().min(10, "Informe um telefone válido."),
  type: z.enum(["DELIVERY", "PICKUP"]),
  // PAYROLL entra aqui, mas quem o libera é o plano do funcionário: o serviço
  // recusa quando não houver um, e ele nunca está em `acceptedPaymentMethods`.
  paymentMethod: z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH", "PAYROLL"]),
  couponCode: z.string().optional(),
  /** Quatro dígitos, quando a pessoa se declara funcionária. */
  employeePin: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  customerNote: z.string().max(500).optional(),
  /** Mesa QRCode ID para pedidos de balcão/mesa. */
  tableId: z.string().uuid().optional(),
  /** Device token para pedidos de mesa (autorização de dispositivo). */
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

/** Public — creates a real order. All pricing is recomputed server-side. */
export const submitCheckoutFn = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    // 8 pedidos por minuto por origem: um cliente real faz um; um script
    // que enche o Kanban de uma loja bate no teto na primeira rajada.
    if (!permitido("checkout", { max: 8, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitos pedidos seguidos. Aguarde um instante." };
    }
    if (data.type === "DELIVERY" && !data.delivery?.street) {
      return { ok: false as const, error: "Informe o endereço de entrega." };
    }
    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) {
      return { ok: false as const, error: "Esta loja não está disponível no momento." };
    }

    /*
     * ═══ O CHECKOUT CONTINUA PÚBLICO E BASIC; DOIS CAMPOS DELE NÃO ═════════
     *
     * Vender pela vitrine é o coração do plano básico, e gatear esta função
     * inteira tiraria a loja do ar. Mas dois dos campos que ela aceita são do
     * módulo de benefícios:
     *
     *   employeePin              identifica o funcionário e aplica o desconto
     *   paymentMethod: PAYROLL   "desconta em folha", que só existe com benefício
     *
     * A recusa vem ANTES de `createOrderFromCheckout`, e não dentro dela: o
     * serviço não conhece plano nenhum, e é essa separação que mantém a regra
     * comercial fora do motor de pedidos.
     *
     * Sem sessão administrativa aqui — quem chama é o cliente. A pergunta é
     * feita sobre a LOJA que o slug resolveu no banco; trocar o parâmetro leva
     * a outra loja, com o plano dela.
     */
    const comercial = estadoComercialDaLoja(store);

    const pediuBeneficio = Boolean(data.employeePin) || data.paymentMethod === "PAYROLL";
    if (pediuBeneficio && recursoNoEstado(comercial, "BENEFICIOS") === "BLOQUEADO") {
      return {
        ok: false as const,
        error: "Esta forma de pagamento não está disponível.",
      };
    }

    /*
      O CUPOM É OUTRO CAMPO PAGO — e só ele, não o pedido.

      Uma loja sem MARKETING não cria cupom, mas pode ter criado num
      período Premium: recusar o CÓDIGO impede que um cupom antigo continue
      valendo depois do downgrade, sem impedir a venda. O pedido sem cupom
      passa exatamente como sempre passou.

      "Cupom inválido" é a mesma recusa de código inexistente — de novo,
      não se conta ao cliente o que a loja contratou.
    */
    if (data.couponCode && recursoNoEstado(comercial, "MARKETING") === "BLOQUEADO") {
      return { ok: false as const, error: "Cupom inválido." };
    }

    return createOrderFromCheckout(store.id, data, data.deviceToken);
  });
