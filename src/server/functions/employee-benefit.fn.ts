import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyPassword } from "../auth/password";
import { prisma } from "../db/client";
import {
  employeeHasBenefit,
  findEmployeeForCheckout,
  lerUsoDoDia,
} from "../repositories/employee-repository";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { permitido } from "../security/rate-limit";
import { calcularBeneficio, descreverCota } from "../services/employee-benefit";
import { precificarItens } from "../services/order-service";

/**
 * A prÃ©via do benefÃ­cio, para o carrinho mostrar o desconto antes de a pessoa
 * confirmar o pedido.
 *
 * NÃ£o escreve nada e nÃ£o reserva cota: Ã© uma resposta sobre o carrinho de
 * agora. O nÃºmero que vale Ã© o refeito dentro da transaÃ§Ã£o do pedido, e os
 * dois usam a mesma `precificarItens` e o mesmo `calcularBeneficio` justamente
 * para nÃ£o poderem divergir.
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
     * Um PIN de 4 dÃ­gitos sÃ£o dez mil combinaÃ§Ãµes â€” um script varreria todas em
     * minutos se pudesse tentar Ã  vontade, e a recompensa seria comer de graÃ§a
     * no lugar de outra pessoa. Dez tentativas por minuto por origem deixam
     * quem errou o prÃ³prio PIN corrigir e param quem estÃ¡ varrendo.
     */
    if (!permitido("beneficio-funcionario", { max: 10, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
    }

    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) {
      return { ok: false as const, error: "Esta loja nÃ£o estÃ¡ disponÃ­vel no momento." };
    }

    const phone = data.phone.replace(/\D/g, "");
    const funcionario = await findEmployeeForCheckout(prisma, store.id, phone);
    // A mesma resposta para "nÃ£o Ã© funcionÃ¡rio" e "PIN errado": separÃ¡-las
    // transformaria este endereÃ§o num jeito de descobrir quem trabalha na loja.
    if (!funcionario || !(await verifyPassword(data.pin, funcionario.pinHash))) {
      return { ok: false as const, error: "Telefone ou PIN nÃ£o confere." };
    }
    if (!funcionario.plano) {
      return {
        ok: false as const,
        error: "Seu cadastro ainda nÃ£o tem um benefÃ­cio definido. Fale com a loja.",
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

/**
 * Aquele telefone Ã© de funcionÃ¡rio?
 *
 * O checkout pergunta assim que a pessoa termina de digitar o WhatsApp, para
 * abrir o campo do PIN sozinho. Antes o campo ficava atrÃ¡s de um link discreto
 * e passava despercebido: o funcionÃ¡rio pedia, nÃ£o via desconto nenhum e
 * concluÃ­a que o benefÃ­cio nÃ£o funcionava.
 *
 * Responde sÃ³ sim ou nÃ£o, sobre um nÃºmero que quem pergunta jÃ¡ digitou, e sem
 * o PIN isso nÃ£o vale desconto. Ainda assim Ã© o endereÃ§o que confirma quem
 * trabalha na loja, entÃ£o o teto por origem Ã© mais apertado que o do resto:
 * uma pessoa digita o prÃ³prio telefone uma vez, um script tentaria a lista toda.
 */
export const employeePhoneHasBenefitFn = createServerFn({ method: "POST" })
  .validator(z.object({ storeSlug: z.string().min(1), phone: z.string().min(10) }))
  .handler(async ({ data }) => {
    if (!permitido("telefone-funcionario", { max: 12, janelaMs: 60_000 })) {
      // SilÃªncio em vez de erro: isto Ã© um enfeite de conveniÃªncia, e barrar o
      // checkout de um cliente comum por causa dele seria pior que nÃ£o ter.
      return { funcionario: false as const };
    }

    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) return { funcionario: false as const };

    const funcionario = await employeeHasBenefit(store.id, data.phone.replace(/\D/g, ""));
    return { funcionario };
  });
