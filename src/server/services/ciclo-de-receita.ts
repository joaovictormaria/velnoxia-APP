import { prisma } from "@/server/db/client";

/**
 * O guarda contra receitas que se mordem.
 *
 * "Molho leva base; base leva molho" é fácil de escrever e impossível de
 * produzir. Sem esta checagem o dano não é um erro de validação: é o servidor
 * caminhando o grafo para sempre, no meio de uma transação que está segurando
 * travas de estoque. Um ciclo salvo derruba o motor de produção inteiro na
 * primeira vez que alguém apertar "Produzir".
 *
 * O momento de recusar é a GRAVAÇÃO da receita, não a produção. Na produção já
 * é tarde: o ciclo está gravado, e qualquer caminho que o leia trava.
 */

/**
 * Profundidade máxima da cadeia de preparados.
 *
 * Cinco níveis cobrem qualquer cozinha real com folga — molho → base → fundo
 * → caldo → tempero já é mais fundo do que qualquer ficha técnica de
 * restaurante. O limite existe como segunda trava: se algum dia a detecção de
 * ciclo falhar por um caso não previsto, a profundidade barra antes de o
 * caminhamento virar um laço infinito.
 */
export const PROFUNDIDADE_MAXIMA = 5;

export class CicloDeReceita {
  /**
   * Recusa a receita se ela fechar um ciclo ou for funda demais.
   *
   * `donoItemId` é o preparado que a receita PRODUZ; `insumoIds` são os itens
   * que ela CONSOME. A pergunta é: partindo dos insumos e descendo pelas
   * receitas deles, chego de volta ao dono?
   *
   * Caminha só por receitas ATIVAS, porque só elas seriam produzidas. Uma
   * versão antiga desativada não fabrica nada, e recusar por causa dela
   * impediria salvar receitas legítimas — a v1 morta do molho bloquearia a
   * massa para sempre.
   */
  static async conferir(
    storeId: string,
    donoItemId: string,
    insumoIds: string[],
  ): Promise<void> {
    if (insumoIds.includes(donoItemId)) {
      const nome = await this.nomeDoItem(donoItemId);
      throw new Error(
        `"${nome}" não pode ser insumo da própria receita.`,
      );
    }

    /*
     * Busca em largura a partir dos insumos. Cada nível é uma consulta só —
     * uma por profundidade, não uma por item — porque a alternativa natural
     * (descer recursivamente item a item) faz N consultas para uma receita de
     * N insumos, e a cozinha inteira em cada gravação.
     */
    const visitados = new Set<string>(insumoIds);
    let nivelAtual = [...new Set(insumoIds)];

    for (let profundidade = 1; nivelAtual.length > 0; profundidade++) {
      if (profundidade > PROFUNDIDADE_MAXIMA) {
        throw new Error(
          `A cadeia de preparados passa de ${PROFUNDIDADE_MAXIMA} níveis. ` +
            `Uma receita tão funda quase sempre é um engano — confira se algum ` +
            `preparado no meio do caminho não deveria ser um insumo direto.`,
        );
      }

      const receitas = await prisma.productComposition.findMany({
        where: {
          storeId,
          isActive: true,
          inventoryItemId: { in: nivelAtual },
        },
        select: { items: { select: { inventoryItemId: true } } },
      });

      const proximoNivel: string[] = [];
      for (const receita of receitas) {
        for (const item of receita.items) {
          if (item.inventoryItemId === donoItemId) {
            throw new Error(await this.mensagemDeCiclo(donoItemId));
          }
          if (!visitados.has(item.inventoryItemId)) {
            visitados.add(item.inventoryItemId);
            proximoNivel.push(item.inventoryItemId);
          }
        }
      }

      nivelAtual = proximoNivel;
    }
  }

  /**
   * A profundidade da cadeia abaixo destes insumos.
   *
   * Separada da checagem de ciclo porque a ficha de PRODUTO precisa dela sem
   * precisar da outra: um produto do cardápio nunca é insumo de nada, então
   * não pode participar de ciclo — mas a cadeia de preparados abaixo dele
   * ainda pode ser funda.
   */
  static async profundidade(storeId: string, insumoIds: string[]): Promise<number> {
    const visitados = new Set<string>(insumoIds);
    let nivelAtual = [...new Set(insumoIds)];
    let profundidade = 0;

    while (nivelAtual.length > 0 && profundidade <= PROFUNDIDADE_MAXIMA) {
      profundidade++;
      const receitas = await prisma.productComposition.findMany({
        where: { storeId, isActive: true, inventoryItemId: { in: nivelAtual } },
        select: { items: { select: { inventoryItemId: true } } },
      });

      const proximo: string[] = [];
      for (const receita of receitas) {
        for (const item of receita.items) {
          if (!visitados.has(item.inventoryItemId)) {
            visitados.add(item.inventoryItemId);
            proximo.push(item.inventoryItemId);
          }
        }
      }
      nivelAtual = proximo;
    }

    return profundidade;
  }

  private static async nomeDoItem(itemId: string) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { name: true },
    });
    return item?.name ?? itemId;
  }

  /** Nomeia os dois lados, porque "ciclo detectado" não diz onde olhar. */
  private static async mensagemDeCiclo(donoItemId: string) {
    const nome = await this.nomeDoItem(donoItemId);
    return (
      `Esta receita fecha um ciclo: "${nome}" acabaria dependendo de si mesmo. ` +
      `Um dos preparados que ela consome já usa "${nome}", direta ou ` +
      `indiretamente, e nenhum dos dois poderia ser produzido primeiro.`
    );
  }
}
