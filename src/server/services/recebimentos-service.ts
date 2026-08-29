import { Decimal } from "@prisma/client/runtime/client";
import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AuditService } from "@/server/audit/audit-service";
import { transitionOrderStatus } from "@/server/services/order-service";

/**
 * VENDA A PRAZO E RECEBIMENTO — a metade financeira que faltava.
 *
 * O sistema sempre soube o que foi VENDIDO. Nunca soube o que foi RECEBIDO:
 * `paymentStatus` era um par de estados sem data, e nenhuma linha do motor
 * financeiro o consultava. Este serviço acrescenta o dinheiro; não mexe em
 * nada do que já existia.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ NENHUMA FUNÇÃO DESTE ARQUIVO TOCA ESTOQUE.                            │
 * │                                                                       │
 * │ Nada aqui chama OrderInventoryHandler, InventoryService nem           │
 * │ confirmPaymentFn. A razão é concreta: `confirmPaymentFn` EMPURRA o    │
 * │ status (RECEIVED → PREPARING → COMPLETED), e PREPARING é onde a       │
 * │ reserva vira consumo. Receber um fiado de 28/08 no dia 31/08 por      │
 * │ aquele caminho gravaria consumo de estoque em 31/08 — três dias       │
 * │ depois de a comida ter saído da prateleira.                           │
 * │                                                                       │
 * │ HÁ UMA ESCRITA EM `Order.status`, e só uma: `finalizarSeQuitado`,     │
 * │ chamada quando o último centavo entra. Ela leva o pedido a COMPLETED  │
 * │ por `transitionOrderStatus`, e isso é seguro porque                   │
 * │ `OrderInventoryHandler.onOrderCompleted` é uma FUNÇÃO VAZIA —         │
 * │ concluir um pedido nunca mexeu no razão.                              │
 * │                                                                       │
 * │ Quem consome estoque é PREPARING, uma única vez, quando o fiado é     │
 * │ aceito — pelo mesmo caminho de qualquer venda.                        │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * A VENDA NÃO SE MOVE. `Order.createdAt` e o `OrderStatusHistory` não são
 * escritos em lugar nenhum deste arquivo: a venda de 28/08 continua sendo de
 * 28/08 depois de paga em 31/08. Quem carrega a data do dinheiro é
 * `OrderPayment.paidAt`, que é outro campo em outra tabela.
 */

/**
 * O fuso do relógio de quem opera a loja.
 *
 * Duplicado de `financial-timeline.fn.ts`, onde a mesma constante é privada.
 * Preferi a duplicação a exportá-la de lá: aquele arquivo está na lista de
 * intocáveis desta implementação, e um import novo é uma alteração.
 */
export const FUSO = "America/Sao_Paulo";

/** `AAAA-MM-DD` no fuso da loja — nunca o dia do servidor. */
export function diaLocal(momento: Date): string {
  return momento.toLocaleDateString("en-CA", { timeZone: FUSO });
}

/**
 * Há quantos dias a conta está aberta, contada em VIRADAS DE DIA locais.
 *
 * NÃO É `(agora - desde) / 86400000`. Um fiado aberto às 23h de segunda e
 * conferido às 8h de terça tem NOVE HORAS de diferença e UM dia em aberto — a
 * diferença bruta arredondaria para zero e a conta apareceria como "hoje" no
 * dia seguinte. Quem cobra pensa em dias do calendário, não em múltiplos de
 * 24 horas.
 */
export function diasEmAberto(desde: Date, agora: Date = new Date()): number {
  const a = diaLocal(desde);
  const b = diaLocal(agora);
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  return Math.max(0, Math.round(ms / 86_400_000));
}

export type PagamentoParaSaldo = {
  amount: Prisma.Decimal | number | string;
  reversedAt: Date | null;
};

/**
 * O SALDO É DERIVADO, sempre. Não existe coluna de saldo, e por isso não
 * existe o estado em que ela discorda dos pagamentos.
 *
 *   saldo = total − refund − Σ(pagamentos não estornados)
 *
 * Em `Decimal`, não em `number`: somar dinheiro em ponto flutuante acumula
 * centavos de erro, e uma conta que fecha em R$ 0,0000001 nunca chegaria a
 * `PAID`.
 */
