/**
 * EMBALAGEM DE COMPRA × CONTEÚDO DA UNIDADE DE ESTOQUE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `cost` É, SEMPRE E EM TODO LUGAR, O PREÇO DE UMA UNIDADE DE ESTOQUE.      │
 * │                                                                          │
 * │     cost = preço da embalagem ÷ quantas unidades de ESTOQUE ela rende     │
 * │                                                                          │
 * │ É o que `costAtTime`, o custo da ficha, o custo do preparado e os         │
 * │ relatórios de valor de estoque consomem. Qualquer caminho que grave outra │
 * │ coisa aqui contamina todos eles de uma vez.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * São dois campos, e eles apontam para lados opostos:
 *
 *   purchasePackSize  "1 compra traz quantas unidades de ESTOQUE?"
 *                     multiplica a entrada, DIVIDE o preço
 *                     sempre na unidade do estoque
 *
 *   contentSize       "1 unidade de ESTOQUE contém quanto?"
 *                     divide a quantidade da RECEITA, não mexe no preço
 *                     obrigatoriamente em outra grandeza
 *
 * ISTO NASCEU DE UM CUSTO DE R$ 1.046,47 num bolo. O óleo foi cadastrado
 * contado em `ml`, e o campo de conteúdo recebeu "900 ml" — o que descreve a
 * garrafa com honestidade, mas naquele campo significa "1 ml contém 900 ml".
 * O preço não foi dividido por 900, porque quem divide preço é o
 * `purchasePackSize`, e a receita de 110 ml virou R$ 880,00.
 *
 * A regra que separa os dois é uma só: SE A UNIDADE DA EMBALAGEM É DA MESMA
 * GRANDEZA DA UNIDADE DE ESTOQUE, É COMPRA. Se é de outra grandeza, é conteúdo
 * — e aí o estoque tem que ser contado em unidades avulsas, porque só se conta
 * "o que tem dentro" de algo que é contado inteiro.
 *
 *   Óleo      estoque ml   garrafa 900 ml   mesma grandeza  → purchasePackSize
 *   Chocolate estoque g    pacote 700 g     mesma grandeza  → purchasePackSize
 *   Leite     estoque L    caixa 6 L        mesma grandeza  → purchasePackSize
 *   Ovos      estoque un   caixa 30 un      mesma grandeza  → purchasePackSize
 *   Açúcar    estoque un   pacote de 1 kg   COUNT × WEIGHT  → contentSize
 *   Fermento  estoque un   pote de 200 g    COUNT × WEIGHT  → contentSize
 *
 * Os dois convivem: um fardo com 10 pacotes de 1 kg é `purchasePackSize = 10`
 * (compro 1 fardo, entram 10 pacotes) e `contentSize = 1 kg` (cada pacote tem
 * um quilo). Dois níveis reais, dois campos.
 */

/** O bastante para decidir, sem tocar no banco. */
export type UnidadeParaValidar = {
  id: string;
  /** WEIGHT, VOLUME ou COUNT. */
  system: string;
};

export type CombinacaoDeEmbalagem = {
  unidadeDeEstoque: UnidadeParaValidar;
  contentSize?: number | null;
  contentUnit?: UnidadeParaValidar | null;
};

export type Veredito =
  | { ok: true }
  | { ok: false; motivo: string; mensagem: string };

/** A unidade em que se contam coisas inteiras — a única que admite conteúdo. */
export const SISTEMA_DE_CONTAGEM = "COUNT";

