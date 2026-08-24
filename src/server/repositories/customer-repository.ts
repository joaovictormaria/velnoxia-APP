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
  /**
   * O que essa pessoa mais pede, do que pede mais para o que pede menos.
   *
   * Vem do nome gravado no item do pedido, e não do produto de hoje: o
   * cardápio muda, produtos são renomeados e apagados, e a ficha do cliente
   * precisa continuar dizendo o que ele comprou de fato naquele dia.
   */
  favoritos: { nome: string; vezes: number }[];
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
        select: {
          total: true,
          status: true,
          createdAt: true,
          items: { select: { productNameSnapshot: true, quantity: true } },
        },
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
    /*
     * Só os pedidos que viraram venda entram no "o que mais pede": um pedido
     * cancelado é o que a pessoa desistiu de comprar, e sugerir isso a ela no
     * balcão seria o contrário do que a ficha serve.
     */
    const vezesPorProduto = new Map<string, number>();
    for (const pedido of pagos) {
      for (const item of pedido.items) {
        const atual = vezesPorProduto.get(item.productNameSnapshot) ?? 0;
        vezesPorProduto.set(item.productNameSnapshot, atual + item.quantity);
      }
    }

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      createdAt: c.createdAt,
      orderCount: c.orders.length,
      totalSpent: Math.round(pagos.reduce((sum, o) => sum + Number(o.total), 0) * 100) / 100,
      lastOrderAt: c.orders[0]?.createdAt ?? null,
      favoritos: [...vezesPorProduto.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        .slice(0, 4)
        .map(([nome, vezes]) => ({ nome, vezes })),
    };
  });
}

export function countCustomers(storeId: string) {
  return prisma.customer.count({ where: { storeId } });
}
