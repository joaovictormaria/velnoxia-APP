import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tocarAvisoDePedido } from "@/lib/alerta-sonoro";
import { listPendingOrdersFn } from "@/server/functions/orders.fn";

const STORAGE_KEY = "velnoxia:seen-orders";

function readSeen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * O aviso sonoro de pedido novo. Não desenha nada.
 *
 * Antes isto abria um diálogo em cima da tela a cada pedido, e quem estava no
 * balcão precisava fechá-lo para voltar ao painel. O pedido já aparece sozinho
 * na coluna "Recebidos" — a lista se atualiza a cada três segundos —, então o
 * diálogo só interrompia para contar algo que a tela já estava mostrando.
 *
 * O que sobrou é a parte que a tela não faz: chamar a atenção de quem não está
 * olhando para ela.
 */
export function NewOrderDialog() {
  /** Ids já vistos, para não alertar de novo o que já estava na tela. */
  const vistos = useRef<Set<string> | null>(null);
  /** O pedido que está tocando o aviso agora. */
  const [alertando, setAlertando] = useState<string | null>(null);

  const { data: pendentes } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: () => listPendingOrdersFn(),
    refetchInterval: 5_000,
    /*
     * Sem isto o padrão do react-query congela a busca quando a janela perde o
     * foco — que é exatamente o estado do painel de balcão a maior parte do
     * expediente. O pedido só apareceria quando alguém clicasse na janela.
     */
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!pendentes) return;
    const ids = pendentes.map((o: { id: string }) => o.id);

    /*
     * A primeira leitura só registra o que já existe. Sem isto, abrir o painel
     * com pedidos na fila dispararia o aviso para todos eles de uma vez.
     */
    if (vistos.current === null) {
      vistos.current = new Set([...readSeen(), ...ids]);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...vistos.current]));
      return;
    }

    /*
     * O aviso para quando o pedido sai de "Recebidos" — alguém o colocou na
     * fila ou recusou, pelo próprio quadro. Antes quem encerrava o som era o
     * botão do diálogo; agora é a ação de verdade, que é o que importa.
     */
    if (alertando && !ids.includes(alertando)) {
      setAlertando(null);
      return;
    }

    const novo = ids.find((id: string) => !vistos.current!.has(id));
    if (novo && !alertando) {
      vistos.current.add(novo);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...vistos.current]));
      setAlertando(novo);
    }
  }, [pendentes, alertando]);

  /**
   * O aviso se repete enquanto o pedido não for atendido. Um toque só se perde
   * numa cozinha barulhenta, e a janela pode estar minimizada — o que para é
   * alguém decidir sobre o pedido, não o tempo passar.
   */
  useEffect(() => {
    if (!alertando) return;
    tocarAvisoDePedido();
    const repetir = setInterval(tocarAvisoDePedido, 10_000);
    return () => clearInterval(repetir);
  }, [alertando]);

  return null;
}
