import type { Plano } from "./planos/tipos";

/**
 * O preço de cada plano — o que a TELA mostra.
 *
 * Quem cobra é o Price cadastrado no Stripe, e é ele que vale. Se os dois
 * divergirem, o cliente lê um preço e paga outro — por isso este arquivo
 * existe sozinho, fácil de achar na hora de mudar os dois juntos:
 *
 *   BASIC    R$ 267  ↔  STRIPE_PRICE_ID_BASIC
 *   PREMIUM  R$ 360  ↔  STRIPE_PRICE_ID_PREMIUM
 *
 * ⚠️ O PREÇO ANTIGO ERA R$ 300, e ele não é nenhum dos dois. Aquele Price
 * continua cobrando quem já assina, no Stripe; nenhuma tela do painel deve
 * escrever R$ 300 como preço de BASIC ou de Premium.
 */
export const PRECO_MENSAL: Readonly<Record<Plano, number>> = {
  BASIC: 267,
  PREMIUM: 360,
};

/**
 * O preço escrito, em reais.
 *
 * O padrão é PREMIUM porque é o que os três botões de "Assinar" vendem hoje —
 * `criarCheckout` sem plano também cai em PREMIUM, e os dois defaults têm de
 * concordar, senão o botão anuncia um valor e o checkout cobra outro.
 */
export const precoEscrito = (plano: Plano = "PREMIUM") =>
  PRECO_MENSAL[plano].toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataEscrita = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
