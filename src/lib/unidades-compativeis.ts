/**
 * Que unidades uma receita pode usar para um insumo.
 *
 * DUAS PORTAS, E A SEGUNDA É A DA EMBALAGEM.
 *
 * `InventoryUnit.system` classifica cada unidade em WEIGHT, VOLUME ou COUNT, e
 * duas unidades do mesmo sistema se convertem por um fator fixo. Essa é a
 * primeira porta, e por um tempo foi a única — o que deixava de fora o caso
 * mais comum de todos:
 *
 *     Óleo, contado em `un`, cada garrafa com 900 ml.
 *
 * Ninguém escreve "1 un de óleo" numa receita de salgado; escreve "40 ml". Com
 * a regra só de `system`, `un` é COUNT e `ml` é VOLUME, e a ficha era recusada
 * — obrigando a lançar uma garrafa inteira por salgado. Vinte e duas vezes e
 * meia o consumo real, no estoque e no custo.
 *
 * A segunda porta é `contentSize` + `contentUnit`. Quando o item declara o que
 * cabe numa unidade de estoque, as unidades do sistema DESSE conteúdo também
 * servem — e `converterParaUnidadeBase` já sabia fazer essa conta o tempo todo.
 * Esta função só parou de esconder a capacidade.
 *
 * O que continua impossível: massa contra volume sem conteúdo declarado. Não
 * existe fator entre g e ml sem densidade, e inventar um daria um número
 * plausível e errado.
 *
 * FUNÇÃO PURA, sem Prisma e sem React, porque as três pontas precisam da MESMA
 * resposta: o `<select>` da ficha técnica, a validação do servidor e os testes.
 * Ela responde "pode?"; `converterParaUnidadeBase` responde "quanto?".
 */

export type UnidadeConhecida = {
  id: string;
  code: string;
  /** WEIGHT | VOLUME | COUNT — vem de `InventoryUnit.system`. */
  system: string;
};

/**
 * O insumo, pelo que interessa à pergunta.
 *
 * Recebe o ITEM e não só o `baseUnitId`: sem `contentSize` e `contentUnit` não
 * há como saber que uma garrafa contém 900 ml, e era exatamente essa ausência
 * que fechava a segunda porta.
 */
export type InsumoParaUnidades = {
  baseUnitId: string;
  /** Quanto cabe em UMA unidade de estoque. 1 un = 900 ml. */
  contentSize?: unknown | null;
  /** Em que unidade esse conteúdo está escrito. Guarda o ID da unidade. */
  contentUnit?: string | null;
};

/** O conteúdo declarado vale? Zero, negativo ou sem unidade não valem. */
function conteudoUtilizavel(insumo: InsumoParaUnidades): string | null {
  if (!insumo.contentUnit) return null;
  const tamanho = insumo.contentSize == null ? null : Number(insumo.contentSize);
  if (!tamanho || !Number.isFinite(tamanho) || tamanho <= 0) return null;
  return insumo.contentUnit;
}

/**
 * As unidades que podem aparecer na receita para este insumo, já ordenadas.
 *
 * Devolve lista VAZIA quando a unidade base não está entre as conhecidas — não
 * um palpite. Quem chama decide o que fazer com o vazio; inventar uma lista
 * aqui esconderia um dado faltando atrás de um `<select>` plausível.
 */
export function unidadesCompativeis(
  insumo: InsumoParaUnidades,
  unidades: UnidadeConhecida[],
): UnidadeConhecida[] {
  const base = unidades.find((u) => u.id === insumo.baseUnitId);
  if (!base) return [];

  const idDoConteudo = conteudoUtilizavel(insumo);
  const conteudo = idDoConteudo
    ? unidades.find((u) => u.id === idDoConteudo)
    : undefined;

  const sistemas = new Set([base.system]);
  if (conteudo) sistemas.add(conteudo.system);

  return unidades
    .filter((u) => sistemas.has(u.system))
    /*
     * Ordem: a base, depois a unidade do conteúdo, depois o resto por código.
     *
     * A base abre a lista porque é onde o saldo é contado — é a resposta certa
     * na dúvida. A do conteúdo vem logo atrás porque é a que a pessoa veio
     * procurar: quem cadastrou "cada un contém 900 ml" quer escrever ml.
     */
    .sort((a, b) => {
      const peso = (u: UnidadeConhecida) =>
        u.id === base.id ? 0 : u.id === conteudo?.id ? 1 : 2;
      const d = peso(a) - peso(b);
      return d !== 0 ? d : a.code.localeCompare(b.code);
    });
}

/**
 * Esta unidade pode ser usada na receita deste insumo?
 *
 * É a pergunta que o servidor faz antes de gravar. A interface usa a lista
 * acima; o servidor usa esta — mesma regra, duas formas de perguntar.
 */
export function unidadeEhCompativel(
  unitIdDaFicha: string,
  insumo: InsumoParaUnidades,
  unidades: UnidadeConhecida[],
): boolean {
  if (unitIdDaFicha === insumo.baseUnitId) return true;
  return unidadesCompativeis(insumo, unidades).some((u) => u.id === unitIdDaFicha);
}
