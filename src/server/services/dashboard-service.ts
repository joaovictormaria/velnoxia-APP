import type { OrderStatus } from "@prisma/client";
import { prisma } from "../db/client";
import { estaAbertoAgora, horasDoGrafico, rotuloDaHora } from "./janela-do-grafico";
import { getKanbanMetrics, pedidosRecentes } from "../repositories/order-repository";

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

/*
 * As funções de contagem deste arquivo usam `status != CANCELLED`, e não a
 * regra financeira de venda reconhecida, de propósito. Pico de movimento por
 * hora e ranking de produtos são perguntas OPERACIONAIS — quanta gente
 * trabalha às 20h, o que a cozinha precisa ter pronto. Um pedido em preparo
 * conta para as duas, e recortá-lo por regra financeira responderia a
 * pergunta errada.
 *
 * O faturamento que morava aqui foi removido junto com `summary`: o painel
 * não mostra dinheiro, e calcular e enviar o que ninguém lê custava quatro
 * agregações a cada recarga de 8 segundos.
 */
export async function getOrdersByStatus(storeId: string, reference = new Date()) {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: { storeId, createdAt: { gte: startOfDay(reference), lte: endOfDay(reference) } },
  });

  const counts = new Map<OrderStatus, number>(
    grouped.map((g) => [g.status, g._count._all]),
  );

  /*
   * O TOTAL SAI DAQUI, e não de uma consulta nova: o `groupBy` acima já trouxe
   * todos os status do dia, inclusive os que este retorno não nomeia.
   *
   * Ele existe porque o painel precisa de "quantos pedidos entraram hoje", e o
   * número que estava sendo usado vinha do resumo financeiro — que seguia a
   * regra de venda reconhecida (COMPLETED). Às 11h, com vinte
   * pedidos na casa e três entregues, o painel dizia três.
   *
   * Cancelados ficam de fora: entraram e saíram, e contá-los faria o movimento
   * do dia parecer maior do que a cozinha viu.
   */
  let total = 0;
  for (const g of grouped) {
    if (g.status !== "CANCELLED") total += g._count._all;
  }

  return {
    received: counts.get("RECEIVED") ?? 0,
    preparing: counts.get("PREPARING") ?? 0,
    outForDelivery: counts.get("OUT_FOR_DELIVERY") ?? 0,
    completed: counts.get("COMPLETED") ?? 0,
    total,
  };
}

/** O enum do banco na ordem do getDay() do JavaScript, que começa no domingo. */
const DIAS_DA_SEMANA = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export async function getOrdersByHour(storeId: string, reference = new Date()) {
  const [orders, settings] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: startOfDay(reference), lte: endOfDay(reference) },
        status: { not: "CANCELLED" },
      },
      select: { createdAt: true },
    }),
    /*
     * O horário do dia que está sendo mostrado, e não um dia qualquer: uma
     * padaria que abre 5h de semana e 7h no domingo tem gráficos diferentes,
     * e mostrar a janela errada faz parecer que faltou movimento.
     */
    prisma.storeSettings.findUnique({
      where: { storeId },
      select: {
        openingHours: {
          where: { weekday: DIAS_DA_SEMANA[reference.getDay()] },
          select: { isOpen: true, opensAt: true, closesAt: true },
        },
      },
    }),
  ]);

  const buckets = new Map<number, number>();
  for (const order of orders) {
    const hour = order.createdAt.getHours();
    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }

  return horasDoGrafico(settings?.openingHours[0] ?? null, [...buckets.keys()]).map((hour) => ({
    hour,
    label: rotuloDaHora(hour),
    orders: buckets.get(hour) ?? 0,
  }));
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

/**
 * Quantos produtos do cardápio estão indisponíveis agora.
 *
 * MESMA REGRA DA VITRINE, do outro lado do balcão. `listMenuForStorefront`
 * decide o `esgotado` de cada produto para o cliente; aqui o dono precisa do
 * número. Manter as duas leituras iguais é o que impede o painel de dizer que
 * está tudo bem enquanto o cardápio esconde três itens.
 *
 * `disponivel = quantityOnHand - quantityReserved`: o que outro cliente já
 * separou não está à venda, mesmo ainda estando na prateleira. Produto sem
 * vínculo com estoque nunca esgota — ausência de vínculo é "não controlo", não
 * "acabou".
 */
