import { prisma } from "@/server/db/client";

/** Um insumo e quanto dele um item do pedido consome, já na unidade base. */
export type InsumoNecessario = {
  inventoryItemId: string;
  unitId: string;
  quantidade: number;
};

/**
 * A ficha técnica que vale para um item de pedido, e o que ela consome.
 *
 * Existe uma função só para isto porque reserva e consumo precisam responder à
 * mesma pergunta. Antes cada um respondia do seu jeito: o consumo olhava a
 * composição, a reserva olhava só `Product.inventoryItemId`. A assimetria
 * significava que um prato feito por receita não reservava nada — restavam três
 * porções, chegavam oito pedidos, e o sistema aceitava os oito.
 */

/**
 * Qual versão da ficha vale para este item de pedido.
 *
 * Se o item já tem `compositionVersionId`, é essa e ponto — foi congelada
 * quando o pedido entrou. Só quando não tem (pedido antigo, anterior a este
 * campo) é que se busca a ativa.
 *
 * A regra existe por um caso concreto: o pedido entra às 19h com a receita v3;
 * às 19h10 alguém publica a v4 com menos frango; às 19h20 o pedido vai ao
 * preparo. Resolvendo "a ativa agora", a baixa sairia pela v4 enquanto a
 * reserva foi feita pela v3 — e a diferença ficaria reservada para sempre, sem
 * nada que a libere.
 */
export async function resolverComposicao(
  productId: string | null,
  compositionVersionIdCongelada: string | null,
) {
  if (compositionVersionIdCongelada) {
    return prisma.productComposition.findUnique({
      where: { id: compositionVersionIdCongelada },
      include: { items: { include: { inventoryItem: true, unit: true } } },
    });
  }
  if (!productId) return null;
  return prisma.productComposition.findFirst({
    where: { productId, isActive: true },
    orderBy: { version: "desc" },
    include: { items: { include: { inventoryItem: true, unit: true } } },
  });
}

/**
 * Converte a quantidade da ficha para a unidade em que o estoque é contado.
 *
 * A receita pensa em gramas; o estoque conta potes. `contentSize` diz quantas
 * unidades base cabem em uma unidade do item — 1 pote = 500 g. Sem ele, e com
 * unidades diferentes, não há como converter: devolver a quantidade crua faria
 * o sistema consumir 45 potes onde a receita pedia 45 g.
 */
export function converterParaUnidadeBase(
  quantidade: number,
  unitIdDaFicha: string,
  item: { baseUnitId: string; contentSize: unknown | null },
): number {
  if (unitIdDaFicha === item.baseUnitId) return quantidade;
  const conteudo = item.contentSize == null ? null : Number(item.contentSize);
  if (!conteudo || conteudo <= 0) {
    throw new Error(
      "Não é possível converter a unidade da receita para a do estoque: o insumo não tem contentSize definido.",
    );
  }
  return quantidade / conteudo;
}

/**
 * Tudo que um pedido consome, somado por insumo.
 *
 * A soma importa: dois itens diferentes do mesmo pedido podem usar o mesmo
 * ingrediente. Reservar em duas chamadas separadas geraria duas chaves de
 * idempotência para o mesmo par pedido+insumo — e a segunda sobrescreveria ou
 * colidiria com a primeira.
 */
export async function insumosDoPedido(
  itens: Array<{
    productId: string | null;
    quantity: number;
    compositionVersionId: string | null;
  }>,
): Promise<{ insumos: InsumoNecessario[]; porItem: Map<string, string | null> }> {
  const acumulado = new Map<string, InsumoNecessario>();
  const porItem = new Map<string, string | null>();

  for (const item of itens) {
    const composicao = await resolverComposicao(item.productId, item.compositionVersionId);
    porItem.set(item.productId ?? "", composicao?.id ?? null);

    if (composicao && composicao.items.length > 0) {
      for (const ingrediente of composicao.items) {
        const bruta = Number(ingrediente.quantity) * Number(item.quantity);
        const naBase = converterParaUnidadeBase(
          bruta,
          ingrediente.unitId,
          ingrediente.inventoryItem,
        );
        somar(acumulado, {
          inventoryItemId: ingrediente.inventoryItemId,
          unitId: ingrediente.inventoryItem.baseUnitId,
          quantidade: naBase,
        });
      }
      continue;
    }

    // Sem ficha: o produto é o próprio item de estoque (bebida, revenda).
    if (!item.productId) continue;
    const produto = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { inventoryItemId: true, inventoryItem: { select: { baseUnitId: true } } },
    });
    if (produto?.inventoryItemId && produto.inventoryItem) {
      somar(acumulado, {
        inventoryItemId: produto.inventoryItemId,
        unitId: produto.inventoryItem.baseUnitId,
        quantidade: Number(item.quantity),
      });
    }
  }

  /*
   * Ordenado por id: é o que impede deadlock. Duas transações que travam os
   * mesmos dois insumos em ordem inversa esperam uma pela outra para sempre.
   * Ordem estável e igual para todo mundo elimina o ciclo.
   */
  const insumos = [...acumulado.values()].sort((a, b) =>
    a.inventoryItemId.localeCompare(b.inventoryItemId),
  );
  return { insumos, porItem };
}

function somar(mapa: Map<string, InsumoNecessario>, novo: InsumoNecessario) {
  const atual = mapa.get(novo.inventoryItemId);
  if (atual) atual.quantidade += novo.quantidade;
  else mapa.set(novo.inventoryItemId, { ...novo });
}
