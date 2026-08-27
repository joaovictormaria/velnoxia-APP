import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { insumosDoPedido, resolverComposicao } from "@/server/services/composicao-do-pedido";

/**
 * A ponte entre o andar do pedido e o saldo do estoque.
 *
 * Reserva e consumo resolvem os insumos pela MESMA função. Antes cada um tinha
 * a sua: o consumo expandia a ficha técnica, a reserva olhava só o vínculo
 * direto `Product.inventoryItemId`. Um prato feito por receita não reservava
 * nada — restavam três porções, chegavam oito pedidos, e o sistema aceitava os
 * oito. A cozinha descobria ao montar o sétimo.
 */
export class OrderInventoryHandler {
  /**
   * Pedido recebido: reservar, e congelar a ficha usada.
   *
   * Reserva não tira nada da prateleira — marca que aquele insumo deixou de
   * estar livre para o próximo cliente.
   *
   * Falta de saldo aqui recusa o pedido INTEIRO. É o único momento em que
   * recusar faz sentido: ninguém foi cobrado ainda, e aceitar seria prometer o
   * que não existe.
   */
  static async onOrderReceived(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order?.storeId) return;

    /*
     * Congela a versão da ficha em cada item, antes de qualquer reserva. Do
     * ponto seguinte em diante — consumo, reversão — todo mundo lê daqui, nunca
     * "a ativa agora".
     */
    for (const item of order.items) {
      if (item.compositionVersionId) continue;
      const composicao = await resolverComposicao(item.productId, null);
      if (composicao) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { compositionVersionId: composicao.id },
        });
        item.compositionVersionId = composicao.id;
      }
    }

    const { insumos } = await insumosDoPedido(order.items);
    if (insumos.length === 0) return;

    /*
     * Ou reserva tudo, ou nada. Reservar parcialmente deixaria metade do pedido
     * comprometendo estoque para um prato que não vai sair — e ninguém liberaria
     * essa metade depois.
     */
    try {
      for (const insumo of insumos) {
        await InventoryService.reserveForOrder(
          order.storeId,
          insumo.inventoryItemId,
          insumo.quantidade,
          orderId,
        );
      }
    } catch (erro) {
      await this.desfazerReservas(order.storeId, orderId);
      throw erro;
    }
  }

  /**
   * Pedido em preparo: consumir de verdade.
   *
   * Aqui falta de saldo NÃO recusa. O prato já foi vendido e a cozinha vai
   * montá-lo de qualquer jeito; recusar só faria o sistema perder o registro do
   * que aconteceu. A baixa é gravada, o saldo pode ficar negativo, e o pedido
   * recebe uma marca legível para a contagem física resolver depois.
   */
  static async onOrderPreparing(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order?.storeId) return;

    const { insumos } = await insumosDoPedido(order.items);
    if (insumos.length === 0) return;

    const insuficientes: string[] = [];

    for (const insumo of insumos) {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: insumo.inventoryItemId },
        select: { name: true, quantityOnHand: true },
      });
      if (item && Number(item.quantityOnHand) < insumo.quantidade) {
        insuficientes.push(
          `${item.name} (tinha ${Number(item.quantityOnHand)}, precisou de ${insumo.quantidade.toFixed(4)})`,
        );
      }

      // Libera a reserva e baixa o físico, na mesma passada.
      await this.reverterMovimentos(order.storeId, orderId, ["RESERVATION"], insumo.inventoryItemId);

      await InventoryService.recordMovement(order.storeId, {
        idempotencyKey: `${order.storeId}#ORDER#${orderId}#CONSUMPTION#${insumo.inventoryItemId}`,
        itemId: insumo.inventoryItemId,
        type: "CONSUMPTION",
        quantity: -insumo.quantidade,
        unitId: insumo.unitId,
        reference: orderId,
        referenceType: "ORDER",
        /*
         * O pedido PODE deixar o saldo negativo, e diz isso de propósito.
         *
         * Antes a permissão vinha do tipo do movimento — todo `CONSUMPTION`
         * podia. Aí a produção passou a gravar `CONSUMPTION` também, e herdava
         * uma permissão que não é dela: produzir é ato planejado, com um
         * humano na frente da tela, e recusar ainda é possível. Aqui não: o
         * prato foi vendido e a cozinha já usou. Recusar não devolveria o
         * ingrediente, só apagaria o registro de que ele saiu.
         */
        permitirSaldoNegativo: true,
        authorType: "SYSTEM",
        authorId: "ORDER",
        authorName: `Pedido #${order.number}`,
      } as any);
    }

    if (insuficientes.length > 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          inventoryInconsistentAt: new Date(),
          inventoryInconsistency:
            `Baixa feita com saldo insuficiente: ${insuficientes.join("; ")}. ` +
            `O estoque ficou negativo e precisa de contagem física.`,
        },
      });
    }
  }

  /** Estoque já saiu no preparo. Concluir não move nada. */
  static async onOrderCompleted(_orderId: string) {}

  /**
   * Pedido cancelado: devolver o que foi tirado.
   *
   * Reverte em ordem inversa à criação, e a reversão agora repõe o saldo de
   * verdade — antes ela gravava o movimento na trilha e não devolvia nada,
   * porque o cálculo do delta não tinha caso para REVERSAL.
   */
  static async onOrderCancelled(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { storeId: true },
    });
    if (!order?.storeId) return;
    await this.reverterMovimentos(order.storeId, orderId, ["RESERVATION", "CONSUMPTION"]);
  }

  /** Desfaz só as reservas — usado quando a reserva falha no meio. */
  private static async desfazerReservas(storeId: string, orderId: string) {
    await this.reverterMovimentos(storeId, orderId, ["RESERVATION"]);
  }

  /**
   * Reverte os movimentos de um pedido que ainda não foram revertidos.
   *
   * O `originalMovementId @unique` do banco é quem garante que nada seja
   * revertido duas vezes; a consulta por `reversedBy` só evita o erro.
   */
  private static async reverterMovimentos(
    storeId: string,
    orderId: string,
    tipos: string[],
    itemId?: string,
  ) {
    const movimentos = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        reference: orderId,
        referenceType: "ORDER",
        type: { in: tipos as any },
        ...(itemId ? { itemId } : {}),
        reversedBy: { is: null },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const movimento of movimentos) {
      await InventoryService.recordMovement(storeId, {
        idempotencyKey: `${storeId}#REVERSAL#${movimento.id}`,
        itemId: movimento.itemId,
        type: "REVERSAL",
        quantity: Number(movimento.quantity) * -1,
        unitId: movimento.unitId,
        originalMovementId: movimento.id,
        reference: orderId,
        referenceType: "ORDER",
        /*
         * Explícito pelo mesmo motivo do consumo, e não por simetria vazia:
         * desfazer um consumo REPÕE saldo, mas se o item já estava negativo o
         * saldo continua negativo depois da reposição. Sem esta permissão, um
         * cancelamento sobre estoque negativo seria recusado — e o pedido
         * ficaria cancelado com o consumo dele ainda de pé.
         */
        permitirSaldoNegativo: true,
        authorType: "SYSTEM",
        authorId: "ORDER",
        authorName: "Reversão automática",
      } as any);
    }
  }

  /** Traduz o status do pedido no efeito correspondente sobre o estoque. */
  static async syncOrderStatus(orderId: string, newStatus: string) {
    switch (newStatus) {
      case "RECEIVED":
        return this.onOrderReceived(orderId);
      case "PREPARING":
        return this.onOrderPreparing(orderId);
      case "COMPLETED":
        return this.onOrderCompleted(orderId);
      case "CANCELLED":
        return this.onOrderCancelled(orderId);
      default:
        return;
    }
  }
}
