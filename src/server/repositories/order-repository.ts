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
  const now = new Date();

  const local = (() => {
    if (!day) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date);
  })();

  const offset = local.getTimezoneOffset() * 60 * 1000;
  const fromMs = local.getTime() - offset;
  const toMs = fromMs + 24 * 60 * 60 * 1000 - 1;

  console.log(`dayRange(${day}): offset=${offset}, from=${new Date(fromMs).toISOString()}, to=${new Date(toMs).toISOString()}`);

  return { from: new Date(fromMs), to: new Date(toMs) };
}

const KANBAN_STATUSES: OrderStatus[] = [
  "RECEIVED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
];

/**
 * A ordem dentro de cada coluna, que não é a mesma para todas.
 *
 * As três primeiras são fila de trabalho: quem chegou primeiro fica em cima,
 * e o pedido novo entra por baixo. Antes era o inverso, e isso empurrava para
 * o topo justamente o pedido que podia esperar, enquanto quem já estava há
 * vinte minutos descia a cada pedido que entrava.
 *
 * Finalizados é o oposto porque não é fila, é histórico: ali ninguém tem nada
 * a fazer, e o que se procura é o pedido que acabou de sair — que deve estar
 * no topo, e não no fim de uma lista que só cresce.
 *
 * A ordem também decide o que o `take` corta. Na fila, sobra de fora quem
 * chegou por último; no histórico, o mais antigo.
 */
function ordemDaColuna(status: OrderStatus): "asc" | "desc" {
  return status === "COMPLETED" ? "desc" : "asc";
}

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
          orderBy: { createdAt: ordemDaColuna(status) },
          take: perColumn,
          include: {
            items: {
              select: { productNameSnapshot: true, quantity: true, sizeLabel: true },
            },
            // The card shows the discount, so it needs to know which coupon was
            // used and how much it took off.
            coupon: { select: { code: true } },
            // Depois de despachado o cartão mostra quem levou, senão o dono
            // teria de abrir o pedido só para lembrar a quem entregou.
            courier: { select: { name: true } },
          },
        }),
        prisma.order.count({ where: { ...where, status } }),
      ]);
      return { status, orders, total };
    }),
  );

  /**
   * Pedidos prontos parados por falta de entregador. Vêm fora das colunas e
   * inteiros, sem a paginação de 8: é uma fila que precisa ser zerada, e um
   * pedido escondido atrás de um "+ 3 pedidos" é justamente o que esfria.
   */
  const awaiting = await prisma.order.findMany({
    where: { ...where, status: "PREPARING", awaitingCourierSince: { not: null } },
    orderBy: { awaitingCourierSince: "asc" },
    select: {
      id: true,
      number: true,
      customerName: true,
      total: true,
      awaitingCourierSince: true,
      deliveryNeighborhood: true,
    },
  });

  /*
   * Numa loja que só faz retirada, "Saiu p/ entrega" é uma coluna que nunca
   * sai de zero — ocupa espaço e sugere um passo do fluxo que não existe ali.
   *
   * A exceção existe porque a configuração pode ser desligada com pedido já a
   * caminho: some a coluna e o pedido fica sem onde ser finalizado. Enquanto
   * houver alguém na rua, ela continua na tela.
   */
  const settings = await prisma.storeSettings.findUnique({
    where: { storeId },
    select: { acceptsDelivery: true },
  });
  const naRua = columns.find((c) => c.status === "OUT_FOR_DELIVERY")?.total ?? 0;
  const mostrarEntrega = (settings?.acceptsDelivery ?? true) || naRua > 0;

  return { columns, awaiting, mostrarEntrega };
}

/** Mesas abertas agrupadas por tableId com todos seus pedidos */
export async function listMesasAbertas(
  storeId: string,
  options: { date?: string; search?: string },
) {
  const { from, to } = dayRange(options.date);
  const search = options.search?.trim();

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: "TABLE_READY" as const,
      tableId: { not: null },
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
    },
    orderBy: { createdAt: "asc" },
    include: {
      items: {
        select: {
          productNameSnapshot: true,
          quantity: true,
          sizeLabel: true,
          unitPrice: true,
        },
      },
      coupon: { select: { code: true } },
    },
  });

  // Buscar números das mesas
  const tableIds = Array.from(new Set(orders.map((o) => o.tableId!)));
  const tables = await prisma.table.findMany({
    where: { id: { in: tableIds } },
    select: { id: true, number: true },
  });
  const tableNumberMap = new Map(tables.map((t) => [t.id, t.number]));

  // Agrupar por tableId
  const mesasMap = new Map<string, typeof orders>();
  for (const order of orders) {
    const tableId = order.tableId!;
    if (!mesasMap.has(tableId)) {
      mesasMap.set(tableId, []);
    }
    mesasMap.get(tableId)!.push(order);
  }

  // Transformar em array com dados agregados
  const mesas = Array.from(mesasMap.entries()).map(([tableId, pedidos]) => ({
    tableId,
    tableNumber: tableNumberMap.get(tableId) ?? 0,
    pedidos,
    totalPedidos: pedidos.length,
    totalValor: pedidos.reduce((sum, p) => sum + p.total, 0),
  }));

  return mesas;
}

export function getOrderById(storeId: string, id: string) {
  return prisma.order.findFirst({
    where: { id, storeId },
    include: {
      items: { include: { extras: true, product: { select: { imageUrl: true } } } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      coupon: { select: { code: true } },
      courier: { select: { id: true, name: true } },
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
