import type Stripe from "stripe";
import { prisma } from "../db/client";
import { baseUrlDoApp } from "../mail/resend";
import type { Plano } from "@/lib/planos/tipos";
import { planoDaAssinatura, precoDoPlano } from "./precos-dos-planos";
import { stripe } from "./stripe";

/**
 * A assinatura mensal da loja.
 *
 * Duas regras sustentam tudo aqui:
 *
 * O Stripe é a fonte da verdade sobre o pagamento; o banco só guarda uma cópia
 * do que ele disse. Nada nesta casa marca uma loja como paga por conta própria
 * — quem paga é o webhook, depois de conferir a assinatura do evento.
 *
 * E toda escrita é idempotente. O Stripe reenvia eventos quando não recebe um
 * 200, e a mesma assinatura pode chegar três vezes; como aqui só se grava o
 * estado final, chegar de novo não faz diferença.
 */

/** A data até quando está pago, onde quer que a versão da API a coloque. */
function fimDoPeriodo(sub: Stripe.Subscription): Date | null {
  const raiz = (sub as unknown as { current_period_end?: number }).current_period_end;
  // Nas versões novas da API o período vive no item, não na assinatura.
  const doItem = sub.items?.data?.[0]?.current_period_end;
  const epoch = raiz ?? doItem;
  return typeof epoch === "number" ? new Date(epoch * 1000) : null;
}

/** Estados em que o Stripe considera a assinatura viva. */
const VIVAS = new Set(["active", "trialing", "past_due"]);

/**
 * Em que pé está a assinatura DESTA loja, segundo o Stripe.
 *
 * ─── POR QUE PERGUNTAR AO STRIPE, E NÃO SÓ AO BANCO ────────────────────────
 *
 * O banco guarda uma CÓPIA do que o Stripe disse por último, e ela envelhece:
 * uma assinatura cancelada pelo Portal e cujo webhook se perdeu continuaria
 * gravada aqui. Recusar uma contratação nova por causa de uma assinatura que
 * não existe mais seria prender o cliente do lado de fora do próprio
 * pagamento. Quem manda sobre o estado do pagamento é o Stripe.
 *
 * ─── OS QUATRO ESTADOS, E POR QUE NÃO É UM BOOLEANO ────────────────────────
 *
 *   SEM_ASSINATURA → a loja nunca assinou. Pode contratar.
 *   ENCERRADA      → assinou e acabou (cancelada, incompleta, ou apagada do
 *                    Stripe). Pode contratar de novo.
 *   VIVA           → está pagando agora. NÃO pode abrir um segundo checkout.
 *   INDETERMINADO  → o Stripe não respondeu. Não se sabe.
 *
 * `INDETERMINADO` existe para não virar "pode contratar" por omissão. Um
 * booleano obrigaria a escolher um dos dois lados na hora de uma falha de
 * rede, e o lado errado custa caro: duas assinaturas cobrando a mesma loja,
 * com a segunda sobrescrevendo o ponteiro da primeira — que continua cobrando
 * no Stripe enquanto o sistema esquece que ela existe. Diante da dúvida,
 * recusar custa uma tentativa; permitir custa dinheiro do cliente.
 *
 * `incomplete` NÃO é viva, e é deliberado: é o checkout cujo cartão falhou.
 * Tratá-la como viva prenderia a pessoa num pagamento que nunca completou.
 */
export type EstadoDaAssinatura =
  | "SEM_ASSINATURA"
  | "ENCERRADA"
  | "VIVA"
  | "INDETERMINADO";

export async function estadoDaAssinaturaNoStripe(
  storeId: string,
): Promise<EstadoDaAssinatura> {
  const loja = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { stripeSubscriptionId: true },
  });

  if (!loja.stripeSubscriptionId) return "SEM_ASSINATURA";

  try {
    const sub = await stripe().subscriptions.retrieve(loja.stripeSubscriptionId);
    return VIVAS.has(sub.status) ? "VIVA" : "ENCERRADA";
  } catch (erro) {
    /*
     * `resource_missing` é resposta, e não falha: a assinatura foi apagada do
     * Stripe e a cópia do banco ficou para trás. Só isso libera contratar.
     * Qualquer outro erro — rede, chave, indisponibilidade — é "não sei".
     */
    const codigo = (erro as { code?: string })?.code;
    if (codigo === "resource_missing") return "ENCERRADA";

    console.error("[stripe] falha ao conferir a assinatura da loja:", codigo ?? erro);
    return "INDETERMINADO";
  }
}

/**
 * Reusa o cliente do Stripe da loja, ou cria o primeiro.
 *
 * Sem isso, cada tentativa de assinar criaria um cliente novo, e o dono que
 * desistiu no meio e voltou depois viraria dois cadastros com dois cartões.
 */
async function clienteDaLoja(storeId: string): Promise<string> {
  const loja = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      stripeCustomerId: true,
      admins: {
        where: { role: "OWNER", isActive: true },
        select: { email: true, name: true },
        take: 1,
      },
    },
  });
  if (loja.stripeCustomerId) return loja.stripeCustomerId;

  const dono = loja.admins[0];
  const cliente = await stripe().customers.create({
    email: dono?.email,
    name: loja.name,
    // O storeId viaja junto para o webhook nunca depender de e-mail para
    // saber de quem é o pagamento.
    metadata: { storeId: loja.id, slug: loja.slug },
  });

  await prisma.store.update({
    where: { id: storeId },
    data: { stripeCustomerId: cliente.id },
  });
  return cliente.id;
}

