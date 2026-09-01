import type { OrderStatus } from "@prisma/client";
import { prisma } from "../db/client";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  convertOrderForClient,
  convertOrderItemsForClient,
  decimalToNumber,
} from "../utils/decimal-converter";

const SAO_PAULO_TZ = "America/Sao_Paulo";

/**
 * Day-range in São Paulo timezone, respecting DST (Daylight Saving Time).
 *
 * Converts YYYY-MM-DD string to UTC range that covers that entire calendar day
 * in São Paulo time, accounting for DST transitions (UTC-3 in winter, UTC-2 in summer).
 *
 * Example:
 *   dayRange("2026-08-24") in August (winter, UTC-3):
 *   → from: 2026-08-24T03:00:00Z
 *   → to:   2026-08-25T02:59:59Z
 *
 *   dayRange("2026-01-24") in January (summer, UTC-2):
 *   → from: 2026-01-24T02:00:00Z
 *   → to:   2026-01-25T01:59:59Z
 */
function dayRange(day?: string) {
  const dateStr = day || new Date().toISOString().split("T")[0];
  const [year, month, date] = dateStr.split("-").map(Number);

  // Create a date at midnight in São Paulo timezone
  // fromZonedTime: converts local (SP) time to UTC
  const startOfDayUtc = fromZonedTime(
    new Date(year, month - 1, date, 0, 0, 0, 0),
    SAO_PAULO_TZ
  );

  // End of day: 23:59:59.999 in São Paulo timezone
  const endOfDayUtc = fromZonedTime(
    new Date(year, month - 1, date, 23, 59, 59, 999),
    SAO_PAULO_TZ
  );

  return { from: startOfDayUtc, to: endOfDayUtc };
}

const KANBAN_STATUSES: OrderStatus[] = [
  "RECEIVED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "TABLE_READY",
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
    /*
     * FIADO NÃO APARECE NO KANBAN — em coluna nenhuma.
     *
     * O quadro é a fila de trabalho. Um pedido com pagamento em aberto tem
     * pendência FINANCEIRA, e financeiro tem tela própria: enquanto houver
     * saldo, ele vive em "Pagamentos em aberto" e no indicador do topo.
     *
     * NO WHERE BASE, e não por coluna. É o que garante que RECEIVED,
     * PREPARING, OUT_FOR_DELIVERY e COMPLETED sumam pela mesma regra — e que
     * a LISTA e o CONTADOR de cada coluna concordem, já que os dois partem
     * daqui.
     *
     * Some do quadro, não do banco: o pedido continua inteiro, com histórico,
     * estoque consumido e receita reconhecida. Volta a aparecer quando o
     * cliente paga.
     */
    paymentStatus: { not: "OPEN" as const },
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
      // O recorte de fiado já mora no `where` base, acima: aqui cada coluna
      // só acrescenta o próprio status.
      const recorte = { ...where, status };

      const [ordersRaw, total] = await Promise.all([
        prisma.order.findMany({
          where: recorte,
          orderBy: { createdAt: ordemDaColuna(status) },
          take: perColumn,
          select: {
            id: true,
            number: true,
            customerName: true,
            customerPhone: true,
            status: true,
            type: true,
            createdAt: true,
            total: true,
            discount: true,
            deliveryFee: true,
            subtotal: true,
            sessionId: true,
            tableId: true,
            paymentStatus: true,
            paymentMethod: true,
            awaitingCourierSince: true,
            deliveryNeighborhood: true,
            items: {
              select: { productNameSnapshot: true, quantity: true, sizeLabel: true },
            },
            coupon: { select: { code: true } },
            courier: { select: { name: true } },
            table: { select: { number: true } },
          },
        }),
        prisma.order.count({ where: recorte }),
      ]);
      const orders = ordersRaw.map((order) => convertOrderForClient(order));
      return { status, orders, total };
    }),
  );

  /**
   * Pedidos prontos parados por falta de entregador. Vêm fora das colunas e
   * inteiros, sem a paginação de 8: é uma fila que precisa ser zerada, e um
   * pedido escondido atrás de um "+ 3 pedidos" é justamente o que esfria.
   */
  const awaitingRaw = await prisma.order.findMany({
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

  const awaiting = awaitingRaw.map((order) =>
    convertOrderForClient(order)
  );

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
    select: { acceptsDelivery: true, autoPrintEnabled: true },
  });
  const naRua = columns.find((c) => c.status === "OUT_FOR_DELIVERY")?.total ?? 0;
  const mostrarEntrega = (settings?.acceptsDelivery ?? true) || naRua > 0;

  /*
   * A COMANDA SÓ SAI SE A LOJA PEDIU.
   *
   * `autoPrintEnabled` existe desde sempre, nasce `false` e ninguém o
   * consultava: o quadro chamava `window.print()` ao aceitar o pedido em
   * qualquer loja, inclusive nas que tinham a impressão automática desligada.
   * Vinha daqui junto com `mostrarEntrega` para não custar consulta nova.
   *
   * Padrão `false` quando não há settings: uma loja sem configuração não
   * deve receber um diálogo de impressão que ninguém pediu.
   */
  const imprimirAoAceitar = settings?.autoPrintEnabled ?? false;

  return { columns, awaiting, mostrarEntrega, imprimirAoAceitar };
}

