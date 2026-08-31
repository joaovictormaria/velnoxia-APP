import type { OrderStatus } from "@prisma/client";
import { statusDoEstoque } from "@/lib/status-do-estoque";
import { prisma } from "../db/client";
import { estaAbertoAgora, horasDoGrafico, rotuloDaHora } from "./janela-do-grafico";
import { getKanbanMetrics, pedidosRecentes } from "../repositories/order-repository";
import { RecebimentosService } from "./recebimentos-service";

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
    where: {
      storeId,
      createdAt: { gte: startOfDay(reference), lte: endOfDay(reference) },
    /*
     * FIADO NÃO É PEDIDO OPERACIONAL.
     *
     * Um pedido com pagamento em aberto já foi feito e já saiu do estoque — o
     * que falta nele é dinheiro, não trabalho. Contá-lo aqui faz a barra
     * anunciar uma fila que a cozinha não tem, e é a mesma razão pela qual ele
     * não aparece no Kanban.
     *
     * Ele não some do sistema: vai para o card "Pagamentos em aberto", ao
     * lado, e volta a contar aqui no instante em que o cliente quita.
     */
    paymentStatus: { not: "OPEN" as const },
    },
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
 * Itens de estoque em alerta.
 *
 * A REGRA MORA EM `statusDoEstoque`, e não mais aqui. Este arquivo tinha uma
 * cópia — `onHand < minimumThreshold` — que era uma das oito espalhadas pelo
 * projeto. Duas mudanças vêm junto com a unificação:
 *
 *   o RESERVADO passa a contar. Dez unidades com oito prometidas deixam duas
 *   livres, e duas livres com mínimo três é alerta.
 *
 *   o filtro `minimumThreshold: { not: null }` SAIU do SQL. Item sem mínimo
 *   continua não virando LOW_STOCK — a função garante isso —, mas agora pode
 *   virar OUT_OF_STOCK, que é o estado de quem simplesmente não tem nada. Antes
 *   ele nem era lido.
 *
 * O contador continua sendo "itens abaixo do mínimo": só LOW_STOCK entra, para
 * não mudar o significado do número que o painel já mostra.
 */
async function contarEstoqueBaixo(storeId: string) {
  const itens = await prisma.inventoryItem.findMany({
    where: { storeId, isActive: true },
    select: { quantityOnHand: true, quantityReserved: true, minimumThreshold: true },
  });

  return itens.filter((i) => statusDoEstoque(i).status === "LOW_STOCK").length;
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
    emAberto,
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
    /*
     * O SALDO VEM DE QUEM JÁ SABE CALCULÁ-LO.
     *
     * `pagamentosEmAberto` é a mesma função que alimenta a tela de
     * recebimentos e o indicador do quadro: total − refund − pagamentos não
     * estornados, com pedido cancelado de fora. Recontar aqui criaria uma
     * segunda regra de saldo, e duas regras divergem no primeiro ajuste.
     */
    RecebimentosService.pagamentosEmAberto(storeId),
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
      /*
       * A ÚNICA COISA EM DINHEIRO NESTA BARRA, e ela está aqui de propósito:
       * é uma cobrança pendente, não faturamento. Sem o valor, "1 em aberto"
       * não diz se vale a pena ligar para o cliente hoje.
       */
      pagamentosEmAberto: emAberto.quantidade,
      valorEmAberto: emAberto.total,
      abertoAgora: estaAbertoAgora(settings?.openingHours[0] ?? null, reference),
    },
    pedidosRecentes: recentes,
  };
}
