import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAdmin } from "../auth/session";
import { cobrancaConfigurada } from "../billing/stripe";
import { planoVendavel } from "../billing/precos-dos-planos";
import {
  criarCheckout,
  criarPortal,
  resumoDaAssinatura,
} from "../billing/subscription-service";

/**
 * Assinatura.
 *
 * Estas funções não passam por requireAdminSession de propósito: aquela porta
 * recusa loja bloqueada, e é exatamente a loja bloqueada que precisa chegar
 * até aqui para pagar. A checagem é só de identidade e de papel.
 *
 * Só o dono assina. Um gerente administra o cardápio; colocar o cartão da
 * empresa e cancelar a conta não é trabalho dele.
 */
async function exigirDono() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  if (admin.role !== "OWNER") throw new Error("SOMENTE_O_DONO");
  return admin;
}

export const getAssinaturaFn = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await exigirDono();
  const resumo = await resumoDaAssinatura(admin.storeId);
  return {
    ...resumo,
    configurado: cobrancaConfigurada(),
    acesso: admin.store.acesso,
    /*
     * O ESTADO COMERCIAL, PARA A TELA DIZER "PLANO ATUAL".
     *
     * Vem da sessão, que já o calculou — nenhuma consulta a mais. E vem
     * inteiro (`armazenado`, `emTrial`, `efetivo`, `legado`) porque a tela
     * precisa distinguir três coisas que um campo só confundiria: o que a
     * loja CONTRATOU, o que ela USA agora e a loja que ainda não foi
     * classificada. `armazenado: null` é "plano não definido", e a tela diz
     * exatamente isso em vez de inventar um.
     */
    plano: admin.store.plano,
    /*
     * Quais planos dá para vender hoje. Sem isto, um Price faltando no
     * ambiente viraria um botão que abre e falha; com isto, ele nem convida.
     */
    vendaveis: {
      BASIC: planoVendavel("BASIC"),
      PREMIUM: planoVendavel("PREMIUM"),
    },
  };
});

/**
 * Abre o checkout DO PLANO ESCOLHIDO.
 *
 * O plano é obrigatório no validador, e de propósito: a tela tem dois botões,
 * e depender do padrão de `criarCheckout` faria o botão do Básico cobrar
 * Premium no dia em que alguém mexesse no padrão. Aqui não há padrão — quem
 * clica diz o que quer.
 */
export const iniciarAssinaturaFn = createServerFn({ method: "POST" })
  .validator(z.object({ plano: z.enum(["BASIC", "PREMIUM"]) }))
  .handler(async ({ data }) => {
    const admin = await exigirDono();

    if (!planoVendavel(data.plano)) {
      return { ok: false as const, error: "Este plano ainda não está disponível para contratação." };
    }

    try {
      return { ok: true as const, url: await criarCheckout(admin.storeId, data.plano) };
    } catch (erro) {
      /*
       * O erro do Stripe fica no log do servidor, nunca na resposta: ele traz
       * Price, id de cliente e às vezes trecho da requisição.
       */
      console.error("[stripe] falha ao abrir o checkout:", erro);
      return { ok: false as const, error: "Não foi possível abrir o pagamento. Tente de novo." };
    }
  });

export const abrirPortalFn = createServerFn({ method: "POST" }).handler(async () => {
  const admin = await exigirDono();
  try {
    return { ok: true as const, url: await criarPortal(admin.storeId) };
  } catch (erro) {
    console.error("[stripe] falha ao abrir o portal:", erro);
    return { ok: false as const, error: "Não foi possível abrir a gestão da assinatura." };
  }
});
