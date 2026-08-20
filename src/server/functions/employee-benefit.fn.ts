import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyPassword } from "../auth/password";
import { prisma } from "../db/client";
import { findEmployeeForCheckout, lerUsoDoDia } from "../repositories/employee-repository";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { permitido } from "../security/rate-limit";
import { calcularBeneficio, descreverCota } from "../services/employee-benefit";
import { precificarItens } from "../services/order-service";

/**
 * A prévia do benefício, para o carrinho mostrar o desconto antes de a pessoa
 * confirmar o pedido.
 *
 * Não escreve nada e não reserva cota: é uma resposta sobre o carrinho de
 * agora. O número que vale é o refeito dentro da transação do pedido, e os
 * dois usam a mesma `precificarItens` e o mesmo `calcularBeneficio` justamente
 * para não poderem divergir.
 */
export const previewEmployeeBenefitFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      storeSlug: z.string().min(1),
      phone: z.string().min(10),
      pin: z.string().regex(/^\d{4}$/),
      items: z
        .array(
          z.object({
            productSlug: z.string().min(1),
            sizeId: z.string().optional(),
            optionIds: z.array(z.string()).max(30).optional(),
            secondProductSlug: z.string().optional(),
            extraIds: z.array(z.string()).default([]),
            quantity: z.number().int().min(1).max(50),
          }),
        )
        .min(1),
    }),
  )
  .handler(async ({ data }) => {
    /*
     * Um PIN de 4 dígitos são dez mil combinações — um script varreria todas em
     * minutos se pudesse tentar à vontade, e a recompensa seria comer de graça
     * no lugar de outra pessoa. Dez tentativas por minuto por origem deixam
     * quem errou o próprio PIN corrigir e param quem está varrendo.
     */
    if (!permitido("beneficio-funcionario", { max: 10, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
    }

    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) {
      return { ok: false as const, error: "Esta loja não está disponível no momento." };
    }

    const phone = data.phone.replace(/\D/g, "");
    const funcionario = await findEmployeeForCheckout(prisma, store.id, phone);
    // A mesma resposta para "não é funcionário" e "PIN errado": separá-las
    // transformaria este endereço num jeito de descobrir quem trabalha na loja.
    if (!funcionario || !(await verifyPassword(data.pin, funcionario.pinHash))) {
      return { ok: false as const, error: "Telefone ou PIN não confere." };
    }
    if (!funcionario.plano) {
      return {
        ok: false as const,
        error: "Seu cadastro ainda não tem um benefício definido. Fale com a loja.",
      };
    }

    const precos = await precificarItens(store.id, data.items.map((i) => ({ ...i, note: undefined })));
    if (!precos.ok) return { ok: false as const, error: precos.error };

    const beneficio = calcularBeneficio(
      funcionario.plano,
      precos.linhasParaBeneficio,
      await lerUsoDoDia(prisma, store.id, funcionario.id),
    );

    return {
      ok: true as const,
      nome: funcionario.name,
      desconto: beneficio.descontoTotal,
      foraDaCota: beneficio.foraDaCota,
      cota: descreverCota(beneficio.cota),
      /** Se a tela deve oferecer "desconto em folha" como forma de pagamento. */
      permiteFolha: funcionario.plano.allowPayroll,
    };
  });
