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
  contentSize?: unknown | null;
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
   * `contentSize` diz quantas unidades base cabem em uma unidade do item —
   * 1 pote = 500 g. Sem ele, e sem conversão cadastrada, não há como converter:
   * devolver a quantidade crua faria o sistema consumir 45 potes onde a receita
   * pedia 45 g, silenciosamente.
   */
  const conteudo = item.contentSize == null ? null : Number(item.contentSize);
  if (!conteudo || conteudo <= 0) {
    throw new Error(
      "Não é possível converter a unidade da receita para a do estoque: " +
        "não há conversão cadastrada entre as duas unidades, e o insumo não tem " +
        "contentSize definido.",
    );
  }
  return quantidade / conteudo;
}