export function saldoDoPedido(pedido: {
  total: Prisma.Decimal | number | string;
  refund?: Prisma.Decimal | number | string | null;
  payments: PagamentoParaSaldo[];
}): Decimal {
  const recebido = pedido.payments
    .filter((p) => p.reversedAt === null)
    .reduce((soma, p) => soma.add(new Decimal(p.amount.toString())), new Decimal(0));

  return new Decimal(pedido.total.toString())
    .minus(new Decimal((pedido.refund ?? 0).toString()))
    .minus(recebido);
}

export type Autor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** O pedido, com o que basta para decidir sobre dinheiro. */
const SELECAO_DO_PEDIDO = {
  id: true,
  number: true,
  storeId: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  total: true,
  refund: true,
  createdAt: true,
  customerName: true,
  openedAt: true,
  openedByName: true,
  openNote: true,
  paymentDueAt: true,
  payments: {
    select: {
      id: true,
      amount: true,
      method: true,
      paidAt: true,
      receivedByName: true,
      reversedAt: true,
      note: true,
    },
    orderBy: { paidAt: "asc" },
  },
} satisfies Prisma.OrderSelect;

export class RecebimentosService {
  /**
   * Marca o pedido como venda a prazo.
   *
   * NÃO MEXE EM `status`, e é isso que mantém as duas coisas separadas:
   * "esse cliente paga depois" não decide se o pedido entra na fila.
   *
   * Uma versão anterior avançava RECEIVED → PREPARING junto. Foi retirada: o
   * botão de pagamento passava a consumir estoque, e recusar o pedido depois
   * disso gerava PERDA em vez de apenas devolver a reserva.
   */
  static async abrirFiado(
    storeId: string,
    orderId: string,
    autor: Autor,
    opcoes: { note?: string | null; dueAt?: Date | null } = {},
  ): Promise<Resultado<{ orderId: string; saldo: number; statusAtual: string }>> {
    const resultado = await prisma.$transaction(async (tx) => {
      // O recorte de loja entra na BUSCA: um id de outra loja simplesmente não
      // é encontrado, em vez de ser encontrado e recusado depois.
      const pedido = await tx.order.findFirst({
        where: { id: orderId, storeId, deletedAt: null },
        select: SELECAO_DO_PEDIDO,
      });
      if (!pedido) return { ok: false as const, erro: "Pedido não encontrado." };

      if (pedido.status === "CANCELLED") {
        return { ok: false as const, erro: "Pedido cancelado não vira fiado." };
      }
      if (pedido.paymentStatus === "PAID") {
        return { ok: false as const, erro: "Este pedido já está pago." };
      }
      if (pedido.paymentStatus === "OPEN") {
        // Idempotente de propósito: dois cliques não são um erro para o
        // operador, e o estado final é o mesmo.
        return {
          ok: true as const,
          dados: {
            orderId,
            saldo: saldoDoPedido(pedido).toNumber(),
            statusAtual: pedido.status,
          },
        };
      }

      const saldo = saldoDoPedido(pedido);
      if (saldo.lte(0)) {
        return { ok: false as const, erro: "Não há saldo a receber neste pedido." };
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: "OPEN",
          openedAt: new Date(),
          openedById: autor.id ?? null,
          openedByName: autor.name ?? null,
          openNote: opcoes.note ?? null,
          paymentDueAt: opcoes.dueAt ?? null,
        },
      });

      await AuditService.log({
        storeId,
        userId: autor.id ?? undefined,
        userEmail: autor.email ?? undefined,
        action: "ABRIR_FIADO",
        resource: "Order",
        resourceId: orderId,
        oldValue: { paymentStatus: pedido.paymentStatus },
        newValue: { paymentStatus: "OPEN", saldo: saldo.toFixed(2) },
        reason: opcoes.note ?? undefined,
      });

      return {
        ok: true as const,
        dados: { orderId, saldo: saldo.toNumber(), statusAtual: pedido.status },
      };
    });

    return resultado;
  }

  /**
   * Registra dinheiro que entrou.
   *
   * A TRAVA CONTRA O CLIQUE DUPLO TEM TRÊS CAMADAS, e a última é a que vale:
   *
   *   1. `FOR UPDATE` no pedido — a segunda requisição espera a primeira
   *   2. saldo recalculado DENTRO da transação, depois da trava
   *   3. `idempotencyKey @unique` — se as duas passarem, o banco recusa a
   *      segunda
   *
   * A terceira existe porque as duas primeiras dependem de o par
   * (mesma linha, mesma transação) se encontrar. O índice único não depende de
   * nada: é o banco dizendo não.
   */
  static async receberPagamento(
    storeId: string,
    orderId: string,
    entrada: { amount: number | string; method: PaymentMethod; note?: string | null; paidAt?: Date },
    autor: Autor,
  ): Promise<Resultado<{ pagamentoId: string; saldo: number; quitado: boolean }>> {
    const valor = new Decimal(entrada.amount.toString());
    if (!valor.isFinite() || valor.lte(0)) {
      return { ok: false, erro: "O valor precisa ser maior que zero." };
    }

    let resultado;
    try {
      resultado = await prisma.$transaction(async (tx) => {
        /*
         * A TRAVA DE LINHA, antes de qualquer leitura que vá virar decisão.
         *
         * Sem ela, duas conferências simultâneas leem o mesmo saldo de R$ 100,
         * as duas aprovam R$ 100, e o pedido recebe R$ 200 por uma venda de
         * R$ 100. `FOR UPDATE` põe a segunda na fila até a primeira terminar,
         * e aí ela relê um saldo que já é zero.
         *
         * O `storeId` entra aqui também: a trava não pode ser a porta que
         * dispensa o recorte de loja.
         */
        const travado = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Order"
          WHERE id = ${orderId} AND "storeId" = ${storeId} AND "deletedAt" IS NULL
          FOR UPDATE`;
        if (travado.length === 0) {
          return { ok: false as const, erro: "Pedido não encontrado." };
        }

        const pedido = await tx.order.findFirstOrThrow({
          where: { id: orderId, storeId },
          select: SELECAO_DO_PEDIDO,
        });

        if (pedido.status === "CANCELLED") {
          return { ok: false as const, erro: "Pedido cancelado não recebe pagamento." };
        }

        const saldoAntes = saldoDoPedido(pedido);
        if (saldoAntes.lte(0)) {
          return { ok: false as const, erro: "Este pedido já está quitado." };
        }
        if (valor.gt(saldoAntes)) {
          return {
            ok: false as const,
            erro: `O valor excede o saldo em aberto (R$ ${saldoAntes.toFixed(2)}).`,
          };
        }

        /*
         * A sequência conta TODOS os pagamentos, inclusive os estornados: a
         * chave identifica a tentativa, não o dinheiro que sobreviveu. Reusar
         * o número de um estorno colidiria com uma linha que continua no banco.
         */
        const sequencia = pedido.payments.length + 1;

        const pagamento = await tx.orderPayment.create({
          data: {
            storeId,
            orderId,
            amount: valor,
            method: entrada.method,
            // A data REAL do dinheiro. O padrão é agora; um recebimento
            // lançado com atraso pode informar quando de fato aconteceu.
            paidAt: entrada.paidAt ?? new Date(),
            receivedById: autor.id ?? null,
            receivedByName: autor.name ?? null,
            note: entrada.note ?? null,
            idempotencyKey: `${storeId}#RECEBIMENTO#${orderId}#${sequencia}`,
          },
          select: { id: true },
        });

        const saldoDepois = saldoAntes.minus(valor);
        const quitado = saldoDepois.lte(0);

        /*
         * SÓ VIRA PAID QUANDO O SALDO ZERA. Pagamento parcial mantém OPEN — e
         * o `status` do pedido não é tocado em nenhum dos dois casos.
         */
        if (quitado) {
          await tx.order.update({
            where: { id: orderId },
            data: { paymentStatus: "PAID" },
          });
        }

        await AuditService.log({
          storeId,
          userId: autor.id ?? undefined,
          userEmail: autor.email ?? undefined,
          action: "RECEBER_PAGAMENTO",
          resource: "Order",
          resourceId: orderId,
          oldValue: { saldo: saldoAntes.toFixed(2), paymentStatus: pedido.paymentStatus },
          newValue: {
            pagamentoId: pagamento.id,
            valor: valor.toFixed(2),
            metodo: entrada.method,
            saldo: saldoDepois.toFixed(2),
            paymentStatus: quitado ? "PAID" : pedido.paymentStatus,
          },
          reason: entrada.note ?? undefined,
        });

        return {
          ok: true as const,
          dados: {
            pagamentoId: pagamento.id,
            saldo: saldoDepois.toNumber(),
            quitado,
            statusAtual: pedido.status,
          },
        };
      });
    } catch (erro) {
      // P2002 = o índice único recusou. É o clique duplo chegando pela segunda
      // vez, e recusar é o comportamento certo.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return { ok: false, erro: "Este pagamento já foi registrado." };
      }
      throw erro;
    }

    /*
     * QUITOU, FECHA O PEDIDO — depois do commit e fora da transacao.
     *
     * Parcial nao entra aqui: continua OPEN, continua invisivel no quadro, e
     * ainda ha o que cobrar.
     */
    if (resultado.ok && resultado.dados.quitado) {
      await this.finalizarSeQuitado(storeId, orderId, resultado.dados.statusAtual, autor);
    }
    return resultado;
  }

  /**
   * Fecha o pedido quando o dinheiro fecha a conta.
   *
   * SÓ NA QUITAÇÃO. Pagamento parcial mantém `OPEN` e o pedido segue invisível
   * no quadro — ainda há o que cobrar.
   *
   * NÃO CONSOME ESTOQUE, e a prova é uma linha:
   * `OrderInventoryHandler.onOrderCompleted` é uma FUNÇÃO VAZIA. Concluir um
   * pedido nunca mexeu no razão; quem mexe é PREPARING, que já aconteceu lá
   * atrás quando o fiado foi aceito.
   *
   * FORA DA TRANSAÇÃO DO PAGAMENTO: `transitionOrderStatus` abre a própria e
   * dispara o sync; aninhar as duas seguraria travas do pedido enquanto outro
   * caminho escreve.
   *
   * Se a transição falhar — um pedido cancelado por outra pessoa no meio — o
   * pagamento já está gravado e não se perde. O dinheiro entrou; o status é
   * consequência.
   */
  private static async finalizarSeQuitado(
    storeId: string,
    orderId: string,
    statusAtual: string,
    autor: Autor,
  ): Promise<void> {
    if (statusAtual === "COMPLETED" || statusAtual === "CANCELLED") return;
    await transitionOrderStatus(storeId, orderId, "COMPLETED", {
      authorType: "ADMIN",
      authorId: autor.id ?? undefined,
      authorName: autor.name ?? undefined,
      note: "Concluído ao quitar o pagamento em aberto",
    } as any);
  }

  /**
   * Estorna um recebimento.
   *
   * NUNCA APAGA. A linha fica com `reversedAt` e sai do saldo por ele — apagar
   * esconderia que o dinheiro entrou e voltou, que é justamente o que a
   * conferência de caixa precisa enxergar.
   *
   * A venda não é tocada: `total`, `createdAt` e o estoque continuam onde
   * estavam. Estornar um recebimento não desfaz um consumo.
   */
  static async estornarPagamento(
    storeId: string,
    pagamentoId: string,
    motivo: string,
    autor: Autor,
  ): Promise<Resultado<{ orderId: string; saldo: number }>> {
    return prisma.$transaction(async (tx) => {
      const pagamento = await tx.orderPayment.findFirst({
        where: { id: pagamentoId, storeId },
        select: { id: true, orderId: true, amount: true, reversedAt: true },
      });
      if (!pagamento) return { ok: false as const, erro: "Pagamento não encontrado." };
      if (pagamento.reversedAt !== null) {
        return { ok: false as const, erro: "Este pagamento já foi estornado." };
      }

      await tx.$queryRaw`
        SELECT id FROM "Order"
        WHERE id = ${pagamento.orderId} AND "storeId" = ${storeId}
        FOR UPDATE`;

      await tx.orderPayment.update({
        where: { id: pagamentoId },
        data: {
          reversedAt: new Date(),
          reversedById: autor.id ?? null,
          reversalReason: motivo,
        },
      });

      const pedido = await tx.order.findFirstOrThrow({
        where: { id: pagamento.orderId, storeId },
        select: SELECAO_DO_PEDIDO,
      });
      const saldo = saldoDoPedido(pedido);

      /*
       * Voltando a haver saldo, a conta volta a ser cobrável. OPEN e não
       * PENDING: a decisão de vender fiado continua valendo — o que mudou é
       * que o dinheiro daquele recebimento não vale mais.
       */
      if (saldo.gt(0) && pedido.paymentStatus === "PAID") {
        await tx.order.update({
          where: { id: pedido.id },
          data: { paymentStatus: "OPEN" },
        });
      }

      await AuditService.log({
        storeId,
        userId: autor.id ?? undefined,
        userEmail: autor.email ?? undefined,
        action: "ESTORNAR_PAGAMENTO",
        resource: "OrderPayment",
        resourceId: pagamentoId,
        oldValue: { valor: pagamento.amount.toString(), reversedAt: null },
        newValue: { saldo: saldo.toFixed(2) },
        reason: motivo,
      });

      return { ok: true as const, dados: { orderId: pedido.id, saldo: saldo.toNumber() } };
    });
  }

  /**
   * As contas em aberto da loja — a fonte do indicador e da tela.
   *
   * CALCULADO NA HORA, e não guardado. Uma dívida em aberto é um ESTADO, não
   * um evento: gravar uma notificação por dia criaria uma fila de avisos
   * repetidos para a mesma conta, e some sozinha quando alguém paga.
   */
  static async pagamentosEmAberto(storeId: string, agora: Date = new Date()) {
    const pedidos = await prisma.order.findMany({
      /*
       * PEDIDO CANCELADO NÃO É DÍVIDA. Sem este filtro, cancelar um fiado
       * deixava a cobrança de pé: o pedido sumia da operação e continuava na
       * lista de quem deve, para sempre.
       */
      where: {
        storeId,
        paymentStatus: "OPEN",
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
      select: SELECAO_DO_PEDIDO,
      orderBy: { openedAt: "asc" },
    });

    const linhas = pedidos.map((p) => {
      const saldo = saldoDoPedido(p);
      const recebido = new Decimal(p.total.toString())
        .minus(new Decimal((p.refund ?? 0).toString()))
        .minus(saldo);
      // A referência de "há quanto tempo" é quando o fiado foi aberto; sem
      // isso, a data da venda.
      const desde = p.openedAt ?? p.createdAt;
      return {
        orderId: p.id,
        numero: p.number,
        cliente: p.customerName,
        dataDaVenda: p.createdAt,
        valorOriginal: new Decimal(p.total.toString()).toNumber(),
        valorPago: recebido.toNumber(),
        saldo: saldo.toNumber(),
        diasEmAberto: diasEmAberto(desde, agora),
        vencimento: p.paymentDueAt,
        abertoPor: p.openedByName,
        abertoEm: p.openedAt,
        observacao: p.openNote,
        /*
         * Os dois já vinham no `select`; faltava devolvê-los.
         *
         * `formaDePagamento` é a que o cliente combinou na venda — não a do
         * recebimento, que só existe quando o dinheiro entra e fica no
         * OrderPayment. E `statusOperacional` é contexto: uma dívida de pedido
         * ainda em preparo se cobra diferente de uma de pedido entregue.
         */
        formaDePagamento: p.paymentMethod,
        statusOperacional: p.status,
      };
    });

    const total = linhas.reduce((s, l) => s + l.saldo, 0);
    return { total, quantidade: linhas.length, linhas };
  }

  /**
   * O DINHEIRO QUE ENTROU NO PERÍODO — a série que não existia.
   *
   * Agrupada por `paidAt`, nunca pela data da venda. É essa separação que faz
   * o relatório de 31/08 mostrar o recebimento de uma venda de 28/08 sem
   * fingir que houve uma venda em 31/08.
   *
   * Estornados ficam de fora do total: o dinheiro voltou.
   */
  static async recebimentosNoPeriodo(storeId: string, inicio: Date, fim: Date) {
    const pagamentos = await prisma.orderPayment.findMany({
      /*
       * O cancelamento já estorna os pagamentos, então `reversedAt` sozinho
       * daria conta. O filtro de status é a segunda linha de defesa: um pedido
       * cancelado por um caminho que escape do gancho não pode voltar a somar
       * dinheiro que não está no caixa.
       */
      where: {
        storeId,
        reversedAt: null,
        paidAt: { gte: inicio, lte: fim },
        order: { status: { not: "CANCELLED" } },
      },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        receivedByName: true,
        note: true,
        order: { select: { id: true, number: true, customerName: true, createdAt: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    let total = 0;
    const porMetodo: Record<string, number> = {};
    const linhas = pagamentos.map((p) => {
      const valor = new Decimal(p.amount.toString()).toNumber();
      total += valor;
      porMetodo[p.method] = (porMetodo[p.method] ?? 0) + valor;
      return {
        pagamentoId: p.id,
        valor,
        metodo: p.method,
        // A data do DINHEIRO...
        recebidoEm: p.paidAt,
        recebidoPor: p.receivedByName,
        observacao: p.note,
        orderId: p.order.id,
        numero: p.order.number,
        cliente: p.order.customerName,
        // ...ao lado da data da VENDA, que continua sendo outra coisa.
        dataDaVenda: p.order.createdAt,
      };
    });

    return { total, quantidade: linhas.length, porMetodo, linhas };
  }
}

export { PaymentStatus };
