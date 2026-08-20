/**
 * O que o cliente veria ao digitar este cupom, num pedido de exemplo.
 *
 * Um cupom é a única coisa do sistema que não aparece na loja: o cliente
 * precisa saber o código e digitá-lo. Então a pergunta que a prévia responde
 * não é "onde isso aparece", e sim "quanto isso tira do pedido" — que é o que
 * a lojista não consegue calcular de cabeça quando escolhe entre 15% e R$ 12.
 *
 * As regras são as mesmas do servidor, na mesma ordem: ativo, período,
 * mínimo, e só então o desconto. Se divergirem, a prévia promete um desconto
 * que o checkout recusa.
 */

export type RascunhoDeCupom = {
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  /** Vêm como texto do formulário. */
  discountValue: string;
  minOrderValue: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
};

export type RespostaDeExemplo =
  | { ok: true; code: string; discount: number }
  | { ok: false; error: string };

const numero = (v: string): number | null => {
  const limpo = v.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
};

const emReais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function cupomNoExemplo(
  cupom: RascunhoDeCupom,
  subtotal: number,
  agora = new Date(),
): RespostaDeExemplo {
  const codigo = cupom.code.trim().toUpperCase() || "SEUCUPOM";
  if (!cupom.isActive) return { ok: false, error: "Cupom não encontrado." };

  /*
   * "T00:00:00" no fim não é enfeite: sem ele, "2026-08-20" é lido como
   * meia-noite UTC, que no Brasil ainda é dia 19. Um cupom que vence hoje
   * aparecia vencido na prévia enquanto o checkout ainda o aceitava.
   */
  const comoLocal = (d: string) => new Date(`${d}T00:00:00`);
  const inicio = cupom.validFrom ? comoLocal(cupom.validFrom) : null;
  const fim = cupom.validUntil ? comoLocal(cupom.validUntil) : null;
  // O fim vale até o último instante do dia, como no servidor: senão um cupom
  // que vence hoje apareceria vencido a partir da meia-noite.
  if (fim) fim.setHours(23, 59, 59, 999);

  if (inicio && !Number.isNaN(inicio.getTime()) && agora < inicio) {
    return { ok: false, error: "Esse cupom ainda não começou." };
  }
  if (fim && !Number.isNaN(fim.getTime()) && agora > fim) {
    return { ok: false, error: "Esse cupom já venceu." };
  }

  const minimo = numero(cupom.minOrderValue);
  if (minimo !== null && subtotal < minimo) {
    return { ok: false, error: `Esse cupom vale a partir de ${emReais(minimo)}.` };
  }

  const valor = numero(cupom.discountValue) ?? 0;
  const bruto = cupom.discountType === "PERCENTAGE" ? (subtotal * valor) / 100 : valor;
  // Nunca desconta mais que o próprio pedido, como no servidor.
  return { ok: true, code: codigo, discount: Math.min(Math.round(bruto * 100) / 100, subtotal) };
}

/**
 * O pedido de exemplo sobre o qual o desconto é calculado.
 *
 * Precisa alcançar o mínimo do próprio cupom, senão a prévia mostraria sempre
 * a recusa por valor — e a lojista nunca veria quanto o desconto tira.
 */
export function pedidoDeExemplo(minOrderValue: string): number {
  const minimo = numero(minOrderValue) ?? 0;
  return Math.max(60, Math.ceil((minimo + 10) / 10) * 10);
}
