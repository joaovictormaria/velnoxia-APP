import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";
import {
  getKanbanMetrics,
  getOrderById,
  listKanbanOrders,
  listPendingOrderIds,
  updateOrderNotes,
} from "../repositories/order-repository";
import { transitionOrderStatus } from "../services/order-service";

const ORDER_STATUS = z.enum([
  "RECEIVED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
]);

export const listKanbanOrdersFn = createServerFn({ method: "GET" })
  .validator(z.object({ date: z.string().optional(), search: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const [columns, metrics] = await Promise.all([
      listKanbanOrders(storeId, data ?? {}),
      getKanbanMetrics(storeId, data?.date),
    ]);
    return { columns, metrics };
  });

export const getOrderFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    return getOrderById(storeId, data.id);
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
