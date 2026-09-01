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
import { estadoComercialDaLoja } from "@/server/billing/plano-da-loja";
import { recursoNoEstado } from "@/lib/planos/resolucao";
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

    /*
      ═══ O PLANO, NUM FLUXO PÚBLICO ══════════════════════════════════════

      Quem chama é o CLIENTE no checkout da vitrine — sem conta, sem cookie
      de painel. `exigirRecurso` passaria por `requireAdminSession` e
      recusaria qualquer pessoa comum, então a pergunta é feita sobre a LOJA
      que o slug resolveu no banco.

      A resposta é a mesma de "telefone ou PIN não confere", e isso é
      HONESTO, não evasivo: numa loja sem o módulo não existe programa de
      benefício algum, então não há benefício a conceder. Dizer "o plano
      desta loja não tem benefícios" contaria a um cliente o que a loja
      contratou.
    */
    if (recursoNoEstado(estadoComercialDaLoja(store), "BENEFICIOS") === "BLOQUEADO") {
      return { ok: false as const, error: "Telefone ou PIN não confere." };
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

/**
 * Aquele telefone é de funcionário?
 *
 * O checkout pergunta assim que a pessoa termina de digitar o WhatsApp, para
 * abrir o campo do PIN sozinho. Antes o campo ficava atrás de um link discreto
 * e passava despercebido: o funcionário pedia, não via desconto nenhum e
 * concluía que o benefício não funcionava.
 *
 * Responde só sim ou não, sobre um número que quem pergunta já digitou, e sem
 * o PIN isso não vale desconto. Ainda assim é o endereço que confirma quem
 * trabalha na loja, então o teto por origem é mais apertado que o do resto:
 * uma pessoa digita o próprio telefone uma vez, um script tentaria a lista toda.
 */
export const employeePhoneHasBenefitFn = createServerFn({ method: "POST" })
  .validator(z.object({ storeSlug: z.string().min(1), phone: z.string().min(10) }))
  .handler(async ({ data }) => {
    if (!permitido("telefone-funcionario", { max: 12, janelaMs: 60_000 })) {
      // Silêncio em vez de erro: isto é um enfeite de conveniência, e barrar o
      // checkout de um cliente comum por causa dele seria pior que não ter.
      return { funcionario: false as const };
    }

    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) return { funcionario: false as const };

    /*
      Sem o módulo, este telefone não tem benefício nesta loja — e a
      resposta é exatamente essa, sem rodeio nem vazamento de plano.
    */
    if (recursoNoEstado(estadoComercialDaLoja(store), "BENEFICIOS") === "BLOQUEADO") {
      return { funcionario: false as const };
    }

    const funcionario = await employeeHasBenefit(store.id, data.phone.replace(/\D/g, ""));
    return { funcionario };
  });
