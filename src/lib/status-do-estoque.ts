/**
 * O estado de um item de estoque, decidido em um lugar só.
 *
 * FONTE ÚNICA, e é essa a razão de existir. Havia OITO implementações desta
 * pergunta espalhadas pelo projeto, em dois regimes que nem usavam o mesmo
 * campo — umas comparavam com `minimumThreshold`, outras com 30% de
 * `maximumQuantity`; cinco ignoravam o reservado, uma o considerava; três
 * usavam `<`, uma usava `<=`. Um item com 10 unidades e 8 prometidas era
 * "normal" em cinco delas, com duas livres.
 *
 * O DISPONÍVEL É QUEM MANDA, e não o saldo físico. O alerta existe para dizer a
 * quem compra que é hora de comprar, e quem compra precisa saber o que sobra —
 * não o que está na prateleira já prometido a outro pedido.
 *
 * FUNÇÃO PURA, sem Prisma e sem React, porque as duas pontas precisam da MESMA
 * resposta: o servidor que conta os alertas e a tela que desenha o ponto
 * colorido. Enquanto a regra morasse dentro de cada consumidor, oito cópias
 * eram oito regras.
 *
 * O QUE ELA NÃO FAZ: converter unidade. `quantityOnHand`, `quantityReserved` e
 * `minimumThreshold` estão TODOS na unidade base do item — o razão garante os
 * dois primeiros, e o mínimo é digitado nela. `contentSize` e
 * `purchasePackSize` não entram aqui: um mínimo de 3 num óleo contado em
 * garrafas quer dizer três garrafas, e os 900 ml de cada uma são irrelevantes
 * para essa comparação.
 */

export type StatusDoEstoque = "NORMAL" | "LOW_STOCK" | "OUT_OF_STOCK";

export type ItemParaStatus = {
  /** Saldo físico, na unidade base. Decimal do Prisma ou número. */
  quantityOnHand: unknown;
  /** Prometido a pedidos, na unidade base. */
  quantityReserved: unknown;
  /**
   * O limite abaixo do qual o item vira alerta, na unidade base.
   *
   * NULO É UM ESTADO REAL: significa "sem alerta configurado", e não "zero".
   * Um item sem mínimo nunca vira LOW_STOCK — compará-lo contra zero
   * inventado transformaria todo insumo nunca configurado em alarme
   * permanente. Zero, por outro lado, é valor legítimo e diferente de nulo.
   */
  minimumThreshold?: unknown | null;
};

export type ResultadoDoStatus = {
  status: StatusDoEstoque;
  /** `quantityOnHand − quantityReserved`, já calculado para quem exibe. */
  disponivel: number;
  /** O mínimo em número, ou `null` quando não há alerta configurado. */
  minimo: number | null;
};

/**
 * Decimal ou número viram número, e lixo vira zero.
 *
 * NUNCA comparar dois `Decimal` do Prisma com `<` ou `<=`: o `valueOf()` do
 * decimal.js devolve STRING, então o operador faz comparação lexicográfica e
 * responde que 10 é menor que 9. Dois pontos do projeto faziam exatamente isso.
 * Normalizar na entrada, uma vez, elimina a classe inteira de erro.
 *
 * Float64 tem ~15 dígitos significativos e cobre as oito casas decimais do
 * razão sem perda — a comparação de 2,99999999 contra 3 é exata.
 */
function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** O mínimo, preservando a diferença entre "não configurado" e "zero". */
function minimoDe(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function statusDoEstoque(item: ItemParaStatus): ResultadoDoStatus {
  const disponivel = numero(item.quantityOnHand) - numero(item.quantityReserved);
  const minimo = minimoDe(item.minimumThreshold);

  /*
   * SEM DISPONÍVEL TEM PRECEDÊNCIA, e independe do mínimo.
   *
   * Vale para o item zerado e para o item que existe mas está inteiro
   * prometido — 3 no físico com 3 reservados não tem nada a entregar. Também
   * vale para disponível NEGATIVO, que acontece quando se prometeu mais do que
   * havia: o número é pior que zero, e o estado não pode ser melhor.
   *
   * A distinção entre "não tem" e "tem, mas está todo reservado" foi discutida
   * e deliberadamente adiada — seriam dois estados, e por ora são um.
   */
  if (disponivel <= 0) {
    return { status: "OUT_OF_STOCK", disponivel, minimo };
  }

  /*
   * `<=` e não `<`: estoque exatamente no mínimo JÁ É o momento de comprar.
   * O mínimo é o piso que não se quer furar, não o ponto a partir do qual se
   * começa a pensar.
   */
  if (minimo !== null && disponivel <= minimo) {
    return { status: "LOW_STOCK", disponivel, minimo };
  }

  return { status: "NORMAL", disponivel, minimo };
}

/** Rótulo curto para a tela. `NORMAL` não tem rótulo: ausência é a mensagem. */
export function rotuloDoStatus(status: StatusDoEstoque): string | null {
  if (status === "OUT_OF_STOCK") return "Sem estoque";
  if (status === "LOW_STOCK") return "Estoque baixo";
  return null;
}

/**
 * Quanto falta para sair do alerta, ou `null` quando não há o que faltar.
 *
 * Só faz sentido em LOW_STOCK: um item NORMAL não deve nada, e um item sem
 * disponível não tem "faltante" — tem falta. Nunca devolve negativo, e nunca
 * inventa número para item sem mínimo configurado.
 */
export function faltanteParaOMinimo(resultado: ResultadoDoStatus): number | null {
  if (resultado.status !== "LOW_STOCK" || resultado.minimo === null) return null;
  const falta = resultado.minimo - resultado.disponivel;
  return falta > 0 ? falta : null;
}
