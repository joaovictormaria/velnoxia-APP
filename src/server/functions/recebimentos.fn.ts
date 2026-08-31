import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { RecebimentosService } from "@/server/services/recebimentos-service";
import { aceitarComPagamentoEmAberto } from "@/server/services/aceitar-fiado";
import { numeros } from "./serializar";

/**
 * A porta HTTP da venda a prazo.
 *
 * O RECORTE DE LOJA VEM SEMPRE DA SESSÃO. Nenhuma destas funções aceita
 * `storeId` do cliente — não há nem campo para isso no validador. É a mesma
 * regra do resto do financeiro, e aqui ela é mais crítica: `Order.storeId` não
 * tem foreign key em produção, então a checagem da aplicação é a única que
 * existe. O serviço repete a verificação na consulta, de propósito.
 *
 * RECEBER E ESTORNAR NÃO TOCAM ESTOQUE. Dinheiro é operação financeira; quem
 * mexe no razão é o `status` do pedido, por outro caminho.
 *
 * `abrirFiadoFn` é a exceção, e ela COMPÕE duas operações em vez de misturá-las:
 * marca o pagamento pelo serviço financeiro, e depois chama o MESMO
 * `transitionOrderStatus` do botão "Colocar na fila". Não há segunda lógica de
 * estoque — há a de sempre, chamada de outro lugar.
 */

const METODOS = z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH", "PAYROLL"]);

/** O autor da ação, para a dívida ter a quem perguntar depois. */
function autorDaSessao(admin: { id: string; name: string; email: string }) {
  return { id: admin.id, name: admin.name, email: admin.email };
}

/**
 * "Pagamento outro dia": aceita o pedido, põe na fila e deixa a cobrança em
 * aberto.
 *
 * A COMPOSIÇÃO NÃO MORA AQUI — mora em `@/server/services/aceitar-fiado`, e o
 * porquê está escrito lá: um `export` comum dentro de um `.fn.ts` arrasta os
 * imports do arquivo (repositórios, Prisma) para o bundle do NAVEGADOR e
 * derruba toda tela que importe este módulo. Aqui ficam só server functions.
 *
 * O balcão chama exatamente a mesma função de serviço, para o fiado registrado
 * lá virar a MESMA dívida, na MESMA aba, pelo MESMO caminho deste botão.
 */
export const abrirFiadoFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string(),
      note: z.string().max(500).optional(),
      dueAt: z.string().datetime().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const r = await aceitarComPagamentoEmAberto(
      admin.storeId,
      data.orderId,
      autorDaSessao(admin),
      { note: data.note ?? null, dueAt: data.dueAt ? new Date(data.dueAt) : null },
    );
    if (!r.ok) return { ok: false as const, error: r.error };
    return { ok: true as const, ...numeros(r.dados), aviso: r.aviso };
  });

/**
 * Registra dinheiro recebido.
 *
 * NÃO reusa `confirmPaymentFn` de propósito: aquela função empurra o status do
 * pedido, e PREPARING é onde a reserva vira consumo. Receber um fiado por ali
 * gravaria baixa de estoque na data do pagamento.
 */
export const receberPagamentoFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string(),
      amount: z.number().positive(),
      method: METODOS,
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const r = await RecebimentosService.receberPagamento(
      admin.storeId,
      data.orderId,
      { amount: data.amount, method: data.method, note: data.note ?? null },
      autorDaSessao(admin),
    );
    return r.ok ? { ok: true as const, ...numeros(r.dados) } : { ok: false as const, error: r.erro };
  });

/** Estorna um recebimento. A linha fica; só sai do saldo. */
export const estornarPagamentoFn = createServerFn({ method: "POST" })
  .validator(z.object({ paymentId: z.string(), reason: z.string().min(1).max(500) }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const r = await RecebimentosService.estornarPagamento(
      admin.storeId,
      data.paymentId,
      data.reason,
      autorDaSessao(admin),
    );
    return r.ok ? { ok: true as const, ...numeros(r.dados) } : { ok: false as const, error: r.erro };
  });

/**
 * As contas em aberto — fonte do indicador e da tela.
 *
 * Calculado na hora. Uma dívida aberta é um ESTADO, não um evento: gravar uma
 * notificação por dia empilharia avisos repetidos da mesma conta, e some
 * sozinho quando alguém paga.
 */
export const getPagamentosEmAbertoFn = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    const admin = await requireAdminSession();
    return numeros(await RecebimentosService.pagamentosEmAberto(admin.storeId));
  });

/** O dinheiro que entrou no período, agrupado pela data do PAGAMENTO. */
export const getRecebimentosFn = createServerFn({ method: "POST" })
  .validator(z.object({ days: z.number().int().positive().optional() }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const dias = data.days || 30;
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - dias);
    return numeros(
      await RecebimentosService.recebimentosNoPeriodo(admin.storeId, inicio, fim),
    );
  });
