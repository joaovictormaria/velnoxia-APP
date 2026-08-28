import { prisma } from "@/server/db/client";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { transitionOrderStatus } from "@/server/services/order-service";

/**
 * Reservas de pedidos abandonados voltam para a prateleira.
 *
 * NASCEU DE ESTOQUE QUE NÃO VOLTAVA. A reserva é criada quando o pedido é
 * confirmado e só é liberada quando o pedido anda — para PREPARING, virando
 * consumo, ou para CANCELLED, virando devolução. Um pedido que fica parado em
 * RECEIVED sem pagar nunca dispara nenhum dos dois, e o estoque continua
 * comprometido para sempre.
 *
 * Antes isso era um número errado num relatório. Depois que o cardápio passou a
 * esconder o botão de comprar quando `disponível <= 0`, virou outra coisa: um
 * cliente que monta o carrinho e some tira o produto do ar para todo mundo.
 *
 * A LIBERAÇÃO PASSA PELO CAMINHO DE SEMPRE — cancelar o pedido, que dispara o
 * REVERSAL. Nada aqui escreve em `quantityReserved`: esse campo tem um único
 * ponto de escrita no sistema, sob lock, e abrir um segundo seria trocar um
 * problema visível por um invisível.
 */

/**
 * Quanto tempo um pedido pode ficar parado antes de a reserva voltar.
 *
 * Trinta minutos é onde "o cliente está decidindo" vira "o cliente foi embora".
 * Curto demais cancelaria quem foi buscar o cartão; longo demais deixa a
 * prateleira travada por quem nunca vai voltar.
 */
export const MINUTOS_ATE_EXPIRAR = 30;

const INTERVALO_DA_VARREDURA_MS = 5 * 60_000;

export type ResultadoDaExpiracao = {
  pedidosExpirados: string[];
  reservasEncontradas: number;
};

/**
 * Uma passada: acha reservas velhas, cancela os pedidos, libera o estoque.
 *
 * IDEMPOTENTE POR CONSTRUÇÃO, em três camadas que já existiam:
 *
 *   1. `reversedBy: null` na busca — o que já voltou não aparece;
 *   2. a checagem de status ANTES de agir, relida do banco;
 *   3. a chave `store#REVERSAL#{id}`, que é `@unique` — duas execuções
 *      simultâneas disputam o índice e a segunda recebe o que a primeira
 *      gravou, em vez de descontar de novo.
 *
 * Por isso não há lock distribuído nem trava de "job rodando": duas instâncias
 * varrendo ao mesmo tempo produzem o mesmo resultado que uma.
 *
 * `agora` é injetável para o teste poder envelhecer uma reserva sem esperar
 * meia hora.
 */
export async function expirarReservasVencidas(
  agora: Date = new Date(),
): Promise<ResultadoDaExpiracao> {
  const limite = new Date(agora.getTime() - MINUTOS_ATE_EXPIRAR * 60_000);

  /*
   * A busca é pelo MOVIMENTO, não pelo pedido: é o `createdAt` da reserva que
   * marca quando o estoque foi comprometido. Um pedido pode ter sido criado
   * antes e reservado depois, e é a reserva que importa aqui.
   */
  const reservas = await prisma.inventoryMovement.findMany({
    where: {
      type: "RESERVATION",
      referenceType: "ORDER",
      createdAt: { lt: limite },
      reversedBy: { is: null },
      reference: { not: null },
    },
    select: { reference: true, storeId: true },
  });

  const resultado: ResultadoDaExpiracao = {
    pedidosExpirados: [],
    reservasEncontradas: reservas.length,
  };
  if (reservas.length === 0) return resultado;

  // Um pedido pode ter várias reservas; cancelar uma vez resolve todas.
  const porPedido = new Map<string, string>();
  for (const r of reservas) {
    if (r.reference) porPedido.set(r.reference, r.storeId);
  }

  for (const [orderId, storeId] of porPedido) {
    /*
     * O status é RELIDO agora, e não veio da busca acima.
     *
     * Entre encontrar a reserva e agir sobre ela, o pedido pode ter sido pago
     * no balcão, preparado pela cozinha ou cancelado por alguém. Expirar em
     * cima de um pedido que andou seria desfazer trabalho alheio.
     */
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, paymentStatus: true },
    });
    if (!pedido) continue;

    // Só o abandonado: recebido e não pago. Pago não expira, mesmo parado —
    // ali o dinheiro entrou e o problema é de outra natureza.
    if (pedido.status !== "RECEIVED" || pedido.paymentStatus !== "PENDING") {
      continue;
    }

    const transicao = await transitionOrderStatus(storeId, orderId, "CANCELLED", {
      authorType: "SYSTEM",
      note: `Reserva expirada após ${MINUTOS_ATE_EXPIRAR} minutos sem pagamento`,
    } as any);
    if (!transicao.ok) continue;

    /*
     * O efeito no estoque é ESPERADO, não deixado para depois.
     * `transitionOrderStatus` dispara o sync sem `await`; numa varredura que
     * termina e some, isso deixaria a liberação no ar.
     */
    await OrderInventoryHandler.syncOrderStatus(orderId, "CANCELLED");
    resultado.pedidosExpirados.push(orderId);
  }

  return resultado;
}

/*
 * UM INTERVALO POR PROCESSO.
 *
 * O guard em `globalThis` é o mesmo padrão de `db/client.ts`, e existe pelo
 * mesmo motivo: em desenvolvimento o HMR reavalia o módulo a cada troca, e sem
 * ele cada recarga somaria mais um intervalo até haver dezenas varrendo juntos.
 *
 * `unref()` segue o precedente de `rate-limit.ts` — a varredura não pode ser o
 * motivo de o processo se recusar a encerrar.
 *
 * Nada é guardado em memória entre passadas: se o processo reiniciar, a
 * varredura seguinte encontra as reservas velhas do mesmo jeito, porque o
 * critério é o `createdAt` que está no banco.
 */
const globalParaExpiracao = globalThis as unknown as {
  intervaloDeExpiracao: ReturnType<typeof setInterval> | undefined;
};

export function iniciarExpiracaoDeReservas(): void {
  if (globalParaExpiracao.intervaloDeExpiracao) return;

  const intervalo = setInterval(() => {
    expirarReservasVencidas().catch((erro) => {
      // Uma passada que falha não pode derrubar o processo; a próxima tenta de
      // novo sobre o mesmo estado, porque nada foi consumido.
      console.error("[estoque] varredura de reservas expiradas falhou", erro);
    });
  }, INTERVALO_DA_VARREDURA_MS);

  intervalo.unref?.();
  globalParaExpiracao.intervaloDeExpiracao = intervalo;
}