/**
 * A tela de pagamento hospedada pelo Stripe. Devolve para onde mandar o dono.
 *
 * O PLANO É PARÂMETRO, e o padrão é PREMIUM — que é exatamente o que a tela de
 * assinatura vende hoje, com o Price de sempre. Nada muda para quem já usa.
 *
 * O dia em que existir uma tela de preços, ela passa `"BASIC"` aqui e o
 * checkout cobra o Price do BASIC. Nenhuma outra peça precisa mudar: quem
 * traduz plano em Price é `precoDoPlano`, e ele já sabe os dois.
 */
export async function criarCheckout(
  storeId: string,
  plano: Plano = "PREMIUM",
): Promise<string> {
  const customer = await clienteDaLoja(storeId);
  const base = baseUrlDoApp();

  const sessao = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: precoDoPlano(plano), quantity: 1 }],
    // Os dois caminhos de volta. O sucesso não libera nada sozinho: quem
    // libera é o webhook. Esta tela só diz que deu certo.
    success_url: `${base}/admin/assinatura?pago=1`,
    cancel_url: `${base}/admin/assinatura?cancelado=1`,
    client_reference_id: storeId,
    subscription_data: { metadata: { storeId } },
    // Deixa o dono guardar a nota fiscal do cartão.
    billing_address_collection: "required",
  });

  if (!sessao.url) throw new Error("O Stripe não devolveu a URL do checkout.");
  return sessao.url;
}

/**
 * O portal do Stripe: trocar cartão, ver faturas, cancelar.
 *
 * Existe para não reimplementar essas três telas — e para o cancelamento
 * passar pelo Stripe, que é quem sabe até quando o dono já pagou.
 */
export async function criarPortal(storeId: string): Promise<string> {
  const loja = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { stripeCustomerId: true },
  });
  if (!loja.stripeCustomerId) throw new Error("Esta loja ainda não tem assinatura.");

  const sessao = await stripe().billingPortal.sessions.create({
    customer: loja.stripeCustomerId,
    return_url: `${baseUrlDoApp()}/admin/assinatura`,
  });
  return sessao.url;
}

/**
 * Grava no banco o que o Stripe disse sobre uma assinatura.
 *
 * A loja é achada pelo metadata, e só depois pelo cliente: o metadata é o que
 * nós mesmos gravamos e não muda, enquanto o cliente poderia, em tese, ter
 * sido remontado à mão no painel do Stripe.
 */
export async function aplicarAssinatura(sub: Stripe.Subscription): Promise<string | null> {
  const porMetadata = sub.metadata?.storeId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  const loja = porMetadata
    ? await prisma.store.findUnique({ where: { id: porMetadata }, select: { id: true } })
    : customerId
      ? await prisma.store.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        })
      : null;

  if (!loja) return null;

  const viva = VIVAS.has(sub.status);
  const ate = fimDoPeriodo(sub);

  /*
   * ═══ O PLANO CONTRATADO ════════════════════════════════════════════════
   *
   * Vem do Price do item da assinatura, traduzido pela fonte central. É a
   * única escrita de `Store.plan` no sistema inteiro.
   *
   * PLANO NÃO É ACESSO, e a distinção é a mesma que sustenta o resto da
   * arquitetura: `paidUntil` e `status` dizem se a loja pode entrar; `plan`
   * diz o que ela contratou. Uma assinatura cancelada continua sabendo qual
   * era o plano — cancelar não apaga o histórico, e não existe regra de
   * rebaixamento aqui.
   *
   * PRICE DESCONHECIDO NÃO CLASSIFICA NADA. `planoDaAssinatura` devolve
   * `null` quando o Price não é nenhum dos dois configurados, e `undefined`
   * no Prisma significa NÃO MEXER NA COLUNA — não é `null`, não é BASIC por
   * padrão e não é rebaixamento. Uma variável de ambiente esquecida num
   * deploy deixa o plano exatamente como estava, em vez de degradar quem
   * paga. O resto do evento (data, status, ids) continua sendo gravado
   * normalmente: o pagamento é fato, e não depende de a tradução ter
   * funcionado.
   */
  const plano = planoDaAssinatura(sub);
  if (plano === null) {
    /*
     * Log sem o Price e sem a chave: o identificador do Price não é segredo
     * criptográfico, mas também não precisa entrar no log de produção para
     * este aviso cumprir a função. O id da assinatura basta para achar o
     * caso no painel do Stripe.
     */
    console.warn(
      `[stripe] assinatura ${sub.id}: Price não corresponde a nenhum plano configurado; ` +
        "Store.plan preservado.",
    );
  }

  await prisma.store.update({
    where: { id: loja.id },
    data: {
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      // Assinatura morta não empurra a data para frente; a que estava vale até
      // o fim, e é ela que decide o corte.
      paidUntil: viva ? (ate ?? undefined) : undefined,
      // O status vira ACTIVE assim que existe assinatura viva — inclusive
      // past_due, porque a tolerância é decidida pela data, não por aqui.
      status: viva ? "ACTIVE" : undefined,
      plan: plano ?? undefined,
    },
  });

  return loja.id;
}

/** Liga cliente e assinatura à loja logo que o checkout termina. */
export async function aplicarCheckout(sessao: Stripe.Checkout.Session): Promise<string | null> {
  const storeId = sessao.client_reference_id;
  const subId =
    typeof sessao.subscription === "string" ? sessao.subscription : sessao.subscription?.id;
  if (!storeId || !subId) return null;

  // Relê a assinatura em vez de confiar no resumo da sessão: é o objeto
  // completo que traz status e fim do período.
  const sub = await stripe().subscriptions.retrieve(subId);
  return aplicarAssinatura(sub);
}

/** O que a tela de assinatura precisa mostrar. */
export async function resumoDaAssinatura(storeId: string) {
  const loja = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: {
      status: true,
      trialEndsAt: true,
      paidUntil: true,
      subscriptionStatus: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
  return { ...loja, temAssinatura: Boolean(loja.stripeSubscriptionId) };
}
