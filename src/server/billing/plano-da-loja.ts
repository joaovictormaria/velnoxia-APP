import type { PlanoDaLoja } from "@prisma/client";
import {
  recursoNoEstado,
  resolverPlano,
  type EstadoComercial,
  type PlanoArmazenado,
  type VereditoDeRecurso,
} from "@/lib/planos/resolucao";
import type { Plano, Recurso } from "@/lib/planos/tipos";
import { conferirAcesso, type EstadoDaConta } from "./access";

/**
 * O PLANO COMERCIAL DE UMA LOJA, LIDO DO QUE O BANCO GUARDA.
 *
 * Mora ao lado de `access.ts` de propósito: são as duas metades da mesma
 * pergunta comercial, e separá-las em pastas distintas convidaria a que uma
 * evoluísse sem a outra. O que NÃO acontece é fusão — continuam sendo duas
 * funções, com duas responsabilidades:
 *
 *   conferirAcesso()        → a conta pode entrar?
 *   estadoComercialDaLoja() → qual plano vale para ela agora?
 *
 * Uma loja com assinatura vencida tem plano PREMIUM e não consegue entrar. Uma
 * loja em teste consegue entrar e tem plano efetivo PREMIUM sem ter contratado
 * nada. Os dois eixos são independentes, e é por isso que a segunda função
 * CONSOME a primeira em vez de reimplementá-la.
 */

/**
 * O espelho entre o enum do banco e o tipo puro, conferido pelo COMPILADOR.
 *
 * `src/lib/planos/tipos.ts` declara `Plano` sem importar o Prisma — é o que
 * mantém a regra pura, testável em `node` e utilizável no navegador. O preço
 * dessa independência seria dois lugares podendo divergir em silêncio; estas
 * duas linhas cobram esse preço em tempo de compilação.
 *
 * Acrescentar `ENTERPRISE` ao enum do schema sem acrescentá-lo a `Plano` — ou
 * o contrário — quebra o build aqui, com o nome do valor que faltou. É a mesma
 * técnica que `novidades/tipos.ts` usa para o papel do admin.
 */
type ConfereQueOBancoCabeNoTipo = Plano extends PlanoDaLoja ? true : never;
type ConfereQueOTipoCabeNoBanco = PlanoDaLoja extends Plano ? true : never;
const _espelho: [ConfereQueOBancoCabeNoTipo, ConfereQueOTipoCabeNoBanco] = [true, true];
void _espelho;

/**
 * O que esta função precisa saber da loja.
 *
 * É `EstadoDaConta` — o mesmo formato que `conferirAcesso()` já pede — mais a
 * coluna do plano. Reusar o tipo existente garante que quem já monta um
 * `select` para o acesso só precise acrescentar um campo, e que os dois nunca
 * peçam recortes diferentes da mesma tabela.
 */
export type LojaParaPlano = EstadoDaConta & {
  /** `Store.plan`. Nulo = loja legada, plano ainda não definido. */
  plan: PlanoArmazenado;
};

/**
 * O estado comercial da loja neste instante.
 *
 * ═══ DE ONDE SAI O `emTrial` ═══════════════════════════════════════════════
 *
 * Do próprio `conferirAcesso()`, e não de uma segunda comparação de datas.
 *
 * Aquela função já decide se o teste está valendo — ela devolve
 * `motivo: "trial"` exatamente quando a conta está em TRIAL e `trialEndsAt`
 * ainda não passou. Reler `trialEndsAt` aqui criaria um SEGUNDO calendário: no
 * dia em que a regra de expiração mudasse num lugar e não no outro, a loja
 * perderia acesso enquanto o painel ainda a mostrasse em teste, ou o contrário.
 *
 * Um teste vencido não devolve `motivo: "trial"` — devolve
 * `{ liberado: false, motivo: "trial-vencido" }` —, então `emTrial` cai
 * sozinho para falso, sem nenhuma data sendo comparada aqui. Os 14 dias
 * continuam definidos em um lugar só, `TRIAL_DAYS` em `signup-service.ts`.
 *
 * `agora` é parâmetro pelo mesmo motivo de `conferirAcesso`: uma função que
 * lesse o relógio por dentro seria impossível de testar em ponto no tempo.
 */
export function estadoComercialDaLoja(
  loja: LojaParaPlano,
  agora = new Date(),
): EstadoComercial {
  const acesso = conferirAcesso(loja, agora);
  const emTrial = acesso.liberado && acesso.motivo === "trial";
  return resolverPlano(loja.plan, emTrial);
}

/**
 * ESTA LOJA PODE USAR ESTE RECURSO? — a porta única da camada.
 *
 * É o que as guardas de server function e de rota vão chamar, e existe para
 * que nenhuma delas precise compor `estadoComercialDaLoja` com
 * `recursoNoEstado` por conta própria. Composição repetida em vinte lugares é
 * como uma regra vira vinte regras: basta um deles esquecer o teste, ou tratar
 * o `INDEFINIDO` de um jeito diferente do vizinho.
 *
 * ⚠️ TRÊS RESPOSTAS, E NENHUMA DELAS É BOOLEANA. Quem chama NÃO deve escrever
 * `if (recursoDaLoja(...) === "PERMITIDO")`, porque isso transforma
 * `INDEFINIDO` em recusa silenciosa — e recusar a loja legada é rebaixá-la
 * para BASIC, exatamente a classificação automática que se decidiu não fazer.
 * O `switch` sobre os três valores é obrigatório, e o compilador ajuda quem o
 * escrever exaustivamente.
 *
 * Quem já tem a sessão em mãos não precisa desta função: `CurrentAdmin` já
 * carrega `store.plano`, e o caminho é `recursoNoEstado(admin.store.plano, …)`
 * — sem ida ao banco. Esta aqui serve a quem tem o registro da loja e não a
 * sessão, como um webhook ou uma rotina administrativa.
 *
 * NADA CHAMA ISTO AINDA. A camada existe, está testada, e não governa recurso
 * nenhum — ligá-la é o trabalho das Fases 5 e 6.
 */
export function recursoDaLoja(
  loja: LojaParaPlano,
  recurso: Recurso,
  agora = new Date(),
): VereditoDeRecurso {
  return recursoNoEstado(estadoComercialDaLoja(loja, agora), recurso);
}
