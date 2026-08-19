import Stripe from "stripe";

/**
 * O Stripe, criado só quando alguém precisa dele.
 *
 * Nem toda instalação tem chave: em desenvolvimento o painel roda sem cobrança
 * nenhuma, e derrubar o servidor na importação por falta de STRIPE_SECRET_KEY
 * impediria de mexer no cardápio. Quem chama trata a ausência.
 */
let cliente: Stripe | null = null;

export function stripe(): Stripe {
  if (!cliente) {
    const chave = process.env.STRIPE_SECRET_KEY?.trim();
    if (!chave) throw new Error("STRIPE_SECRET_KEY não está configurada.");
    cliente = new Stripe(chave);
  }
  return cliente;
}

/** Se dá para cobrar. Falso em desenvolvimento sem chave, e a tela avisa. */
export function cobrancaConfigurada(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());
}

export function precoDaAssinatura(): string {
  const preco = process.env.STRIPE_PRICE_ID?.trim();
  if (!preco) throw new Error("STRIPE_PRICE_ID não está configurada.");
  return preco;
}

export function segredoDoWebhook(): string {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!segredo) throw new Error("STRIPE_WEBHOOK_SECRET não está configurada.");
  return segredo;
}
