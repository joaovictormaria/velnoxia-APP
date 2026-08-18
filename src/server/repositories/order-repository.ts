import type { OrderStatus } from "@prisma/client";
import { prisma } from "../db/client";

/**
 * Local-day window for a "YYYY-MM-DD" string (or now, when omitted).
 *
 * `new Date("2026-08-15")` parses as UTC midnight, which in UTC-3 lands on the
 * previous local day — so the whole window would be shifted by one day. Build
 * the date from its parts instead, which the Date constructor reads as local.
 */
function dayRange(day?: string) {
  const base = (() => {
    if (!day) return new Date();
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date);
  })();

  const from = new Date(base);
  from.setHours(0, 0, 0, 0);
  const to = new Date(base);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

const KANBAN_STATUSES: OrderStatus[] = [
  "RECEIVED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
];

/** Board data: a capped page per column plus the true total for "+ N pedidos". */
export async function listKanbanOrders(
  storeId: string,
  options: { date?: string; search?: string; perColumn?: number },
) {
  const perColumn = options.perColumn ?? 8;
  const { from, to } = dayRange(options.date);
  const search = options.search?.trim();

  const where = {
    storeId,
    createdAt: { gte: from, lte: to },
    ...(search
      ? {
          OR: [
            { customerName: { contains: search, mode: "insensitive" as const } },
            { customerPhone: { contains: search.replace(/\D/g, "") || search } },
            ...(Number.isFinite(Number(search)) ? [{ number: Number(search) }] : []),
          ],
        }
      : {}),
  };

  const columns = await Promise.all(
    KANBAN_STATUSES.map(async (status) => {
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: { ...where, status },
          orderBy: { createdAt: "desc" },
          take: perColumn,
          include: {
            items: {
              select: { productNameSnapshot: true, quantity: true, sizeLabel: true },
            },
            // The card shows the discount, so it needs to know which coupon was
            // used and how much it took off.
            coupon: { select: { code: true } },
          },
        }),
        prisma.order.count({ where: { ...where, status } }),
      ]);
      return { status, orders, total };
    }),
  );

  return columns;
}

export function getOrderById(storeId: string, id: string) {
  return prisma.order.findFirst({
    where: { id, storeId },
    include: {
      items: { include: { extras: true, product: { select: { imageUrl: true } } } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      coupon: { select: { code: true } },
      customer: { select: { id: true, createdAt: true, _count: { select: { orders: true } } } },
    },
  });
}

/** Ids of RECEIVED orders, so the admin can pop a dialog for unseen ones. */
export function listPendingOrderIds(storeId: string) {
  const { from, to } = dayRange();
  return prisma.order.findMany({
    where: { storeId, status: "RECEIVED", createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, createdAt: true },
  });
}

export function updateOrderNotes(
  storeId: string,
  id: string,
  data: { customerNote?: string; internalNote?: string },
) {
  return prisma.order.update({ where: { id, storeId }, data });
}

/** Footer metrics of the Kanban board. */
export async function getKanbanMetrics(storeId: string, date?: string) {
  const { from, to } = dayRange(date);

  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: from, lte: to } },
    select: {
      status: true,
      createdAt: true,
      type: true,
      statusHistory: { select: { status: true, createdAt: true } },
    },
  });

  const total = orders.length;
  const completed = orders.filter((o) => o.status === "COMPLETED").length;

  function averageMinutes(fromStatus: OrderStatus | "CREATED", toStatus: OrderStatus): number | null {
    const spans: number[] = [];
    for (const order of orders) {
      const start =
        fromStatus === "CREATED"
          ? order.createdAt
          : order.statusHistory.find((h) => h.status === fromStatus)?.createdAt;
      const end = order.statusHistory.find((h) => h.status === toStatus)?.createdAt;
      if (start && end && end > start) {
        spans.push((end.getTime() - start.getTime()) / 60_000);
      }
    }
    if (!spans.length) return null;
    return Math.round(spans.reduce((a, b) => a + b, 0) / spans.length);
  }

  return {
    totalOrders: total,
    avgPrepMinutes: averageMinutes("CREATED", "PREPARING"),
    avgDeliveryMinutes: averageMinutes("OUT_FOR_DELIVERY", "COMPLETED"),
    completionRate: total === 0 ? null : Math.round((completed / total) * 100),
  };
}
