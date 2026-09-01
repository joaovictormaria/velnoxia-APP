import { recursoNoEstado } from "@/lib/planos/resolucao";
import { prisma } from "@/server/db/client";
import { estadoComercialDaLoja, type LojaParaPlano } from "@/server/billing/plano-da-loja";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  O PLANO PERMITE ENTREGAR? — uma pergunta, um lugar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `DELIVERY_BASICO` subiu para o Premium em 01/09/2026, e com ele a entrega em
 * si: receber um pedido com endereço, taxa e prazo. A loja BASIC passou a
 * vender por retirada e balcão.
 *
 * ─── DUAS PERGUNTAS DIFERENTES, E SÓ UMA MUDOU ─────────────────────────────
 *
 *   `settings.acceptsDelivery` → a loja QUER entregar agora? É o interruptor
 *      da vitrine, que o dono desliga quando a fila enche.
 *   este módulo               → o plano dela PERMITE entregar?
 *
 * Misturar as duas apagaria a diferença entre "hoje não estamos entregando" e
 * "seu plano não inclui entrega" — e a segunda é a que se resolve pagando.
 *
 * ─── ONDE ISSO É APLICADO ──────────────────────────────────────────────────
 *
 * Em dois lugares, e cada um responde por uma metade:
 *
 *   `order-service`   recusa o pedido de entrega. É a segurança: vale ainda
 *                     que a vitrine seja contornada.
 *   `store-settings`  apaga `acceptsDelivery` no que a vitrine recebe. É a
 *                     cortesia: o cliente não escolhe uma opção que falharia.
 *
 * ⚠️ `BLOQUEADO` É O ÚNICO QUE DESLIGA. `PERMITIDO` e `INDEFINIDO` passam, e o
 * segundo é a loja legada com a permissão transitória — a mesma regra do
 * servidor, da rota e do menu, para as quatro nunca discordarem.
 */

/** Decide a partir do estado já carregado. Pura, testável sem banco. */
export function entregaLiberadaNoPlano(loja: LojaParaPlano, agora?: Date): boolean {
  return (
    recursoNoEstado(estadoComercialDaLoja(loja, agora), "DELIVERY_BASICO") !== "BLOQUEADO"
  );
}

/** As colunas que decidem o plano. Nenhuma a mais entra na consulta. */
export const CAMPOS_DO_PLANO = {
  status: true,
  trialEndsAt: true,
  paidUntil: true,
  subscriptionStatus: true,
  plan: true,
} as const;

/**
 * A mesma resposta, buscando a loja.
 *
 * Existe para quem só tem o `storeId` em mãos. Quem já carregou a loja — por
 * relação, num `include` — deve usar `entregaLiberadaNoPlano` e evitar a ida
 * a mais ao banco.
 *
 * Loja inexistente devolve `false`: sem loja não há plano, e deixar passar
 * por não achar seria transformar um id errado em permissão.
 */
export async function entregaLiberada(storeId: string): Promise<boolean> {
  const loja = await prisma.store.findUnique({
    where: { id: storeId },
    select: CAMPOS_DO_PLANO,
  });
  if (!loja) return false;
  return entregaLiberadaNoPlano(loja as LojaParaPlano);
}
