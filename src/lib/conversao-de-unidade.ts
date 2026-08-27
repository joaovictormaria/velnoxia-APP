/**
 * Converter a quantidade da receita para a unidade em que o estoque é contado.
 *
 * A receita pensa em gramas; o estoque pode contar em quilos, ou em potes. São
 * três caminhos diferentes, e a ordem entre eles importa:
 *
 *   1. mesma unidade          nada a fazer
 *   2. conversão cadastrada   1 kg = 1000 g — escala métrica, vem do banco
 *   3. contentSize            1 pote = 500 g — embalagem, vem do item
 *
 * FUNÇÃO PURA, e de propósito. Ela mora aqui, e não junto do Prisma, porque o
 * formulário de ficha técnica precisa da MESMA conta para mostrar o custo
 * estimado enquanto a pessoa digita. Enquanto o cliente tinha fórmula própria,
 * ele multiplicava sem converter: 60 g de farinha a R$ 5,00/kg apareciam como
 * R$ 300,00 em vez de R$ 0,30, e a produção da mesma receita falhava.
 */

/** `${fromUnitId}->${toUnitId}` → fator. */
export type MapaDeConversoes = Map<string, number>;

export const chaveDeConversao = (de: string, para: string) => `${de}->${para}`;

export function montarMapaDeConversoes(
  linhas: Array<{ fromUnitId: string; toUnitId: string; conversionFactor: unknown }>,
): MapaDeConversoes {
  const mapa: MapaDeConversoes = new Map();
  for (const l of linhas) {
    mapa.set(chaveDeConversao(l.fromUnitId, l.toUnitId), Number(l.conversionFactor));
  }
  return mapa;
}

export type ItemParaConverter = {
  baseUnitId: string;
  /** Quanto de `contentUnit` cabe em UMA unidade de estoque. 1 un = 1000 g. */
  contentSize?: unknown | null;
  /**
   * Em que unidade o `contentSize` está expresso. Guarda o ID da unidade,
   * igual a `baseUnitId` — é o que permite convertê-lo contra o mapa.
   *
   * SEM ELE O `contentSize` É AMBÍGUO, e essa ambiguidade já era um bug: a
   * conta dividia pelo número sem olhar a unidade da ficha, então "600 g" e
   * "600 kg" davam os mesmos 0,6 pacotes. Mesmo número, significado errado,
   * nenhum erro — a mesma família do custo de R$ 300,00.
   */
  contentUnit?: string | null;
};

export function converterParaUnidadeBase(
  quantidade: number,
  unitIdDaFicha: string,
  item: ItemParaConverter,
  conversoes?: MapaDeConversoes,
): number {
  if (unitIdDaFicha === item.baseUnitId) return quantidade;

  /*
   * A conversão cadastrada vem antes do `contentSize`.
   *
   * Um item pode ter os dois — farinha contada em kg, comprada em saco de 5 kg
   * — e nesse caso "60 g" quer dizer sessenta gramas, não sessenta sacos. A
   * escala métrica é a leitura literal do que foi escrito na receita; o
   * `contentSize` só entra quando não há escala que ligue as duas unidades.
   */
  const fator = conversoes?.get(chaveDeConversao(unitIdDaFicha, item.baseUnitId));
  if (fator && fator > 0) return quantidade * fator;

  /*
   * O CONTEÚDO DA EMBALAGEM, em DUAS ETAPAS.
   *
   * O estoque conta pacotes; a receita pede gramas. `contentSize` diz quanto
   * cabe num pacote — 1 un = 1000 g — e `contentUnit` diz em que unidade esse
   * número está.
   *
   * Dividir direto pelo número, como se fazia antes, só acerta quando a ficha
   * usa exatamente a unidade do conteúdo. "0,6 kg" dava 0,0006 pacotes em vez
   * de 0,6, e "600 kg" dava 0,6 em vez de 600. Por isso a quantidade é primeiro
   * trazida para a unidade do CONTEÚDO, e só então dividida:
   *
   *     600 g   → 600 g      ÷ 1000 = 0,6 pacotes
   *     0,6 kg  → 600 g      ÷ 1000 = 0,6 pacotes
   *     600 kg  → 600.000 g  ÷ 1000 = 600 pacotes
   */
  const conteudo = item.contentSize == null ? null : Number(item.contentSize);
  if (!conteudo || conteudo <= 0) {
    throw new Error(
      "Não é possível converter a unidade da receita para a do estoque: " +
        "não há conversão cadastrada entre as duas unidades, e o insumo não tem " +
        "contentSize definido.",
    );
  }

  /*
   * Conteúdo sem unidade é recusado, e não chutado.
   *
   * Adivinhar que o número está na unidade da ficha faria "1 un = 1000" valer
   * 1000 g para uma receita em gramas e 1000 ml para uma em mililitros, no
   * mesmo item. Recusar obriga a informar, uma vez, o que o pacote contém.
   */
  if (!item.contentUnit) {
    throw new Error(
      "Não é possível converter a unidade da receita para a do estoque: o " +
        "insumo tem contentSize, mas não diz em que unidade esse conteúdo " +
        "está (contentUnit).",
    );
  }

  const naUnidadeDoConteudo =
    unitIdDaFicha === item.contentUnit
      ? quantidade
      : (() => {
          const f = conversoes?.get(
            chaveDeConversao(unitIdDaFicha, item.contentUnit as string),
          );
          if (f && f > 0) return quantidade * f;
          /*
           * Grandezas diferentes: o pacote contém gramas e a receita pede
           * mililitros. Não existe fator sem densidade, e inventar um daria um
           * número plausível e errado.
           */
          throw new Error(
            "Não é possível converter a unidade da receita para a do estoque: " +
              "a unidade da receita não é compatível com a unidade do conteúdo " +
              "da embalagem.",
          );
        })();

  return naUnidadeDoConteudo / conteudo;
}
