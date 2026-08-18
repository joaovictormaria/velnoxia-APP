import { prisma } from "../db/client";
import { distanciaEmMetros } from "../../lib/distance";

/** Depois disso a última posição não vale mais: celular no bolso ou tela
 *  bloqueada faz o sistema cortar os envios, e mostrar um número velho como se
 *  fosse de agora é pior que admitir que não se sabe. */
const POSICAO_VALIDA_POR_SEGUNDOS = 120;

export type ResultadoDaDistancia =
  | { ok: true; metros: number; courierName: string; atualizadoHaSegundos: number }
  | { ok: false; motivo: "indisponivel" | "sem-sinal" };

/**
 * A que distância o entregador está de quem pede.
 *
 * A conta fica no servidor de propósito: assim as coordenadas do entregador
 * nunca chegam ao navegador do cliente — ele recebe só o número, e não teria
 * como localizar o trabalhador. As coordenadas de quem pergunta são usadas aqui
 * e descartadas; nada delas é guardado.
 */
export async function distanciaDoEntregador(
  trackingToken: string,
  cliente: { latitude: number; longitude: number },
): Promise<ResultadoDaDistancia> {
  const order = await prisma.order.findUnique({
    where: { trackingToken },
    select: {
      status: true,
      courier: {
        select: {
          name: true,
          location: { select: { latitude: true, longitude: true, updatedAt: true } },
        },
      },
    },
  });

  // Token errado, pedido que ainda não saiu e pedido sem entregador respondem
  // igual: nenhum tem distância para dar, e distingui-los diria a quem estivesse
  // testando tokens que aquele pedido existe.
  if (!order || order.status !== "OUT_FOR_DELIVERY" || !order.courier) {
    return { ok: false, motivo: "indisponivel" };
  }

  const posicao = order.courier.location;
  if (!posicao) return { ok: false, motivo: "sem-sinal" };

  const idadeEmSegundos = (Date.now() - posicao.updatedAt.getTime()) / 1000;
  if (idadeEmSegundos > POSICAO_VALIDA_POR_SEGUNDOS) {
    return { ok: false, motivo: "sem-sinal" };
  }

  return {
    ok: true,
    metros: distanciaEmMetros(posicao, cliente),
    courierName: order.courier.name,
    atualizadoHaSegundos: Math.round(idadeEmSegundos),
  };
}
