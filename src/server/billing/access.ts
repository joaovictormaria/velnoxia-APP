/**
 * Quem pode usar a conta, e por quê.
 *
 * Fica separado do Stripe e do banco de propósito: é a regra que derruba um
 * restaurante do ar, e precisa poder ser testada sem rede e sem servidor.
 */

export type EstadoDaConta = {
  status: "TRIAL" | "ACTIVE" | "SUSPENDED";
  trialEndsAt: Date | null;
  /** Até quando está pago. Null numa loja liberada na mão, que não expira. */
  paidUntil: Date | null;
  /** O texto cru do Stripe: "active", "past_due", "canceled"... */
  subscriptionStatus: string | null;
};

/**
 * Dias de sobrevida quando o cartão falha.
 *
 * O Stripe tenta de novo por cerca de duas semanas antes de desistir. Sem
 * tolerância, o cardápio de um restaurante sairia do ar no primeiro erro de
 * cobrança — muitas vezes um cartão trocado — e a primeira notícia que o dono
 * teria seria um cliente ligando para dizer que o site sumiu.
 */
export const DIAS_DE_TOLERANCIA = 3;

const DIA = 24 * 60 * 60 * 1000;

export type Veredito =
  | { liberado: true; motivo: "trial" | "pago" | "liberada-na-mao" | "tolerancia" }
  | { liberado: false; motivo: "suspensa" | "trial-vencido" | "assinatura-vencida" };

export function conferirAcesso(conta: EstadoDaConta, agora = new Date()): Veredito {
  // Suspensão é a chave na mão do dono do SaaS: vale sobre qualquer pagamento.
  if (conta.status === "SUSPENDED") return { liberado: false, motivo: "suspensa" };

  if (conta.paidUntil) {
    if (conta.paidUntil.getTime() > agora.getTime()) {
      return { liberado: true, motivo: "pago" };
    }
    // Venceu, mas o Stripe ainda está tentando cobrar: segura alguns dias.
    if (
      conta.subscriptionStatus === "past_due" &&
      conta.paidUntil.getTime() + DIAS_DE_TOLERANCIA * DIA > agora.getTime()
    ) {
      return { liberado: true, motivo: "tolerancia" };
    }
    return { liberado: false, motivo: "assinatura-vencida" };
  }

  if (conta.status === "TRIAL") {
    if (conta.trialEndsAt && conta.trialEndsAt.getTime() < agora.getTime()) {
      return { liberado: false, motivo: "trial-vencido" };
    }
    return { liberado: true, motivo: "trial" };
  }

  // ACTIVE sem data paga: liberada na mão, e assim continua.
  return { liberado: true, motivo: "liberada-na-mao" };
}

export const contaLiberada = (conta: EstadoDaConta, agora = new Date()): boolean =>
  conferirAcesso(conta, agora).liberado;
