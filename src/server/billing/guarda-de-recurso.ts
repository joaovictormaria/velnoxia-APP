import { ROTULO_DO_RECURSO } from "@/lib/planos/catalogo";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import type { Recurso } from "@/lib/planos/tipos";
import { requireAdminSession, type CurrentAdmin } from "../auth/session";

/**
 * A PORTA QUE UM RECURSO PREMIUM ATRAVESSA — e o único lugar que decide.
 *
 * Esconder o botão não é segurança: a server function é um endpoint HTTP, e
 * uma conta BASIC que a chame direto tem de ser recusada pelo servidor. É o
 * que este arquivo faz, e é por isso que ele vem ANTES de qualquer mudança de
 * menu ou de tela.
 *
 * ─── POR QUE NÃO HÁ COMPARAÇÃO DE PLANO AQUI ───────────────────────────────
 *
 * Nenhuma linha deste projeto escreve `if (plano === "PREMIUM")`. A pergunta é
 * feita a `recursoNoEstado()`, a mesma função pura que a Fase 3 testou, sobre
 * o estado comercial que a sessão JÁ carrega. Consequências:
 *
 *   · não há ida ao banco  — `CurrentAdmin.store.plano` veio junto da sessão
 *   · não há ida ao Stripe — o plano está no banco, não na assinatura
 *   · mover um recurso de plano é editar `catalogo.ts`, e nada mais
 *
 * ─── DUAS PORTAS, E A DIFERENÇA IMPORTA ────────────────────────────────────
 *
 *   requireAdminSession()  → a conta pode ENTRAR? (trial vencido, suspensa…)
 *   exigirRecurso()        → e este cômodo faz parte do que ela contratou?
 *
 * A primeira continua intocada e continua rodando primeiro: quem está com a
 * assinatura vencida é recusado antes de o plano sequer ser consultado.
 */

/**
 * O plano da loja não inclui este recurso.
 *
 * Erro de domínio, no molde de `StoreInactiveError`: a tela lê `message` por
 * `mensagemDoErro()` e mostra a frase pronta, em vez do erro cru do Prisma ou
 * de um 500 sem explicação. `recurso` e `rotulo` viajam em campos próprios
 * para a Fase 7 poder montar o convite específico — "Estoque está disponível
 * no plano Premium" — sem interpretar texto.
 */
export class RecursoIndisponivelError extends Error {
  readonly rotulo: string;

  constructor(public readonly recurso: Recurso) {
    super("Este recurso está disponível no plano Premium.");
    this.name = "RecursoIndisponivelError";
    this.rotulo = ROTULO_DO_RECURSO[recurso];
  }
}

/**
 * Recusa a chamada se o plano não inclui o recurso.
 *
 * Separada de `exigirRecurso` para quem já tem a sessão em mãos e não quer
 * relê-la — e para os testes, que exercitam a regra sem montar cookie.
 *
 * ⚠️ O `switch` é EXAUSTIVO de propósito. Escrever
 * `if (veredito !== "PERMITIDO") throw` transformaria `INDEFINIDO` em recusa
 * silenciosa, que é rebaixar a loja legada para BASIC — a classificação
 * automática que se decidiu não fazer. Os três casos são nomeados, e o
 * compilador cobra qualquer valor novo que a união venha a ganhar.
 */
export function garantirRecurso(admin: CurrentAdmin, recurso: Recurso): void {
  const veredito = recursoNoEstado(admin.store.plano, recurso);

  switch (veredito) {
    case "PERMITIDO":
      return;

    /*
     * ⚠️ PERMISSÃO TRANSITÓRIA — REMOVER NA FASE 12.
     *
     * `INDEFINIDO` é a loja legada: `Store.plan = null` e fora do teste. Ela
     * usa o sistema inteiro hoje, e recusá-la aqui mudaria o acesso de uma
     * conta existente — precisamente o que foi proibido desde a Fase 2.
     *
     * ISTO NÃO É "legada = PREMIUM". Nada é gravado, `Store.plan` continua
     * nulo e o estado comercial continua respondendo `INDEFINIDO` a quem
     * perguntar. É só o enforcement escolhendo não recusar enquanto a
     * classificação dessas contas não for tomada por uma pessoa.
     *
     * Quando a Fase 12 classificar as lojas legadas, este `case` deixa de ter
     * loja para atender e deve cair junto com o valor `INDEFINIDO`.
     */
    case "INDEFINIDO":
      return;

    case "BLOQUEADO":
      throw new RecursoIndisponivelError(recurso);
  }
}

/**
 * A sessão do painel, já conferida contra o plano.
 *
 * Substitui `requireAdminSession()` nas funções de um módulo pago: onde antes
 * se lia `const admin = await requireAdminSession()`, passa a se ler
 * `const admin = await exigirRecurso("ESTOQUE")`. Uma linha por função, sem
 * `if` de plano em lugar nenhum.
 *
 * Devolve o mesmo `CurrentAdmin` de sempre — nada do que já existia muda de
 * forma, e as funções seguem usando `admin.storeId` como usavam.
 */
export async function exigirRecurso(recurso: Recurso): Promise<CurrentAdmin> {
  const admin = await requireAdminSession();
  garantirRecurso(admin, recurso);
  return admin;
}
