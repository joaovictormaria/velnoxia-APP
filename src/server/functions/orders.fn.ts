// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
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
    const { storeId } = await requireAdminSession();
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
    const { storeId } = await requireAdminSession();
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
    const { storeId } = await requireAdminSession();
    const maxTable = await prisma.table.findFirst({
      where: { storeId },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    return (maxTable?.number ?? 0) + 1;
  });

export const listTablesFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { storeId } = await requireAdminSession();
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
    const { storeId } = await requireAdminSession();
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
export const dispatchOrderFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), courierId: z.string() }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    return dispatchOrder(admin.storeId, data.id, data.courierId, {
      authorType: "ADMIN",
      authorName: admin.name,
    });
  });

/** Marca (ou desmarca) que o pedido estÃ¡ pronto esperando quem o leve. */
export const setOrderAwaitingCourierFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), awaiting: z.boolean() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
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

    // Verificar que o pedido pertence à loja
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, storeId },
      select: { id: true, paymentStatus: true, status: true, tableId: true },
    });

    if (!order) {
      return { ok: false as const, error: "Pedido não encontrado" };
    }

    if (order.paymentStatus === "PAID") {
      return { ok: false as const, error: "Pedido já foi marcado como pago" };
    }

    // Marcar como pago e completed (libera a mesa)
    await prisma.order.update({
      where: { id: data.orderId },
      data: {
        paymentStatus: "PAID",
        status: "COMPLETED", // Auto-complete quando pagamento confirmado
      },
    });

    // Se é um pedido de mesa, fechar a sessão e liberar a mesa
    if (order.tableId) {
      // Fechar a sessão da mesa
      await prisma.tableSession.updateMany({
        where: {
          tableId: order.tableId,
          status: "OPEN",
        },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
        },
      });

      // Liberar a mesa (voltar ao status AVAILABLE)
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: "AVAILABLE" },
      });
    }

    return { ok: true as const };
  });

