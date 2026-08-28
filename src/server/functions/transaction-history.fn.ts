import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { decimalToNumber } from "@/server/utils/decimal-converter";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import type { Apuracao } from "@/lib/regra-financeira";

/**
 * O extrato de transações da loja.
 *
 * O CUSTO VINHA DE UM CAMPO QUE NINGUÉM ESCREVE. A versão anterior lia
 * `OrderItem.unitCost` — que existe no schema e não é gravado em lugar nenhum
 * do sistema. O resultado era determinístico, não intermitente: `cost` dava
 * sempre zero, `profit` dava sempre o valor integral da venda, e a coluna Lucro
 * exibia 100% de margem em verde para todo pedido, todos os dias. Era uma
 * TERCEIRA fonte de custo, incompatível com as outras duas.
 *
 * Agora o custo vem do mesmo carregador dos KPIs, com o mesmo recorte.
 *
 * A LISTA TEM DUAS METADES, e a diferença entre elas é o assunto da tela:
 *
 *   reconhecidas   pedidos COMPLETED. São receita, têm custo e lucro, e são
 *                  datadas pela COMPETÊNCIA — quando a venda se realizou.
 *
 *   em andamento   pedidos ainda em preparo ou a caminho. Aparecem porque a
 *                  tela também serve para acompanhar o dia, mas NÃO exibem
 *                  lucro: sob a regra financeira eles ainda não são receita, e
 *                  mostrar margem neles criaria um terceiro número de
 *                  faturamento discordando dos relatórios e do painel.
 *
 * Cancelados ficam de fora dos dois grupos. Eles nunca foram receita — e é por
 * isso que o estorno some daqui: `refund` só é gravado ao cancelar um pedido
 * pago, então a versão anterior exibia uma linha negativa cuja venda nunca
 * tinha aparecido, e o extrato fechava negativo sozinho.
 */

/** Status que significam "ainda está acontecendo". */
const EM_ANDAMENTO = ["RECEIVED", "PREPARING", "TABLE_READY", "OUT_FOR_DELIVERY"] as const;

export type Transacao = {
  id: string;
  orderId: string;
  orderNumber: number;
  type: "SALE";
  amount: number;
  /** `null` enquanto a venda não é reconhecida ou o custo não é apurado. */
  cost: number | null;
  profit: number | null;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: Date;
  customerName: string | null;
  /** Se este valor já conta como receita sob a regra financeira. */
  reconhecida: boolean;
  apuracao: Apuracao | null;
  notes?: string;
};

export const getTransactionHistory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      days: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }): Promise<Transacao[]> => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    const days = data.days || 30;
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - days);

    const [reconhecidos, emAndamento] = await Promise.all([
      InventoryCostService.pedidosReconhecidos(store.id, inicio, fim),
      prisma.order.findMany({
        where: {
          storeId: store.id,
          deletedAt: null,
          status: { in: EM_ANDAMENTO as unknown as string[] as any },
          createdAt: { gte: inicio, lte: fim },
        },
        select: {
          id: true,
          number: true,
          createdAt: true,
          total: true,
          customerName: true,
          paymentMethod: true,
          paymentStatus: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    /*
     * Os dados de cabeçalho dos pedidos reconhecidos vêm numa consulta à parte
     * porque o carregador devolve o que a REGRA precisa — receita, custo,
     * apuração — e não o que a tela mostra. Buscar por id evita repetir o
     * recorte e evita um N+1.
     */
    const cabecalhos = reconhecidos.length
      ? await prisma.order.findMany({
          where: { id: { in: reconhecidos.map((p) => p.id) } },
          select: {
            id: true,
            number: true,
            customerName: true,
            paymentMethod: true,
            paymentStatus: true,
          },
        })
      : [];
    const porId = new Map(cabecalhos.map((c) => [c.id, c]));

    const vendas: Transacao[] = reconhecidos.map((pedido) => {
      const cab = porId.get(pedido.id);
      /*
       * Custo e lucro da FATIA APURADA. Um pedido misto mostra o que foi
       * medido, e o rótulo `PARCIAL` avisa que aquilo não cobre a venda toda —
       * melhor do que esconder a linha inteira ou fingir que cobre.
       */
      const temApuracao = pedido.receitaApurada > 0;
      return {
        id: pedido.id,
        orderId: pedido.id,
        orderNumber: cab?.number ?? 0,
        type: "SALE",
        amount: pedido.receita,
        /*
         * `null`, nunca zero. Zero afirmaria que a venda não custou nada — foi
         * exatamente essa afirmação que pintava a coluna Lucro de verde para
         * produtos que nunca foram ligados ao estoque.
         */
        cost: temApuracao ? pedido.custoApurado : null,
        profit: temApuracao ? pedido.receitaApurada - pedido.custoApurado : null,
        paymentMethod: cab?.paymentMethod ?? "Não informado",
        paymentStatus: cab?.paymentStatus ?? "PENDING",
        createdAt: pedido.competencia,
        customerName: cab?.customerName ?? null,
        reconhecida: true,
        apuracao: pedido.apuracao,
      };
    });

    const pendentes: Transacao[] = emAndamento.map((order) => ({
      id: order.id,
      orderId: order.id,
      orderNumber: order.number,
      type: "SALE",
      amount: decimalToNumber(order.total),
      cost: null,
      profit: null,
      paymentMethod: order.paymentMethod || "Não informado",
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      customerName: order.customerName,
      reconhecida: false,
      apuracao: null,
      notes: "Receita ainda não reconhecida",
    }));

    return [...vendas, ...pendentes].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  });
