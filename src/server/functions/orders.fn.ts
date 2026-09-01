// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { requireAdminSession } from "../auth/session";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { prisma } from "../db/client";
import {
  getKanbanMetrics,
  getOrderById,
  listKanbanOrders,
  listMesasAbertas,
  listPendingOrderIds,
  updateOrderNotes,
} from "../repositories/order-repository";
import {
  dispatchOrder,
  setOrderAwaitingCourier,
  transitionOrderStatus,
} from "../services/order-service";
import {
  convertOrderForClient,
  convertOrderItemsForClient,
  convertCouponForClient,
  decimalToNumber,
} from "../utils/decimal-converter";

const ORDER_STATUS = z.enum([
  "RECEIVED",
  "PREPARING",
  "TABLE_READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
]);

export const listKanbanOrdersFn = createServerFn({ method: "GET" })
  .validator(z.object({ date: z.string().optional(), search: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const [board, metrics] = await Promise.all([
      listKanbanOrders(storeId, data ?? {}),
      getKanbanMetrics(storeId, data?.date),
    ]);

    return {
      columns: board.columns,
      awaiting: board.awaiting,
      mostrarEntrega: board.mostrarEntrega,
      metrics,
    };
  });

export const listMesasAbertasFn = createServerFn({ method: "GET" })
  .validator(z.object({ date: z.string().optional(), search: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("MESAS");
    return listMesasAbertas(storeId, data ?? {});
  });

export const getOrderFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const order = await getOrderById(storeId, data.id);
    if (!order) return null;
    return {
      ...convertOrderForClient(order),
      items: convertOrderItemsForClient(order.items).map((item) => ({
        ...item,
        // Convert extras prices (each extra has a price: Decimal field)
        extras: item.extras?.map((extra: any) => ({
          ...extra,
          price: decimalToNumber(extra.price),
        })) || [],
      })),
      statusHistory: order.statusHistory.map((h) => ({
        ...h,
        createdAt: h.createdAt.toISOString(),
      })),
      coupon: order.coupon ? convertCouponForClient(order.coupon) : null,
      courier: order.courier,
      customer: order.customer
        ? {
            ...order.customer,
            createdAt: order.customer.createdAt.toISOString(),
          }
        : null,
    };
  });

export const updateOrderStatusFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), status: ORDER_STATUS, note: z.string().optional() }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    return transitionOrderStatus(admin.storeId, data.id, data.status, {
      authorType: "ADMIN",
      // Para o estorno de cancelamento saber a quem perguntar depois.
      authorId: admin.id,
      authorName: admin.name,
      note: data.note,
    });
  });

export const updateOrderNotesFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string(),
      customerNote: z.string().optional(),
      internalNote: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const { id, ...notes } = data;
    await updateOrderNotes(storeId, id, notes);
    return { ok: true as const };
  });

/**
 * Feeds the "new order" dialog. Returns today's RECEIVED orders so the client
 * can compare against the ids it already showed.
 */
export const listPendingOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return listPendingOrderIds(storeId);
});

/**
 * Get count of open orders (not COMPLETED) grouped by table ID.
 * Used to show which tables have active orders in the admin mesas page.
 */
export const getTableOrderCountsFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { storeId } = await exigirRecurso("MESAS");
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        tableId: { not: null },
        status: { not: "COMPLETED" },
      },
      include: {
        table: { select: { number: true } },
      },
    });

    const counts = new Map<number, number>();
    for (const order of orders) {
      if (order.tableId !== null && order.table) {
        const tableNumber = order.table.number;
        counts.set(tableNumber, (counts.get(tableNumber) ?? 0) + 1);
      }
    }

    return Object.fromEntries(counts);
  });

export const getNextTableNumberFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { storeId } = await exigirRecurso("MESAS");
    const maxTable = await prisma.table.findFirst({
      where: { storeId },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    return (maxTable?.number ?? 0) + 1;
  });

export const listTablesFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { storeId } = await exigirRecurso("MESAS");
    const tables = await prisma.table.findMany({
      where: { storeId },
      orderBy: { number: "asc" },
      select: { id: true, number: true, qrcodeUrl: true, qrcodeData: true },
    });

    return tables;
  });

