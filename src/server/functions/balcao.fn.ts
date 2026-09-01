import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { garantirRecurso } from "@/server/billing/guarda-de-recurso";
import { montarCardapioDoBalcao } from "../services/cardapio-do-balcao";
import { aceitarComPagamentoEmAberto } from "../services/aceitar-fiado";
import {
  createOrderFromCheckout,
  precificarItens,
  type CheckoutItem,
} from "../services/order-service";

/**
 * O BALCÃO — pedido presencial montado por quem atende.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ ESTE ARQUIVO NÃO TEM REGRA DE NEGÓCIO NENHUMA.                        │
 * │                                                                       │
 * │ É uma porta HTTP e nada mais. O cardápio vem das MESMAS consultas que  │
 * │ servem a vitrine; o preço vem da MESMA `precificarItens`; o pedido     │
 * │ nasce do MESMO `createOrderFromCheckout`, com a mesma reserva de       │
 * │ estoque na mesma transação; e o fiado passa pela MESMA composição que  │
 * │ o botão "Pagamento outro dia" do quadro usa.                          │
 * │                                                                       │
 * │ O que distingue um pedido de balcão de um pedido da vitrine é UM       │
 * │ CAMPO: `source = ADMIN`, que já existia no schema. Não há segundo      │
 * │ Order, segundo serviço, segundo estoque, segundo fiado nem segundo     │
 * │ Kanban — depois de criado, o pedido é indistinguível dos outros.       │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ SÓ SERVER FUNCTIONS AQUI DENTRO. Nada de `export function` ou tipo
 * declarado neste arquivo: o bundler substitui um `.fn.ts` de server functions
 * puras por um stub de duzentos bytes no navegador, mas um `export` comum no
 * meio delas o obriga a mandar os imports do arquivo junto — repositórios,
 * Prisma, `node:crypto` — e a tela morre em `ReferenceError: Buffer is not
 * defined`. Os tipos moram em `@/lib/balcao/tipos`; as funções, em serviços.
 */

export const getBalcaoMenuFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return montarCardapioDoBalcao(storeId);
});

const itemSchema = z.object({
  productSlug: z.string().min(1),
  sizeId: z.string().optional(),
  optionIds: z.array(z.string()).max(30).optional(),
  extraIds: z.array(z.string()).max(30).default([]),
  quantity: z.number().int().min(1).max(50),
  note: z.string().max(500).optional(),
});

/**
 * O total do carrinho, calculado por quem calcula o total de qualquer pedido.
 *
 * NÃO HÁ CONTA DE DINHEIRO NA TELA: o carrinho pergunta ao servidor a cada
 * mudança e mostra o que voltou. Uma segunda conta no navegador divergiria da
 * do checkout no primeiro ajuste de regra — e o atendente diria um preço ao
 * cliente e cobraria outro.
 */
