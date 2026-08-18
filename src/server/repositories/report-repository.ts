import { prisma } from "../db/client";

/** A cancelled order is not revenue. Every number here excludes it. */
const FATURADO = ["RECEIVED", "PREPARING", "OUT_FOR_DELIVERY", "COMPLETED"] as const;

export function periodStart(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

const faturados = (storeId: string, from: Date) => ({
  storeId,
  createdAt: { gte: from },
  status: { in: [...FATURADO] },
});

/**
 * Headline numbers plus a daily series for the chosen window, and the same
 * window immediately before it so the screen can say whether things are going
 * up or down. A number with nothing to compare against tells the owner very
 * little.
 */
export async function salesOverview(storeId: string, days: number) {
  const from = periodStart(days);
  const previousFrom = periodStart(days * 2);

  const [orders, previous, cancelled] = await Promise.all([
    prisma.order.findMany({
      where: faturados(storeId, from),
      select: { total: true, createdAt: true, type: true, paymentMethod: true },
    }),
    prisma.order.findMany({
      where: { ...faturados(storeId, previousFrom), createdAt: { gte: previousFrom, lt: from } },
      select: { total: true },
    }),
    prisma.order.count({
      where: { storeId, createdAt: { gte: from }, status: "CANCELLED" },
    }),
  ]);

  const revenue = round(orders.reduce((s, o) => s + o.total, 0));
  const previousRevenue = round(previous.reduce((s, o) => s + o.total, 0));

  // One bucket per day, zeros included: a chart that skips quiet days draws a
  // busier store than the real one.
  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    byDay.set(d.toISOString().slice(0, 10), { orders: 0, revenue: 0 });
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue = round(bucket.revenue + o.total);
    }
  }

  return {
    revenue,
    orderCount: orders.length,
    averageTicket: orders.length ? round(revenue / orders.length) : 0,
    cancelled,
    previousRevenue,
    previousOrderCount: previous.length,
    series: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    byOrderType: tally(orders.map((o) => o.type)),
    byPaymentMethod: tally(orders.map((o) => o.paymentMethod)),
  };
}

/** What sold, by quantity and by how much it brought in. */
export async function productReport(storeId: string, days: number) {
  const from = periodStart(days);
  const items = await prisma.orderItem.findMany({
    where: { order: faturados(storeId, from) },
    select: { productNameSnapshot: true, quantity: true, unitPrice: true },
  });

  const map = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const i of items) {
    const cur = map.get(i.productNameSnapshot) ?? { name: i.productNameSnapshot, quantity: 0, revenue: 0 };
    cur.quantity += i.quantity;
    cur.revenue = round(cur.revenue + i.unitPrice * i.quantity);
    map.set(i.productNameSnapshot, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function tally(values: string[]) {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

const round = (v: number) => Math.round(v * 100) / 100;