export const deleteTableFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("MESAS");
    const table = await prisma.table.findUnique({
      where: { id: data.id },
      select: { storeId: true },
    });

    if (!table || table.storeId !== storeId) {
      return { ok: false as const, error: "Mesa nÃ£o encontrada" };
    }

    await prisma.table.delete({ where: { id: data.id } });
    return { ok: true as const };
  });

// Disabled for now - tableNumber doesn't exist on Order model
// export const getOpenTablesFn = createServerFn({ method: "GET" })
//   .handler(async () => {
//     return [];
//   });

export const markOrderNotificationsReadFn = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await prisma.notification.updateMany({
      where: { storeId, relatedOrderId: data.orderId, isRead: false },
      data: { isRead: true },
    });
    return { ok: true as const };
  });

/**
 * Escolhe o entregador e libera a saÃ­da. Ã‰ a Ãºnica porta para "saiu para
 * entrega" num pedido de entrega â€” o botÃ£o simples do quadro Ã© recusado sem
 * entregador, e Ã© aqui que a escolha acontece.
 */
/*
  ATRIBUIR ENTREGA É GESTÃO DE ENTREGADOR — e só ela é paga aqui.

  O resto deste arquivo continua BASIC: mover pedido no quadro, confirmar
  pagamento, listar mesas. O que exige o módulo avançado é escolher QUEM
  leva, porque o entregador só existe se a loja pôde convidá-lo.
*/
export const dispatchOrderFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), courierId: z.string() }))
  .handler(async ({ data }) => {
    const admin = await exigirRecurso("DELIVERY_AVANCADO");
    return dispatchOrder(admin.storeId, data.id, data.courierId, {
      authorType: "ADMIN",
      authorName: admin.name,
    });
  });

/** Marca (ou desmarca) que o pedido estÃ¡ pronto esperando quem o leve. */
/* Marcar "aguardando entregador" também pressupõe uma frota. */
export const setOrderAwaitingCourierFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), awaiting: z.boolean() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("DELIVERY_AVANCADO");
    return setOrderAwaitingCourier(storeId, data.id, data.awaiting);
  });

/**
 * Confirmar pagamento do pedido manualmente (admin).
 * Marca o pedido como PAID e COMPLETED (libera a mesa).
 *
 * Para pedidos de mesa: fecha a mesa automaticamente
 * Para outros pedidos: marca como concluído
 */