export const precificarBalcaoFn = createServerFn({ method: "POST" })
  .validator(z.object({ items: z.array(itemSchema).max(100) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    if (data.items.length === 0) {
      return { ok: true as const, linhas: [], subtotal: 0 };
    }
    const r = await precificarItens(storeId, data.items as CheckoutItem[]);
    if (!r.ok) return { ok: false as const, error: r.error };
    return {
      ok: true as const,
      linhas: r.lines.map((l) => ({
        unitPrice: Number(l.unitPrice),
        quantity: l.quantity,
        extras: l.extras.map((e) => ({
          nome: e.nameSnapshot,
          grupo: e.groupNameSnapshot,
          preco: Number(e.priceSnapshot),
        })),
        extrasTotal:
          Math.round(l.extras.reduce((s, e) => s + Number(e.priceSnapshot), 0) * 100) / 100,
      })),
      subtotal: Number(r.subtotal),
    };
  });

/**
 * Cria o pedido do balcão.
 *
 * TELEFONE OPCIONAL, nome obrigatório: é o que o atendente consegue arrancar
 * de quem está com pressa. Sem telefone o pedido não vira ficha de cliente — o
 * porquê está em `createOrderFromCheckout`, onde o upsert acontece.
 *
 * PAGAR DEPOIS É ORTOGONAL À FORMA DE PAGAMENTO, e não uma forma a mais. O
 * modelo já separa os dois: `paymentMethod` é COMO se paga, `paymentStatus` é
 * SE já pagou. Por isso o atendente escolhe a forma normalmente e marca
 * `fiado` à parte — a dívida registrada guarda a forma combinada, que é o que
 * a tela de cobrança mostra depois.
 */
export const criarPedidoDeBalcaoFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      items: z.array(itemSchema).min(1).max(100),
      customerName: z.string().trim().min(1, "Informe o nome do cliente."),
      customerPhone: z.string().optional(),
      paymentMethod: z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH"]),
      /** "Pagar depois": manda o pedido para o fluxo de fiado já existente. */
      fiado: z.boolean().default(false),
      note: z.string().max(500).optional(),
      customerNote: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    /*
     * ═══ O BALCÃO CONTINUA BASIC; A CAIXINHA "PAGAR DEPOIS" NÃO ═════════
     *
     * Vender no balcão é o coração do plano básico, e gatear esta função
     * inteira tiraria o balcão de quem paga o BASIC. Mas UM dos campos que
     * ela aceita é do módulo pago: `fiado` manda o pedido para o fluxo de
     * contas a receber.
     *
     * A recusa vem ANTES de o pedido nascer, de propósito. Se viesse
     * depois, o pedido já estaria criado e com estoque reservado quando a
     * dívida fosse recusada — o atendente ficaria com um pedido pago-a-ver
     * que ninguém registrou.
     *
     * Esconder a caixinha na tela não basta: um POST montado à mão com
     * `fiado: true` chega aqui do mesmo jeito.
     */
    if (data.fiado) garantirRecurso(admin, "FIADO");

    const criado = await createOrderFromCheckout(admin.storeId, {
      items: data.items as CheckoutItem[],
      customerName: data.customerName,
      customerPhone: data.customerPhone?.trim() ?? "",
      /*
       * RETIRADA, porque é o que de fato acontece: o cliente leva o pedido do
       * balcão. Sem taxa de entrega e sem endereço — os dois campos existem e
       * ficam vazios, como em qualquer retirada.
       */
      type: "PICKUP",
      paymentMethod: data.paymentMethod,
      source: "ADMIN",
      customerNote: data.customerNote,
    });
    if (!criado.ok) return { ok: false as const, error: criado.error };

    /*
     * O FIADO DO BALCÃO É O FIADO DE SEMPRE.
     *
     * Esta é a MESMA função que a server function do botão "Pagamento outro
     * dia" chama: marca `paymentStatus = OPEN` e põe o pedido na fila pelo
     * caminho normal de status. O pedido aparece na aba de pagamentos em
     * aberto porque é isso que `paymentStatus = OPEN` significa — não há
     * segunda lista, segunda dívida nem segundo histórico.
     *
     * E ELE SEGUE PARA PRODUÇÃO: pagar depois é condição financeira, preparar
     * é condição operacional. É a transição para PREPARING, dentro dessa
     * composição, que faz a reserva de estoque virar consumo — igual a
     * qualquer venda.
     *
     * Falhar aqui NÃO desfaz o pedido: ele já existe, já reservou estoque e já
     * está no quadro. O que volta é um aviso, para o atendente saber que a
     * dívida não foi registrada e resolver pelo quadro.
     */
    let aviso: string | null = null;
    if (data.fiado) {
      const f = await aceitarComPagamentoEmAberto(
        admin.storeId,
        criado.orderId,
        { id: admin.id, name: admin.name, email: admin.email },
        { note: data.note ?? "Pedido de balcão com pagamento em aberto" },
      );
      aviso = f.ok
        ? f.aviso
        : `Pedido #${criado.orderNumber} criado, mas o pagamento em aberto não foi registrado: ${f.error}`;
    }

    return {
      ok: true as const,
      orderId: criado.orderId,
      orderNumber: criado.orderNumber,
      total: Number(criado.total),
      aviso,
    };
  });