/** Mesas abertas agrupadas por tableId com todos seus pedidos */
export async function listMesasAbertas(
  storeId: string,
  options: { date?: string; search?: string },
) {
  const { from, to } = dayRange(options.date);
  const search = options.search?.trim();

  const ordersRaw = await prisma.order.findMany({
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

  const orders = ordersRaw.map((order) => ({
    ...convertOrderForClient(order),
    items: convertOrderItemsForClient(order.items),
  }));

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
    totalValor: pedidos.reduce((sum, p) => sum + decimalToNumber(p.total), 0),
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

/**
 * A partir de quantos minutos um pedido PAGO parado vira alerta.
 *
 * Pagamento confirmado é compromisso com o cliente. Quinze minutos sem ninguém
 * aceitar já é atraso perceptível num restaurante — e é metade da expiração de
 * reserva, de propósito: o aviso aparece bem antes de o caso virar problema de
 * estoque.
 *
 * Constante para poder subir se a operação da cozinha for mais lenta. Alerta
 * que fica sempre aceso deixa de ser lido.
 */
export const MINUTOS_PARA_ALERTAR_PAGO_PARADO = 15;

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

  /*
   * PEDIDOS PAGOS QUE NINGUÉM ACEITOU.
   *
   * O cliente pagou e o pedido continua em RECEIVED: a cozinha não começou. É
   * só um AVISO — não cancela nada, não libera reserva, não toca no estoque.
   * A expiração automática ignora pedidos pagos de propósito, porque cancelar
   * quem pagou significaria estornar dinheiro por demora da casa.
   *
   * Consulta própria, e não derivada do `orders` acima: aquele recorta pelo
   * DIA, e um pedido pago ontem e esquecido é exatamente o que mais precisa
   * aparecer.
   */
  const paidWaitingSince = new Date(
    Date.now() - MINUTOS_PARA_ALERTAR_PAGO_PARADO * 60_000,
  );
  const paidWaiting = await prisma.order.count({
    where: {
      storeId,
      status: "RECEIVED",
      paymentStatus: "PAID",
      createdAt: { lt: paidWaitingSince },
    },
  });

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
    /** Quantos pedidos pagos esperam início do preparo. Só informativo. */
    paidWaiting,
    paidWaitingMinutes: MINUTOS_PARA_ALERTAR_PAGO_PARADO,
  };
}

/**
 * Os ultimos pedidos que entraram, para o painel.
 *
 * SELECT PROPRIO, e nao `listKanbanOrders`: aquele monta o quadro inteiro —
 * todas as colunas, itens, extras, entregador — e o painel precisa de cinco
 * linhas com numero, cliente, quantos itens e o status. Recarregando a cada
 * oito segundos, a diferenca deixa de ser detalhe.
 *
 * NENHUM VALOR EM DINHEIRO no retorno. O painel fica aberto o dia todo, muitas
 * vezes com o cliente do outro lado do balcao, e o total do pedido nao ajuda
 * ninguem a decidir o que fazer agora.
 *
 * Cancelados ficam de fora: a lista existe para mostrar o que esta acontecendo,
 * e um pedido cancelado nao pede acao nenhuma.
 */
export async function pedidosRecentes(storeId: string, limite = 5) {
  const pedidos = await prisma.order.findMany({
    where: {
      storeId,
      deletedAt: null,
      status: { not: "CANCELLED" },
      // Mesma regra da barra de operação: fiado não é pedido operacional, e
      // listá-lo aqui o faria parecer trabalho pendente da cozinha.
      paymentStatus: { not: "OPEN" as const },
    },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      number: true,
      customerName: true,
      status: true,
      createdAt: true,
      // `_count` em vez de trazer as linhas: o painel mostra "2 itens", nao os itens.
      _count: { select: { items: true } },
    },
  });

  return pedidos.map((p) => ({
    id: p.id,
    numero: p.number,
    cliente: p.customerName,
    status: p.status,
    criadoEm: p.createdAt,
    itens: p._count.items,
  }));
}