export const confirmPaymentFn = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    console.log(`[CONFIRM PAYMENT] ➜ Received confirmPaymentFn for orderId: ${data.orderId}`);

    // Verificar que o pedido pertence à loja
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, storeId },
      select: { id: true, paymentStatus: true, status: true, tableId: true, sessionId: true },
    });

    console.log(`[CONFIRM PAYMENT] Order details: ${JSON.stringify({ id: order?.id, paymentStatus: order?.paymentStatus, status: order?.status, tableId: order?.tableId, sessionId: order?.sessionId })}`);

    if (!order) {
      console.log(`[CONFIRM PAYMENT] ✗ Order not found for orderId: ${data.orderId}`);
      return { ok: false as const, error: "Pedido não encontrado" };
    }

    if (order.paymentStatus === "PAID") {
      console.log(`[CONFIRM PAYMENT] ✗ Order already paid: ${data.orderId}`);
      return { ok: false as const, error: "Pedido já foi marcado como pago" };
    }

    // Marcar como pago (libera a mesa logo abaixo)
    await prisma.order.update({
      where: { id: data.orderId },
      data: { paymentStatus: "PAID" },
    });

    /*
     * O STATUS ANDA PELA MÁQUINA DE ESTADOS, e não por um salto.
     *
     * Aqui havia `prisma.order.update({ status: "COMPLETED" })` direto. Um
     * pedido em RECEIVED pulava PREPARING inteiro — e PREPARING é onde a
     * reserva é liberada e o consumo é gravado. O resultado era estoque
     * comprometido para sempre num pedido já pago e entregue: reserva presa,
     * material físico intacto, e o produto sumindo do cardápio por causa dela.
     *
     * `transitionOrderStatus` valida cada passo contra ALLOWED_TRANSITIONS e
     * dispara o `orderStatusSync`, que é quem chama o handler de estoque.
     * RECEIVED não vai direto a COMPLETED, então o caminho é percorrido:
     * primeiro PREPARING, depois COMPLETED.
     *
     * Pedido que JÁ passou por PREPARING pula esse passo — `transitionOrderStatus`
     * devolve ok quando o status já é o pedido, e a idempotência dos
     * movimentos cuida de uma confirmação repetida.
     */
    if (order.status === "RECEIVED") {
      const preparando = await transitionOrderStatus(storeId, data.orderId, "PREPARING", {
        authorType: "SYSTEM",
        note: "Consumo do estoque ao confirmar o pagamento",
      });
      if (!preparando.ok) {
        return { ok: false as const, error: preparando.error };
      }

      /*
       * O efeito no estoque é ESPERADO aqui, e não deixado para depois.
       *
       * `transitionOrderStatus` dispara o sync sem `await` — o que serve para
       * a cozinha clicando no painel, mas não aqui: entre marcar PREPARING e
       * marcar COMPLETED não pode haver janela em que a reserva ainda esteja
       * de pé. Confirmar pagamento tem que sair com o estoque já acertado.
       *
       * Chamar de novo é seguro: as chaves de idempotência são determinísticas
       * por pedido e item, e a segunda passagem reconhece o que a primeira
       * gravou em vez de descontar duas vezes.
       */
      await OrderInventoryHandler.syncOrderStatus(data.orderId, "PREPARING");
    }

    const concluindo = await transitionOrderStatus(storeId, data.orderId, "COMPLETED", {
      authorType: "SYSTEM",
      note: "Pagamento confirmado",
    });
    if (!concluindo.ok) {
      return { ok: false as const, error: concluindo.error };
    }

    // Se é um pedido de mesa, fechar a sessão e liberar a mesa
    console.log(`[CONFIRM PAYMENT] Checking for table session: tableId=${order.tableId}, sessionId=${order.sessionId}`);
    if (order.sessionId) {
      console.log(`[CONFIRM PAYMENT] ✓ Found sessionId, closing session ${order.sessionId}`);
      try {
        // Fechar a sessão específica usando sessionId do order
        const sessionUpdate = await prisma.tableSession.update({
          where: { id: order.sessionId },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
          },
        });
        console.log(`[CONFIRM PAYMENT] ✓ Session ${order.sessionId} marked as CLOSED. Updated session: ${JSON.stringify({ id: sessionUpdate.id, status: sessionUpdate.status, closedAt: sessionUpdate.closedAt })}`);

        // Revoke all devices for this session (clean up for new customer)
        console.log(`[CONFIRM PAYMENT] Revoking all devices for session ${order.sessionId}`);
        const devicesRevoked = await prisma.sessionDevice.updateMany({
          where: {
            sessionId: order.sessionId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
        console.log(`[CONFIRM PAYMENT] ✓ Revoked ${devicesRevoked.count} devices for session ${order.sessionId}`);
      } catch (err) {
        console.log(`[CONFIRM PAYMENT] ✗ Error closing session: ${err}`);
      }

      // Liberar a mesa também (voltar ao status AVAILABLE)
      if (order.tableId) {
        try {
          const tableUpdate = await prisma.table.update({
            where: { id: order.tableId },
            data: { status: "AVAILABLE" },
          });
          console.log(`[CONFIRM PAYMENT] ✓ Table ${order.tableId} marked as AVAILABLE. Table status: ${tableUpdate.status}`);
        } catch (err) {
          console.log(`[CONFIRM PAYMENT] ✗ Error updating table: ${err}`);
        }
      }
    } else {
      console.log(`[CONFIRM PAYMENT] ✗ No sessionId - not a table order`);
    }

    console.log(`[CONFIRM PAYMENT] ✓ confirmPaymentFn completed successfully for orderId: ${data.orderId}`);
    return { ok: true as const };
  });

