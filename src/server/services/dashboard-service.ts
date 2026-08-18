import type { OrderStatus } from "@prisma/client";
import { prisma } from "../db/client";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

async function summaryForRange(storeId: string, from: Date, to: Date) {
  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
    select: { total: true },
  });
  const count = orders.length;
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);
  return {
    count,
    revenue,
    averageTicket: count === 0 ? 0 : revenue / count,
  };
}

export async function getDashboardSummary(storeId: string, reference = new Date()) {
  const todayStart = startOfDay(reference);
  const todayEnd = endOfDay(reference);
  const yesterdayStart = startOfDay(addDays(reference, -1));
  const yesterdayEnd = endOfDay(addDays(reference, -1));

  const [today, yesterday, ratingToday, ratingYesterday] = await Promise.all([
    summaryForRange(storeId, todayStart, todayEnd),
    summaryForRange(storeId, yesterdayStart, yesterdayEnd),
    prisma.review.aggregate({
      _avg: { rating: true },
      where: { storeId, createdAt: { lte: todayEnd } },
    }),
    prisma.review.aggregate({
      _avg: { rating: true },
      where: { storeId, createdAt: { lte: yesterdayEnd } },
    }),
  ]);

  const avgRating = ratingToday._avg.rating ?? 0;
  const avgRatingYesterday = ratingYesterday._avg.rating ?? 0;

  return {
    orders: { value: today.count, change: percentChange(today.count, yesterday.count) },
    revenue: { value: today.revenue, change: percentChange(today.revenue, yesterday.revenue) },
    averageTicket: {
      value: today.averageTicket,
      change: percentChange(today.averageTicket, yesterday.averageTicket),
    },
    rating: {
      value: avgRating,
      change: Math.round((avgRating - avgRatingYesterday) * 10) / 10,
    },
  };
}

export async function getOrdersByStatus(storeId: string, reference = new Date()) {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: { storeId, createdAt: { gte: startOfDay(reference), lte: endOfDay(reference) } },
  });

  const counts = new Map<OrderStatus, number>(
    grouped.map((g) => [g.status, g._count._all]),
  );

  return {
    received: counts.get("RECEIVED") ?? 0,
    preparing: counts.get("PREPARING") ?? 0,
    outForDelivery: counts.get("OUT_FOR_DELIVERY") ?? 0,
    completed: counts.get("COMPLETED") ?? 0,
  };
}

export async function getOrdersByHour(storeId: string, reference = new Date()) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startOfDay(reference), lte: endOfDay(reference) },
      status: { not: "CANCELLED" },
    },
    select: { createdAt: true },
  });

  const buckets = new Map<number, number>();
  for (const order of orders) {
    const hour = order.createdAt.getHours();
    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }

  // Janela fixa 8h-23h, igual ao gráfico do mockup.
  return Array.from({ length: 16 }, (_, i) => {
    const hour = i + 8;
    return { hour, label: `${String(hour).padStart(2, "0")}h`, orders: buckets.get(hour) ?? 0 };
  });
}

export async function getTopProducts(storeId: string, reference = new Date(), limit = 6) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productNameSnapshot"],
    _sum: { quantity: true },
    where: {
      order: {
        storeId,
        createdAt: { gte: startOfDay(reference), lte: endOfDay(reference) },
        status: { not: "CANCELLED" },
      },
    },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  return grouped.map((g, index) => ({
    rank: index + 1,
    name: g.productNameSnapshot,
    quantity: g._sum.quantity ?? 0,
  }));
}

export async function getDashboardData(storeId: string, reference = new Date()) {
  const [summary, byStatus, byHour, topProducts] = await Promise.all([
    getDashboardSummary(storeId, reference),
    getOrdersByStatus(storeId, reference),
    getOrdersByHour(storeId, reference),
    getTopProducts(storeId, reference),
  ]);
  return { summary, byStatus, byHour, topProducts };
}
