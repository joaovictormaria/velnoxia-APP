import { RECURSOS_DO_PLANO } from "./catalogo";
import type { EstadoDoPlano, Plano, Recurso } from "./tipos";

/**
 * A REGRA DE "ESTE PLANO INCLUI ESTE RECURSO", EM UM LUGAR SÓ.
 *
 * Função pura: entra o estado do plano, sai um booleano. Sem Prisma, sem
 * React, sem rede e sem relógio — pelo mesmo motivo de `statusDoEstoque()` e
 * de `conferirAcesso()`: as duas pontas precisam da MESMA resposta. O servidor
 * decide se recusa a chamada; a tela decide se desenha o cadeado. Enquanto a
 * regra morasse dentro de cada consumidor, seriam duas regras.
 *
 * ─── O QUE ESTE MÓDULO NÃO FAZ ─────────────────────────────────────────────
 *
 * Ele NÃO diz se a conta pode entrar. Trial vencido, assinatura vencida,
 * tolerância do cartão e suspensão continuam sendo assunto de
 * `conferirAcesso()` em `src/server/billing/access.ts`, que já existe, já é
 * consultado por `requireUsableSession()` e não foi tocado.
 *
 * São duas perguntas, e responder as duas no mesmo lugar foi o defeito do
 * `EntitlementsService` antigo: ele devolvia "plano TRIAL" para uma conta
 * SUSPENDED, misturando bloqueio com plano de um jeito que não serve para
 * nenhuma das duas. A Fase 2 junta os dois vereditos numa fachada; aqui eles
 * ficam separados de propósito.
 *
 * ─── ESTA É A FASE 1 ───────────────────────────────────────────────────────
 *
 * Ninguém consulta estas funções ainda. Nenhuma rota, nenhuma server function
 * e nenhuma tela mudaram de comportamento. O contrato existe e está testado;
 * ligá-lo é o trabalho das fases seguintes.
 */

/**
 * O plano que VALE agora, considerando o teste.
 *
 * ═══ A REGRA COMERCIAL DEFINITIVA, E ELA MORA AQUI ═════════════════════════
 *
 *   TRIAL = 14 dias com 100% dos recursos do PREMIUM.
 *
 * Uma linha, um lugar. Não existe conjunto de recursos do trial, não existe
 * matriz do trial e não existe terceiro plano: em teste, a loja passa a usar
 * o MESMO `Set` do PREMIUM que um assinante Premium usa. Acrescentar um
 * recurso ao Premium amanhã libera-o para quem está em teste hoje, sem que
 * ninguém precise lembrar de nada.
 *
 * ═══ E O QUE ACONTECE QUANDO O TESTE ACABA ═════════════════════════════════
 *
 * `emTrial` vira falso e o plano contratado volta a valer — seja ele qual for.
 * Este módulo NÃO escolhe BASIC nem PREMIUM na saída do teste: quem escolhe é
 * a assinatura que a loja fizer, e a decisão comercial foi explícita quanto a
 * isso. Aqui só se lê o que já está decidido.
 *
 * O trial não é "melhor" que o plano: é `emTrial ? PREMIUM : plano`, e não um
 * máximo entre os dois. Se um dia existir plano acima do Premium, uma loja
 * nele não deve ser REBAIXADA por estar em teste — mas esse plano não existe,
 * e inventar a defesa agora seria proteger contra um caso imaginário. Quando
 * existir, é esta linha que muda.
 */
export function planoEfetivo(estado: EstadoDoPlano): Plano {
  return estado.emTrial ? "PREMIUM" : estado.plano;
}

/**
 * O plano deste estado inclui este recurso?
 *
 * É a função que as guardas de rota e de server function vão chamar. Ela não
 * conhece rota, não conhece HTTP e não lança — devolve um booleano, e quem
 * chama decide o que fazer com ele: o servidor recusa, a tela mostra o convite
 * para conhecer o Premium.
 */
export function temRecurso(estado: EstadoDoPlano, recurso: Recurso): boolean {
  return RECURSOS_DO_PLANO[planoEfetivo(estado)].has(recurso);
}

/**
 * Todos os recursos liberados por este estado.
 *
 * Existe para a sidebar e para a tela de planos, que precisam decidir uma vez
 * o que desenhar em vez de chamar `temRecurso` por item numa lista. Devolve
 * uma cópia: quem recebe não pode alterar a matriz por engano.
 */
export function recursosLiberados(estado: EstadoDoPlano): Set<Recurso> {
  return new Set(RECURSOS_DO_PLANO[planoEfetivo(estado)]);
}

/**
 * Este recurso é o que separa os planos?
 *
 * Serve à tela: um recurso essencial nunca ganha cadeado nem convite de
 * upgrade, porque não há upgrade que o acrescente. Pergunta sobre o CATÁLOGO,
 * não sobre uma loja — por isso não recebe estado.
 */
export function exigePremium(recurso: Recurso): boolean {
  return !RECURSOS_DO_PLANO.BASIC.has(recurso);
}
