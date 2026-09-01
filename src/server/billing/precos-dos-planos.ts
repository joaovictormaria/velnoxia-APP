import type Stripe from "stripe";
import { ROTULO_DO_PLANO } from "@/lib/planos/catalogo";
import type { Plano } from "@/lib/planos/tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PRICE DO STRIPE ⇄ PLANO — a única tradução entre os dois mundos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Duas direções, e as duas moram aqui:
 *
 *   IDA   `precoDoPlano("BASIC")`   → o Price a cobrar no checkout.
 *   VOLTA `planoDoPreco("price_…")` → o plano que o webhook deve gravar.
 *
 * ─── NENHUM PRICE ID NO CÓDIGO ─────────────────────────────────────────────
 *
 * Não há `if (price === "price_…")` aqui nem em lugar nenhum. Os identificadores
 * vivem em variável de ambiente, e este arquivo é o único que as lê. Trocar de
 * Price é mexer no ambiente, não no repositório — e um Price nunca vaza para
 * log, mensagem de erro ou resposta HTTP.
 *
 * ─── O PRICE ANTIGO, DE R$ 300, NÃO É NENHUM DOS DOIS ──────────────────────
 *
 * Os dois Prices reais foram criados em 31/08/2026, e a partir daí o Premium
 * é o Price de R$ 360 — não o antigo. O antigo continua vivo no Stripe,
 * cobrando quem já assina, e este arquivo não o conhece:
 *
 * NÃO COBRA. `precoDoPlano("PREMIUM")` devolve o Price de R$ 360 ou lança.
 * Não há reserva. Um deploy sem a variável recusa a venda em vez de cobrar
 * R$ 300 chamando aquilo de Premium — o silêncio seria pior que a recusa.
 *
 * NÃO CLASSIFICA. Uma assinatura no Price antigo chega ao webhook como Price
 * desconhecido: `Store.plan` fica como está. Dizer que ele "é Premium"
 * classificaria comercialmente todas as lojas que já assinam, na próxima
 * renovação, sem ninguém ter decidido — a classificação de loja legada, que é
 * outra fase. O que essas lojas perdem não é acesso nenhum: `paidUntil`,
 * `status` e os ids continuam sendo gravados normalmente, e `plan = null`
 * segue liberando tudo pela regra transitória de sempre.
 */

/** A variável de ambiente que guarda o Price de cada plano. */
export const VARIAVEL_DO_PLANO: Readonly<Record<Plano, string>> = {
  BASIC: "STRIPE_PRICE_ID_BASIC",
  PREMIUM: "STRIPE_PRICE_ID_PREMIUM",
};

/**
 * Lido a cada chamada, e não no import.
 *
 * Em desenvolvimento o painel roda sem cobrança nenhuma, e congelar o valor na
 * carga do módulo faria o servidor precisar reiniciar para enxergar uma
 * variável nova — além de quebrar todo teste que troque o ambiente.
 */
function env(nome: string): string | null {
  return process.env[nome]?.trim() || null;
}

/** O plano ainda não tem Price configurado. Não expõe o valor de nada. */
export class PrecoNaoConfiguradoError extends Error {
  constructor(readonly plano: Plano) {
    super(`O plano ${ROTULO_DO_PLANO[plano]} ainda não tem preço configurado.`);
    this.name = "PrecoNaoConfiguradoError";
  }
}

/**
 * O Price que o checkout deve cobrar por este plano.
 *
 * SEM RESERVA, para nenhum dos dois. Cada plano tem o Price dele ou não é
 * vendido. Cair no Price antigo por falta de variável cobraria R$ 300 de
 * alguém que escolheu o Premium de R$ 360 — e o erro só apareceria na fatura.
 */
export function precoDoPlano(plano: Plano): string {
  const proprio = env(VARIAVEL_DO_PLANO[plano]);
  if (proprio) return proprio;
  throw new PrecoNaoConfiguradoError(plano);
}

/** Dá para vender este plano hoje? */
export function planoVendavel(plano: Plano): boolean {
  try {
    precoDoPlano(plano);
    return true;
  } catch {
    return false;
  }
}

/**
 * O plano que este Price representa — ou `null` quando ele não é nenhum dos
 * dois.
 *
 * ⚠️ `null` NÃO É "BASIC POR PADRÃO" e não é "PREMIUM por padrão". É "não sei",
 * e quem chama tem de tratar como não sei: a coluna `Store.plan` não é tocada.
 * Chutar aqui rebaixaria ou promoveria uma loja pagante por causa de uma
 * variável de ambiente esquecida num deploy.
 *
 * Só as duas variáveis novas traduzem. O `STRIPE_PRICE_ID` antigo, de
 * propósito, não — ver o cabeçalho.
 */
export function planoDoPreco(priceId: string | null | undefined): Plano | null {
  const procurado = priceId?.trim();
  if (!procurado) return null;

  for (const plano of ["BASIC", "PREMIUM"] as const) {
    if (env(VARIAVEL_DO_PLANO[plano]) === procurado) return plano;
  }
  return null;
}

/**
 * O Price da assinatura que o Stripe mandou.
 *
 * Um item só: a assinatura da Velnox é sempre um plano, nunca uma cesta. Se um
 * dia houver adicional cobrado à parte, é aqui que a escolha de qual item
 * define o plano precisa ser feita — e não espalhada por quem consome.
 */
export function priceIdDaAssinatura(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

/** O plano de uma assinatura do Stripe, direto. `null` = Price desconhecido. */
export function planoDaAssinatura(sub: Stripe.Subscription): Plano | null {
  return planoDoPreco(priceIdDaAssinatura(sub));
}

/** Quais planos já têm Price PRÓPRIO — para diagnóstico, não para decidir. */
export function planosComPrecoProprio(): Readonly<Record<Plano, boolean>> {
  return {
    BASIC: Boolean(env(VARIAVEL_DO_PLANO.BASIC)),
    PREMIUM: Boolean(env(VARIAVEL_DO_PLANO.PREMIUM)),
  };
}
