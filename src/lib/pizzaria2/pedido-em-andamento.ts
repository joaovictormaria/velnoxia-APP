import { useEffect, useState } from "react";

/**
 * O pedido que esta pessoa está esperando agora, guardado no aparelho dela.
 *
 * O link de acompanhamento é um token secreto que só aparece uma vez, na tela
 * de "pedido enviado". Quem fechava a aba ali perdia o endereço e não tinha
 * como voltar — o pedido continuava existindo, mas a única porta para ele tinha
 * sumido. Guardando o token, o rodapé consegue oferecer "Acompanhar pedido"
 * enquanto houver pedido para acompanhar.
 *
 * Fica em localStorage e nunca sai do aparelho, como os dados do checkout
 * ([[customer-details]]): é uma conveniência de quem pediu, não uma conta. Por
 * loja, porque a mesma pessoa pode estar esperando de duas lanchonetes.
 */

export type PedidoEmAndamento = {
  token: string;
  number: number;
};

function chave(storeSlug: string) {
  return `velnox:pedido:${storeSlug}`;
}

export function lerPedidoEmAndamento(storeSlug: string): PedidoEmAndamento | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(chave(storeSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PedidoEmAndamento>;
    // Campo a campo: um formato antigo guardado no aparelho não pode virar um
    // link quebrado no rodapé.
    if (typeof parsed.token !== "string" || !parsed.token) return null;
    if (typeof parsed.number !== "number") return null;
    return { token: parsed.token, number: parsed.number };
  } catch {
    return null;
  }
}

export function salvarPedidoEmAndamento(storeSlug: string, pedido: PedidoEmAndamento) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave(storeSlug), JSON.stringify(pedido));
    // Avisa as outras telas abertas nesta mesma aba: o evento nativo do
    // localStorage só chega às outras abas, e é o rodapé desta que precisa
    // acender agora.
    window.dispatchEvent(new CustomEvent(EVENTO));
  } catch {
    // Navegação privada ou cota cheia. Lembrar é um conforto, e nunca um motivo
    // para atrapalhar um pedido que já foi feito.
  }
}

/**
 * Esquece o pedido. Chamado quando ele termina — entregue ou cancelado — e
 * quando o link deixa de responder.
 */
export function esquecerPedidoEmAndamento(storeSlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chave(storeSlug));
    window.dispatchEvent(new CustomEvent(EVENTO));
  } catch {
    // Nada a fazer: no pior caso o link continua oferecido e a tela de
    // acompanhamento explica que o pedido terminou.
  }
}

const EVENTO = "velnox:pedido-mudou";

/**
 * O pedido em andamento, para a tela reagir a ele.
 *
 * Só lê depois de montar. O servidor não tem localStorage, então semear isto no
 * primeiro render faria o HTML do servidor discordar do que o navegador monta —
 * e o React acusaria a divergência em vez de mostrar o link.
 */
export function usePedidoEmAndamento(storeSlug: string): PedidoEmAndamento | null {
  const [pedido, setPedido] = useState<PedidoEmAndamento | null>(null);

  useEffect(() => {
    const ler = () => setPedido(lerPedidoEmAndamento(storeSlug));
    ler();
    // "storage" cobre as outras abas; o evento próprio cobre esta.
    window.addEventListener("storage", ler);
    window.addEventListener(EVENTO, ler);
    return () => {
      window.removeEventListener("storage", ler);
      window.removeEventListener(EVENTO, ler);
    };
  }, [storeSlug]);

  return pedido;
}
