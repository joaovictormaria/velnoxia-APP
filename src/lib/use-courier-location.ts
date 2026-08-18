import { useCallback, useEffect, useRef, useState } from "react";
import {
  reportCourierLocationFn,
  stopSharingLocationFn,
} from "@/server/functions/courier-deliveries.fn";

/** Intervalo entre envios. Escolhido para poupar bateria do entregador e dados
 *  do cliente — de segundo em segundo não deixaria a tela mais útil. */
const INTERVALO_MS = 15_000;

/** Lembra a escolha dele entre sessões: uma vez ativado, não precisa clicar em
 *  "ativar" a cada vez que abre a tela no meio do turno. */
const CHAVE = "velnoxia:courier-share-location";

export type EstadoDaLocalizacao =
  | "desligado"
  | "sem-suporte"
  | "enviando"
  | "negado"
  /** Aparelho sem sinal de GPS agora; continua tentando. */
  | "sem-sinal";

/**
 * Envia a posição do entregador enquanto ele tem entrega na rua.
 *
 * Não liga sozinho na primeira vez: um pedido de localização que aparece sem
 * explicação é o que faz qualquer pessoa clicar em "bloquear". A tela explica e
 * ele ativa; daí em diante a escolha fica lembrada.
 */
export function useCourierLocation(temEntrega: boolean) {
  const suportado = typeof navigator !== "undefined" && "geolocation" in navigator;

  const [ligado, setLigado] = useState(false);
  const [estado, setEstado] = useState<EstadoDaLocalizacao>("desligado");
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);

  // Evita que uma resposta atrasada volte a mexer no estado depois de desligar.
  const ligadoRef = useRef(false);
  ligadoRef.current = ligado;

  useEffect(() => {
    if (!suportado) {
      setEstado("sem-suporte");
      return;
    }
    if (localStorage.getItem(CHAVE) === "1") setLigado(true);
  }, [suportado]);

  const ativar = useCallback(() => {
    localStorage.setItem(CHAVE, "1");
    setLigado(true);
  }, []);

  const desativar = useCallback(async () => {
    localStorage.removeItem(CHAVE);
    setLigado(false);
    setEstado("desligado");
    // O aparelho é dele: a posição sai do banco na hora, sem esperar a entrega
    // terminar.
    await stopSharingLocationFn();
  }, []);

  useEffect(() => {
    if (!suportado || !ligado || !temEntrega) return;

    let vivo = true;

    const enviar = () =>
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (!vivo || !ligadoRef.current) return;
          const r = await reportCourierLocationFn({
            data: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
            },
          }).catch(() => null);
          if (!vivo) return;
          setEstado("enviando");
          if (r?.ok) setUltimoEnvio(new Date());
        },
        (erro) => {
          if (!vivo) return;
          // Bloqueio é definitivo até ele mexer no navegador; parar de insistir.
          if (erro.code === erro.PERMISSION_DENIED) {
            localStorage.removeItem(CHAVE);
            setLigado(false);
            setEstado("negado");
            return;
          }
          setEstado("sem-sinal");
        },
        {
          // Precisão alta: a distância é o produto, e o modo econômico erra
          // quilômetros em cidade.
          enableHighAccuracy: true,
          timeout: 10_000,
          // Aceita uma leitura de até 10 s — poupa bateria sem envelhecer o dado.
          maximumAge: 10_000,
        },
      );

    enviar();
    const id = window.setInterval(enviar, INTERVALO_MS);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [suportado, ligado, temEntrega]);

  return { estado, ligado, ativar, desativar, ultimoEnvio };
}