async function contarProdutosEsgotados(storeId: string) {
  const produtos = await prisma.product.findMany({
    where: {
      storeId,
      deletedAt: null,
      isActive: true,
      inventoryItemId: { not: null },
      inventoryItem: { isActive: true },
    },
    select: {
      inventoryItem: { select: { quantityOnHand: true, quantityReserved: true } },
    },
  });

  return produtos.filter((p) => {
    if (!p.inventoryItem) return false;
    const disponivel =
      Number(p.inventoryItem.quantityOnHand) - Number(p.inventoryItem.quantityReserved);
    return disponivel <= 0;
  }).length;
}

/**
 * Itens de estoque abaixo do limite mínimo.
 *
 * Mesma regra de `ProductionService.getLowStockItems`: item SEM limite definido
 * fica de fora, em vez de ser comparado contra zero e virar alarme permanente
 * para todo insumo que a loja nunca configurou.
 */
async function contarEstoqueBaixo(storeId: string) {
  const itens = await prisma.inventoryItem.findMany({
    where: { storeId, isActive: true, minimumThreshold: { not: null } },
    select: { quantityOnHand: true, minimumThreshold: true },
  });

  return itens.filter((i) => Number(i.quantityOnHand) < Number(i.minimumThreshold)).length;
}

export async function getDashboardData(storeId: string, reference = new Date()) {
  /*
   * Tudo em paralelo, de propósito. O painel recarrega a cada 8 segundos; uma
   * consulta serializada aqui vira latência que o dono sente a cada ciclo.
   */
  const [
    byStatus,
    byHour,
    topProducts,
    settings,
    metricas,
    esgotados,
    estoqueBaixo,
    recentes,
  ] = await Promise.all([
    getOrdersByStatus(storeId, reference),
    getOrdersByHour(storeId, reference),
    getTopProducts(storeId, reference),
    prisma.storeSettings.findUnique({
      where: { storeId },
      select: {
        acceptsDelivery: true,
        /*
         * O horário de HOJE, não a semana inteira: é o único de que o painel
         * precisa para dizer se a casa está atendendo neste momento.
         */
        openingHours: {
          where: { weekday: DIAS_DA_SEMANA[reference.getDay()] },
          select: { isOpen: true, opensAt: true, closesAt: true },
        },
      },
    }),
    /*
     * `paidWaiting` já vem daqui com o recorte certo — pago E recebido — e sem
     * seguir o corte do dia: pedido pago ontem e esquecido continua aparecendo,
     * que é justamente quando mais importa.
     */
    getKanbanMetrics(storeId),
    contarProdutosEsgotados(storeId),
    contarEstoqueBaixo(storeId),
    pedidosRecentes(storeId, 5),
  ]);

  /*
   * Numa loja que só faz retirada, "Saiu p/ entrega" é uma coluna que nunca
   * sai de zero — ocupa espaço e sugere um passo do fluxo que não existe ali.
   *
   * A exceção existe porque a configuração pode ser desligada com pedido já a
   * caminho: some a coluna e o pedido fica sem onde ser finalizado. Enquanto
   * houver alguém na rua, ela continua na tela.
   */
  const mostrarEntrega = (settings?.acceptsDelivery ?? true) || byStatus.outForDelivery > 0;

  return {
    byStatus,
    byHour,
    topProducts,
    mostrarEntrega,
    /*
     * O bloco que o painel consome. NADA AQUI É DINHEIRO, e nada em dinheiro
     * sai mais desta função: a tela fica aberta o dia todo, muitas vezes com o
     * cliente do outro lado do balcão. Faturamento, ticket médio e margem
     * vivem em Relatórios, que é a tela que se abre de propósito.
     */
    operacao: {
      pedidosHoje: byStatus.total,
      emPreparo: byStatus.preparing,
      aguardandoRecebimento: metricas.paidWaiting,
      minutosAguardando: metricas.paidWaitingMinutes,
      produtosEsgotados: esgotados,
      estoqueBaixo,
      abertoAgora: estaAbertoAgora(settings?.openingHours[0] ?? null, reference),
    },
    pedidosRecentes: recentes,
  };
}
