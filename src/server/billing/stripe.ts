import Stripe from "stripe";
import { planoVendavel } from "./precos-dos-planos";

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

/**
 * Se dá para cobrar. Falso em desenvolvimento sem chave, e a tela avisa.
 *
 * O preço não é mais lido aqui: quem sabe qual Price pertence a qual plano é
 * `precos-dos-planos.ts`, e é ele quem responde se o Premium — o plano que a
 * tela de assinatura vende hoje — tem Price configurado. O `STRIPE_PRICE_ID`
 * antigo continua servindo de reserva lá dentro, então nenhuma instalação que
 * cobrava ontem deixa de cobrar hoje.
 */
export function cobrancaConfigurada(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim()) && planoVendavel("PREMIUM");
}

export function segredoDoWebhook(): string {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!segredo) throw new Error("STRIPE_WEBHOOK_SECRET não está configurada.");
  return segredo;
}