export function validarConteudo(c: CombinacaoDeEmbalagem): Veredito {
  const temTamanho = c.contentSize != null;
  const temUnidade = c.contentUnit != null;

  if (!temTamanho && !temUnidade) return { ok: true };

  /*
   * Um sem o outro é sempre ambíguo. "1 un = 1000" não diz 1000 do quê, e
   * adivinhar faria o mesmo número valer gramas numa receita e mililitros em
   * outra, no mesmo item.
   */
  if (temTamanho !== temUnidade) {
    return {
      ok: false,
      motivo: "incompleto",
      mensagem:
        "Informe o conteúdo e a unidade dele juntos: um número sem unidade " +
        "não diz nada, e uma unidade sem número também não.",
    };
  }

  if (!(Number(c.contentSize) > 0)) {
    return {
      ok: false,
      motivo: "tamanho-invalido",
      mensagem: "O conteúdo da unidade de estoque precisa ser maior que zero.",
    };
  }

  /*
   * Conteúdo só existe sobre algo contado inteiro.
   *
   * "1 ml contém 900 ml" não é uma frase com significado, e foi exatamente ela
   * que produziu o óleo a R$ 8,00 o mililitro. Quem conta o estoque em ml, g,
   * kg ou L já está contando o conteúdo — o que a embalagem traz é COMPRA.
   */
  if (c.unidadeDeEstoque.system !== SISTEMA_DE_CONTAGEM) {
    return {
      ok: false,
      motivo: "estoque-nao-e-contagem",
      mensagem:
        "Este item é contado por medida, não por unidades avulsas, então ele " +
        "não tem “conteúdo dentro de uma unidade”. O que vem na embalagem é " +
        "uma COMPRA: informe quanto entra no estoque a cada compra.",
    };
  }

  const conteudo = c.contentUnit as UnidadeParaValidar;

  if (conteudo.id === c.unidadeDeEstoque.id) {
    return {
      ok: false,
      motivo: "mesma-unidade",
      mensagem:
        "O conteúdo está na mesma unidade do estoque, o que não converte " +
        "nada. Se a embalagem traz várias unidades, isso é embalagem de " +
        "compra, não conteúdo.",
    };
  }

  /*
   * Mesma grandeza é conversível por escala fixa — kg↔g, L↔ml — e nesse caso a
   * conversão cadastrada resolve sozinha, ANTES de o conteúdo ser consultado.
   * Aceitar aqui criaria um campo inerte, que não faz nada e induz a crer que
   * está dividindo o preço. Foi assim que a farinha e o leite ficaram com
   * `contentSize` sem efeito nenhum.
   */
  if (conteudo.system === c.unidadeDeEstoque.system) {
    return {
      ok: false,
      motivo: "mesma-grandeza",
      mensagem:
        "O conteúdo é da mesma grandeza da unidade de estoque, então o " +
        "sistema já sabe converter sozinho. Use a embalagem de compra para " +
        "dizer quanto entra a cada compra.",
    };
  }

  return { ok: true };
}

/**
 * Quantas unidades de ESTOQUE uma embalagem rende — o divisor do preço.
 *
 * Sem embalagem, ou com embalagem inválida, vale 1: a compra é direta na
 * unidade de estoque, que é o comportamento de todo item anterior a este campo.
 * O `contentSize` NUNCA entra aqui — ele divide receita, não preço.
 */
export function unidadesPorEmbalagem(purchasePackSize?: unknown | null): number {
  const n = purchasePackSize == null ? NaN : Number(purchasePackSize);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** `cost` = preço da embalagem ÷ o que ela rende. A regra, em uma linha. */
export function custoPorUnidadeDeEstoque(
  precoDaEmbalagem: number,
  purchasePackSize?: unknown | null,
): number | null {
  const preco = Number(precoDaEmbalagem);
  if (!Number.isFinite(preco) || preco <= 0) return null;
  return preco / unidadesPorEmbalagem(purchasePackSize);
}

/**
 * O campo de conteúdo deve aparecer no formulário?
 *
 * NASCEU DE UM IMPASSE QUE EU MESMO CRIEI. A regra anterior olhava o que estava
 * DIGITADO: campo com valor, campo visível. Só que num item contado por medida
 * — óleo em ml — o campo só aparecia porque havia conteúdo herdado inválido, e
 * o formulário só enviava o campo quando ele estava visível.
 *
 * O resultado era um nó: apagar o valor escondia o campo, esconder o campo
 * omitia-o do envio, omitir significava "não mexa", e o conteúdo inválido
 * sobrevivia — fazendo o servidor recusar a gravação. APAGAR O CAMPO ERA O QUE
 * IMPEDIA O CAMPO DE SER APAGADO. Não havia caminho pela interface.
 *
 * A correção é olhar o que está GRAVADO, e não o rascunho: enquanto o item
 * tiver conteúdo no banco, o campo continua na tela — vazio, esperando o
 * salvamento que vai limpá-lo. Some só depois de a limpeza ser gravada.
 *
 * O que o pedido original queria segue de pé: nada é apagado sozinho. Quem
 * esvazia é a pessoa, e a gravação é o consentimento.
 */
export function deveMostrarConteudo(entrada: {
  /** A unidade de estoque é de contagem (`un`)? */
  contaPorUnidades: boolean;
  /** Há `contentSize` GRAVADO no item? Falso ao criar um item novo. */
  temConteudoGravado: boolean;
  /** O que está no formulário agora — pode ter sido esvaziado. */
  conteudoDigitado: string;
}): boolean {
  if (entrada.contaPorUnidades) return true;
  // Item por medida: só aparece para consertar o que já está gravado errado,
  // ou enquanto a pessoa digita algo que ainda será recusado.
  return entrada.temConteudoGravado || entrada.conteudoDigitado.trim() !== "";
}
