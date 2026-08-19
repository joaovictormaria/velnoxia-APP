/**
 * O plano do SaaS.
 *
 * O valor aqui é só o que a tela mostra: quem cobra é o Price cadastrado no
 * Stripe, e é ele que vale. Se os dois divergirem, o cliente lê um preço e
 * paga outro — por isso este arquivo existe sozinho, fácil de achar na hora
 * de mudar os dois juntos.
 */
export const PRECO_MENSAL = 300;

export const precoEscrito = () =>
  PRECO_MENSAL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataEscrita = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
