import { prisma } from "../db/client";

/** Orders that never became revenue should not count as spending. */
const PAID_STATUSES = ["RECEIVED", "PREPARING", "OUT_FOR_DELIVERY", "COMPLETED"] as const;

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

/**
 * The list the owner sees. Counts and totals are computed from the orders
 * themselves rather than kept on the customer row — a denormalised total drifts
 * the first time an order is cancelled, and nothing here is hot enough to need
 * it.
 */
export async function listCustomers(
  storeId: string,
  search?: string,
): Promise<CustomerListItem[]> {
  const term = search?.trim();
  const customers = await prisma.customer.findMany({
    where: {
      storeId,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              // Whoever searches types the phone with punctuation or without;
              // stored numbers have none, so the digits are what we compare.
              { phone: { contains: term.replace(/\D/g, "") || term } },
            ],
          }
        : {}),
    },
    include: {
      orders: {
        select: { total: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return customers.map((c) => {
    const pagos = c.orders.filter((o) =>
      (PAID_STATUSES as readonly string[]).includes(o.status),
    );
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      createdAt: c.createdAt,
      orderCount: c.orders.length,
      totalSpent: Math.round(pagos.reduce((sum, o) => sum + o.total, 0) * 100) / 100,
      lastOrderAt: c.orders[0]?.createdAt ?? null,
    };
  });
}

export function countCustomers(storeId: string) {
  return prisma.customer.count({ where: { storeId } });
}
