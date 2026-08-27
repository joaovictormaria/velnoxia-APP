/**
 * Embalagem de compra × unidade de controle do estoque.
 *
 * São duas coisas diferentes, e confundi-las é o erro mais caro do cadastro de
 * insumo. O fornecedor vende CAIXA; a receita pede OVO. Uma caixa de R$ 15,00
 * com 30 ovos não faz o ovo custar R$ 15,00 — faz custar R$ 0,50.
 *
 *   quantidade em estoque = embalagens × conteúdo da embalagem
 *   custo total           = embalagens × preço da embalagem
 *   custo por unidade     = preço da embalagem ÷ conteúdo da embalagem
 *
 * A última linha é a que importa: o custo unitário sai do PREÇO DA EMBALAGEM
 * dividido pelo CONTEÚDO, e não de `preço × quantidade`. Comprar cinco caixas
 * não encarece o ovo.
 *
 * FUNÇÃO PURA, e de propósito: o formulário precisa mostrar a conta enquanto a
 * pessoa digita, e o servidor precisa refazê-la ao gravar. Duas implementações
 * da mesma conta divergem; uma só, não. Foi assim que o custo estimado do
 * preparado mostrou R$ 300,00 onde o servidor calculava R$ 0,30.
 */

export type EntradaDeCompra = {
  /** Quantas embalagens foram compradas. 5 caixas. */
  embalagens: number;
  /**
   * Quantas unidades de ESTOQUE vêm em uma embalagem. 30 ovos por caixa.
   *
   * Ausente, nulo ou não positivo significa compra direta na unidade de
   * estoque — 5 kg de farinha são 5 kg, sem embalagem no meio. É o caminho de
   * todo item cadastrado antes deste conceito existir, e ele continua valendo.
   */
  conteudoPorEmbalagem?: number | null;
  /** Quanto custa UMA embalagem. R$ 15,00 a caixa. */
  precoDaEmbalagem?: number | null;
};

export type CompraCalculada = {
  /** O que entra no saldo, na unidade de controle. 150 ovos. */
  quantidadeEmEstoque: number;
  /** O que saiu do caixa. R$ 75,00. */
  custoTotal: number | null;
  /** O que vale cada unidade de estoque. R$ 0,50 por ovo. */
  custoPorUnidade: number | null;
  /** Quantas unidades de estoque cabem numa embalagem, já normalizado. */
  conteudo: number;
};

/** Conteúdo utilizável: ausente ou inválido vira 1 — a compra é direta. */
export function conteudoDaEmbalagem(valor?: number | null): number {
  const n = valor == null ? NaN : Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function calcularCompra(entrada: EntradaDeCompra): CompraCalculada {
  const embalagens = Number(entrada.embalagens);
  const conteudo = conteudoDaEmbalagem(entrada.conteudoPorEmbalagem);

  const preco =
    entrada.precoDaEmbalagem == null ? null : Number(entrada.precoDaEmbalagem);
  const precoValido = preco != null && Number.isFinite(preco) && preco > 0;

  const quantidadeEmEstoque =
    Number.isFinite(embalagens) && embalagens > 0 ? embalagens * conteudo : 0;

  return {
    quantidadeEmEstoque,
    custoTotal: precoValido ? embalagens * preco! : null,
    /*
     * Preço ÷ conteúdo, e NÃO total ÷ quantidade.
     *
     * As duas contas dão o mesmo número quando há embalagens, porque
     * (n × preço) ÷ (n × conteúdo) = preço ÷ conteúdo. Mas esta versão continua
     * definida quando `embalagens` é zero — o formulário mostra o custo por
     * unidade antes de a pessoa informar quantas caixas vai comprar.
     */
    custoPorUnidade: precoValido ? preco! / conteudo : null,
    conteudo,
  };
}

export type EntradaDeMovimento = {
  /** O número que a pessoa digitou: 5. Caixas ou unidades, conforme a flag. */
  digitado: number;
  /** Conteúdo cadastrado NO ITEM. Vem do banco, não do formulário. */
  conteudoDoItem?: number | null;
  /** Esta compra veio em caixa fechada? Avulsa acontece e é legítima. */
  emEmbalagens: boolean;
  /** Valor TOTAL da nota, para todas as embalagens. R$ 75,00. */
  totalPago?: number | null;
};

export type MovimentoCalculado = {
  /** O que entra no saldo, na unidade de controle. 150. */
  quantity: number;
  /** O que congela em `costAtTime`. R$ 0,50. Nulo quando não houve valor. */
  custoUnitario: number | null;
  /** Quantas unidades por embalagem foram efetivamente aplicadas. */
  conteudo: number;
};

/**
 * A compra SEGUINTE, depois de o item já existir.
 *
 * Difere de `calcularCompra` no que se pergunta: o cadastro pede o preço de UMA
 * embalagem, a movimentação pede o TOTAL da nota — que é o que está impresso
 * nela. O resultado é o mesmo número no fim, e é isso que os testes cobram.
 *
 * Existe como função pura, e não dentro da server function, pelo motivo de
 * sempre: server function não roda em teste, e regra que não roda em teste é
 * regra que ninguém verifica. Aqui a UI e o servidor chamam a MESMA conta.
 */
export function calcularMovimentoDeCompra(
  entrada: EntradaDeMovimento,
): MovimentoCalculado {
  const digitado = Number(entrada.digitado);
  /*
   * O conteúdo só entra quando a compra é em embalagem. Item sem embalagem, ou
   * compra avulsa, tem conteúdo 1 — e a conta vira a de sempre, que é o caminho
   * de tudo que existia antes deste conceito.
   */
  const conteudo = entrada.emEmbalagens
    ? conteudoDaEmbalagem(entrada.conteudoDoItem)
    : 1;

  const quantity =
    Number.isFinite(digitado) && digitado !== 0 ? digitado * conteudo : 0;

  const total = entrada.totalPago == null ? null : Number(entrada.totalPago);
  /*
   * Dividido pela quantidade em UNIDADE DE ESTOQUE — 150, e não pelas 5 caixas.
   * Dividir pelas caixas gravaria R$ 15,00 como preço do OVO: exatamente o erro
   * que a embalagem existe para não cometer.
   */
  const custoUnitario =
    total != null && Number.isFinite(total) && total > 0 && quantity > 0
      ? total / quantity
      : null;

  return { quantity, custoUnitario, conteudo };
}
