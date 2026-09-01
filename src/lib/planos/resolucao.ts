import { TODOS_OS_RECURSOS } from "./catalogo";
import { temRecurso } from "./entitlements";
import type { Plano, Recurso } from "./tipos";

/**
 * DE "O QUE ESTÁ GRAVADO" PARA "O QUE VALE AGORA".
 *
 * A Fase 1 respondeu "este plano inclui este recurso?" partindo de um plano já
 * conhecido. Faltava a pergunta anterior: qual é o plano, dado o que o banco
 * guarda e o momento em que a loja está. É o que este arquivo responde.
 *
 * Função pura, como todo o resto do módulo: sem Prisma, sem React, sem relógio.
 * Quem lê o banco e olha as horas é `estadoComercialDaLoja()`, em
 * `src/server/billing/plano-da-loja.ts` — aqui só mora a regra, para que ela
 * possa ser exercitada em ponto no tempo.
 *
 * ─── TRÊS COISAS DIFERENTES, E O ARQUIVO EXISTE PARA NÃO CONFUNDI-LAS ──────
 *
 *   armazenado → o que a loja contratou. Pode ser nulo.
 *   emTrial    → ela está dentro dos 14 dias AGORA?
 *   efetivo    → o que vale neste instante, considerando o teste.
 *
 * E uma quarta, que não mora aqui: se a conta pode entrar. Isso é
 * `conferirAcesso()`, em `src/server/billing/access.ts`, intocado. Uma loja com
 * assinatura vencida continua tendo plano PREMIUM armazenado — ela só não
 * consegue entrar. Plano e acesso são eixos independentes, e misturá-los foi o
 * defeito do `EntitlementsService` antigo, que devolvia "plano TRIAL" para uma
 * conta SUSPENDED.
 */

/**
 * O plano gravado na loja. `null` é um estado real, não um valor faltando.
 *
 * Nulo significa "plano ainda não definido": a loja legada, criada antes de
 * existirem planos, e também a loja nova que ainda não assinou nada. Nunca
 * significa BASIC e nunca significa PREMIUM.
 */
export type PlanoArmazenado = Plano | null;

/**
 * O que uma loja pode fazer com um recurso — TRÊS respostas, não duas.
 *
 * ═══ POR QUE `INDEFINIDO` EXISTE ═══════════════════════════════════════════
 *
 * Uma loja legada tem `plan = null` e não está em teste. Perguntar "ela pode
 * usar Estoque?" não tem resposta honesta em booleano:
 *
 *   `false` a rebaixaria para BASIC — e ela usa o sistema inteiro hoje.
 *   `true`  a promoveria a PREMIUM — entregando de graça o que se vende.
 *
 * As duas são classificações comerciais, e classificar essas contas é decisão
 * de uma fase posterior, tomada por uma pessoa. Um booleano obrigaria este
 * código a escolher uma delas em silêncio; o terceiro valor obriga quem chama
 * a decidir explicitamente o que fazer, e torna impossível esquecer o caso.
 */
export type VereditoDeRecurso = "PERMITIDO" | "BLOQUEADO" | "INDEFINIDO";

export type EstadoComercial = {
  /** O plano contratado, como está no banco. */
  armazenado: PlanoArmazenado;
  /** Dentro dos 14 dias de teste NESTE instante. */
  emTrial: boolean;
  /**
   * O plano que vale agora.
   *
   * `null` acontece num caso só: loja legada (sem plano) e fora do teste. Não
   * é "nenhum recurso" — é "ainda não se sabe", e quem consome trata como tal.
   */
  efetivo: Plano | null;
  /** Atalho legível para `efetivo === null`. Loja sem plano e sem teste. */
  legado: boolean;
};

/**
 * O plano que vale agora.
 *
 * ═══ A REGRA COMERCIAL DEFINITIVA ══════════════════════════════════════════
 *
 *   TRIAL ATIVO → PREMIUM, sempre. Inclusive com `armazenado = null`.
 *
 * O `null` em teste é o caso COMUM, não a exceção: toda loja nova nasce assim
 * — `status = TRIAL`, `plan = null` — porque ela ainda não contratou nada.
 * Fosse o nulo tratado antes do teste, toda loja recém-criada abriria o painel
 * sem recurso nenhum, que é o oposto do que os 14 dias existem para fazer.
 *
 * Por isso `emTrial` é conferido PRIMEIRO. A ordem das duas linhas abaixo é a
 * regra comercial inteira.
 *
 * Acabado o teste, volta a valer o que está gravado — seja BASIC, PREMIUM ou
 * nada. Esta função não escolhe plano para ninguém na saída do teste; quem
 * escolhe é a assinatura que a loja fizer.
 */
export function resolverPlano(
  armazenado: PlanoArmazenado,
  emTrial: boolean,
): EstadoComercial {
  const efetivo: Plano | null = emTrial ? "PREMIUM" : armazenado;
  return {
    armazenado,
    emTrial,
    efetivo,
    legado: efetivo === null,
  };
}

/**
 * Este estado libera este recurso?
 *
 * Devolve `INDEFINIDO` para a loja legada em vez de chutar — ver
 * `VereditoDeRecurso` acima. Para os demais casos delega a `temRecurso()`, da
 * Fase 1: a matriz continua tendo um dono só.
 */
export function recursoNoEstado(
  estado: EstadoComercial,
  recurso: Recurso,
): VereditoDeRecurso {
  if (estado.efetivo === null) return "INDEFINIDO";
  return temRecurso({ plano: estado.efetivo, emTrial: false }, recurso)
    ? "PERMITIDO"
    : "BLOQUEADO";
}

/**
 * O veredito de TODOS os recursos, de uma vez.
 *
 * Existe para quem precisa da tabela inteira e não de um item: a barra lateral
 * decide o cadeado de vinte entradas a cada render, e a tela de planos desenha
 * as vinte linhas de uma tacada. Vinte chamadas a `recursoNoEstado` dariam a
 * mesma resposta — este atalho é para que o consumidor não seja tentado a
 * inventar o próprio laço, com a própria interpretação do `INDEFINIDO`.
 *
 * Percorre `TODOS_OS_RECURSOS`, que é a lista do catálogo. Um recurso novo
 * aparece aqui sozinho; nenhuma lista paralela precisa ser lembrada.
 */
export function vereditosDoEstado(
  estado: EstadoComercial,
): Record<Recurso, VereditoDeRecurso> {
  const saida = {} as Record<Recurso, VereditoDeRecurso>;
  for (const recurso of TODOS_OS_RECURSOS) {
    saida[recurso] = recursoNoEstado(estado, recurso);
  }
  return saida;
}
