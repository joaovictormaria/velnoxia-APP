import { prisma } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import {
  converterParaUnidadeBase as converter,
  montarMapaDeConversoes,
  type MapaDeConversoes,
} from "@/lib/conversao-de-unidade";

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
  /*
   * Cliente da transação do chamador. Sem ele a consulta não enxerga o pedido
   * que ainda não commitou, e a reserva no checkout leria um pedido vazio.
   * Ausente, usa o cliente global — o comportamento de sempre.
   */
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;
  if (compositionVersionIdCongelada) {
    return db.productComposition.findUnique({
      where: { id: compositionVersionIdCongelada },
      include: { items: { include: { inventoryItem: true, unit: true } } },
    });
  }
  if (!productId) return null;
  return db.productComposition.findFirst({
    where: { productId, isActive: true },
    orderBy: { version: "desc" },
    include: { items: { include: { inventoryItem: true, unit: true } } },
  });
}

/*
 * A conversão em si mora em `@/lib/conversao-de-unidade`, função pura e sem
 * Prisma, porque o formulário de ficha técnica precisa da MESMA conta para
 * mostrar o custo enquanto a pessoa digita. Reexportada aqui para quem já a
 * importava deste módulo.
 */
export { converterParaUnidadeBase } from "@/lib/conversao-de-unidade";

/**
 * As conversões cadastradas entre unidades, prontas para consulta.
 *
 * Uma consulta por operação, não uma por insumo: a tabela é minúscula e não
 * muda, e ler dentro do laço faria N consultas para uma receita de N linhas.
 */
export async function carregarConversoes(
  tx?: Prisma.TransactionClient,
): Promise<MapaDeConversoes> {
  const linhas = await (tx ?? prisma).inventoryUnitConversion.findMany({
    select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
  });
  return montarMapaDeConversoes(linhas);
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
  /** Transação do chamador, para enxergar o pedido que ainda não commitou. */
  tx?: Prisma.TransactionClient,
): Promise<{ insumos: InsumoNecessario[]; porItem: Map<string, string | null> }> {
  const acumulado = new Map<string, InsumoNecessario>();
  const porItem = new Map<string, string | null>();
  const db = tx ?? prisma;
  const conversoes = await carregarConversoes(tx);

  for (const item of itens) {
    const composicao = await resolverComposicao(
      item.productId,
      item.compositionVersionId,
      tx,
    );
    porItem.set(item.productId ?? "", composicao?.id ?? null);

    if (composicao && composicao.items.length > 0) {
      /*
       * UM NÍVEL, E PARA AQUI. Não é omissão — é a regra.
       *
       * A ficha do produto para no primeiro item ESTOCADO. Se ela aponta para
       * "Molho de tomate", o pedido consome molho e não desce até o tomate,
       * mesmo que o molho tenha receita própria.
       *
       * Quem descer daqui vai contar o insumo duas vezes. O tomate já saiu do
       * estoque quando o molho foi produzido — é isso que a corrida de
       * produção grava. Consumi-lo de novo no pedido tiraria da prateleira um
       * tomate que não está mais lá.
       *
       * A explosão da receita acontece na PRODUÇÃO, nunca no pedido. Duas
       * consequências boas caem daí: o teto de reserva volta a significar algo
       * (você só promete o molho que de fato fez, não o que poderia fazer se
       * alguém parasse tudo para cozinhar), e este laço fica O(1) na
       * profundidade da receita — sem recursão dentro de uma transação que
       * segura travas de estoque.
       */
      for (const ingrediente of composicao.items) {
        const bruta = Number(ingrediente.quantity) * Number(item.quantity);
        const naBase = converter(
          bruta,
          ingrediente.unitId,
          ingrediente.inventoryItem,
          conversoes,
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
    const produto = await db.product.findUnique({
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
