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

export type LinhaDoFuncionario = {
  employeeId: string | null;
  nome: string;
  /** Ainda está no cadastro. Falso quando a ficha foi apagada depois. */
  cadastrado: boolean;
  pedidos: number;
  /** Unidades que saíram dentro da cota. */
  itens: number;
  desconto: number;
  pago: number;
  /** Pedidos em folha ainda não quitados, e quanto somam. */
  emFolha: number;
  pedidosEmFolha: number;
};

/**
 * O que cada funcionário pegou no período, e por quanto.
 *
 * Sai dos pedidos, como todo o resto deste arquivo — o consumo do funcionário
 * é uma venda como outra qualquer, só que marcada. É por isso que o número
 * bate com o faturamento em vez de correr por fora dele.
 *
 * A linha sobrevive à exclusão do cadastro: o nome está copiado no pedido, e o
 * mês passado continua tendo a resposta mesmo depois de a pessoa sair.
 */
export async function employeeReport(
  storeId: string,
  days: number,
): Promise<LinhaDoFuncionario[]> {
  const from = periodStart(days);

  const orders = await prisma.order.findMany({
    where: {
      ...faturados(storeId, from),
      OR: [{ employeeId: { not: null } }, { employeeNameSnapshot: { not: null } }],
    },
    select: {
      employeeId: true,
      employeeNameSnapshot: true,
      employeeDiscount: true,
      total: true,
      paymentMethod: true,
      paymentStatus: true,
      employee: { select: { id: true, name: true } },
      items: { select: { benefitQuantity: true } },
    },
  });

  const porPessoa = new Map<string, LinhaDoFuncionario>();

  for (const pedido of orders) {
    // Sem ficha, agrupa pelo nome copiado: dois pedidos do mesmo ex-funcionário
    // continuam sendo uma linha só.
    const chave = pedido.employeeId ?? `apagado:${pedido.employeeNameSnapshot}`;
    const linha =
      porPessoa.get(chave) ??
      ({
        employeeId: pedido.employeeId,
        nome: pedido.employee?.name ?? pedido.employeeNameSnapshot ?? "Sem nome",
        cadastrado: pedido.employee !== null,
        pedidos: 0,
        itens: 0,
        desconto: 0,
        pago: 0,
        emFolha: 0,
        pedidosEmFolha: 0,
      } satisfies LinhaDoFuncionario);

    linha.pedidos += 1;
    linha.itens += pedido.items.reduce((s, i) => s + i.benefitQuantity, 0);
    linha.desconto += pedido.employeeDiscount;
    linha.pago += pedido.total;
    if (pedido.paymentMethod === "PAYROLL" && pedido.paymentStatus === "PENDING") {
      linha.emFolha += pedido.total;
      linha.pedidosEmFolha += 1;
    }

    porPessoa.set(chave, linha);
  }

  const centavos = (v: number) => Math.round(v * 100) / 100;
  return [...porPessoa.values()]
    .map((l) => ({
      ...l,
      desconto: centavos(l.desconto),
      pago: centavos(l.pago),
      emFolha: centavos(l.emFolha),
    }))
    // Quem mais consumiu primeiro: é a linha sobre a qual o dono tem alguma
    // decisão a tomar.
    .sort((a, b) => b.desconto - a.desconto || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Quita o que estava para descontar em folha.
 *
 * Marca como pagos os pedidos em folha ainda pendentes daquele funcionário —
 * é o registro de que o acerto do mês aconteceu. Sem isto, o valor a descontar
 * cresceria para sempre.
 */
export async function settlePayroll(storeId: string, employeeId: string) {
  const r = await prisma.order.updateMany({
    where: {
      storeId,
      employeeId,
      paymentMethod: "PAYROLL",
      paymentStatus: "PENDING",
      status: { in: [...FATURADO] },
    },
    data: { paymentStatus: "PAID" },
  });
  return r.count;
}

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
