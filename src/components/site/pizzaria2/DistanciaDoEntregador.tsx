import { useCallback, useEffect, useRef, useState } from "react";
import { Bike, MapPin, Navigation } from "lucide-react";
import { getCourierDistanceFn } from "@/server/functions/order-tracking.fn";
import { textoDaDistancia } from "@/lib/distance";

/** Mesmo compasso do envio do entregador: pedir mais rápido só mostraria o
 *  mesmo número de novo. */
const INTERVALO_MS = 15_000;

type Estado =
  /** Ainda não pedimos nada: a tela explica antes de o navegador perguntar. */
  | { nome: "convite" }
  | { nome: "pedindo" }
  | { nome: "negado" }
  | { nome: "sem-suporte" }
  | { nome: "sem-sinal" }
  | { nome: "distancia"; metros: number; courierName: string };

/**
 * Mostra a que distância o entregador está de quem está lendo a tela.
 *
 * A permissão é pedida por um botão, nunca ao abrir a página: um pedido de
 * localização que aparece sozinho é o que faz qualquer pessoa clicar em
 * "bloquear" sem ler. E, antes de clicar, ela já sabe o que ganha e o que perde
 * se recusar — o resto do acompanhamento continua igual.
 *
 * A conta é feita no servidor: a posição do entregador não chega a este
 * navegador, e a de quem está aqui é usada na requisição e descartada.
 */
export function DistanciaDoEntregador({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>({ nome: "convite" });
  const ativo = useRef(false);

  const consultar = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!ativo.current) return;
        const r = await getCourierDistanceFn({
          data: {
            token,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          },
        }).catch(() => null);
        if (!ativo.current) return;

        if (r?.ok) setEstado({ nome: "distancia", metros: r.metros, courierName: r.courierName });
        else setEstado({ nome: "sem-sinal" });
      },
      (erro) => {
        if (!ativo.current) return;
        // Negar é definitivo até a pessoa mexer no navegador: insistir só
        // gastaria bateria mostrando o mesmo erro.
        if (erro.code === erro.PERMISSION_DENIED) {
          ativo.current = false;
          setEstado({ nome: "negado" });
          return;
        }
        setEstado({ nome: "sem-sinal" });
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        // Quem espera o pedido não sai do lugar: reaproveitar a leitura do
        // último minuto poupa a bateria de quem está com a tela aberta.
        maximumAge: 60_000,
      },
    );
  }, [token]);

  const permitir = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setEstado({ nome: "sem-suporte" });
      return;
    }
    ativo.current = true;
    setEstado({ nome: "pedindo" });
    consultar();
  }, [consultar]);

  const acompanhando =
    estado.nome === "distancia" || estado.nome === "sem-sinal" || estado.nome === "pedindo";

  useEffect(() => {
    if (!acompanhando) return;
    const id = window.setInterval(consultar, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [acompanhando, consultar]);

  useEffect(() => () => void (ativo.current = false), []);

  if (estado.nome === "distancia") {
    return (
      <Caixa>
        <p className="flex items-center gap-2 text-sm text-charcoal/60">
          <Bike className="h-4 w-4 shrink-0 text-tomato" />
          {estado.courierName} está trazendo seu pedido
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold text-charcoal">
          a {textoDaDistancia(estado.metros)} de você
        </p>
        <p className="mt-1 text-xs text-charcoal/45">
          Distância em linha reta, atualizada a cada 15 segundos. O caminho pelas ruas é um pouco
          maior.
        </p>
      </Caixa>
    );
  }

  if (estado.nome === "sem-sinal") {
    return (
      <Caixa>
        <p className="flex items-center gap-2 text-sm text-charcoal/70">
          <Navigation className="h-4 w-4 shrink-0 text-charcoal/40" />
          Sem sinal do entregador agora
        </p>
        <p className="mt-1 text-xs text-charcoal/45">
          Pode ser que ele esteja com o celular no bolso ou sem sinal. A distância volta sozinha
          quando o aparelho voltar a responder.
        </p>
      </Caixa>
    );
  }

  if (estado.nome === "negado") {
    return (
      <Caixa>
        <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
          <MapPin className="h-4 w-4 shrink-0 text-charcoal/40" />
          Localização bloqueada
        </p>
        <p className="mt-1 text-sm text-charcoal/60">
          Sem a sua localização não dá para calcular a distância — a conta é entre onde você está e
          onde o entregador está. Seu pedido continua sendo acompanhado normalmente acima.
        </p>
        <p className="mt-2 text-xs text-charcoal/45">
          Se mudar de ideia, libere a localização nas permissões do navegador e toque abaixo.
        </p>
        <button
          type="button"
          onClick={permitir}
          className="mt-3 w-full rounded-xl border border-charcoal/15 py-2.5 text-sm font-semibold text-charcoal"
        >
          Tentar de novo
        </button>
      </Caixa>
    );
  }

  if (estado.nome === "sem-suporte") {
    return (
      <Caixa>
        <p className="text-sm text-charcoal/60">
          Este navegador não informa localização, então a distância não aparece. O acompanhamento do
          pedido continua funcionando.
        </p>
      </Caixa>
    );
  }

  if (estado.nome === "pedindo") {
    return (
      <Caixa>
        <p className="text-sm text-charcoal/60">Buscando sua localização...</p>
      </Caixa>
    );
  }

  return (
    <Caixa>
      <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
        <Bike className="h-4 w-4 shrink-0 text-tomato" />
        Quer ver a que distância o entregador está?
      </p>
      <p className="mt-1 text-sm text-charcoal/60">
        Para isso o site precisa da sua localização, e o navegador vai perguntar. Ela é usada só
        para calcular a distância e não fica guardada.
      </p>
      {/* A consequência dita antes da escolha, não depois: quem recusa merece
          saber exatamente o que deixa de ver. */}
      <p className="mt-2 text-xs text-charcoal/45">
        Se você não permitir, continua acompanhando o pedido normalmente — só não verá a distância
        do entregador.
      </p>
      <button
        type="button"
        onClick={permitir}
        className="mt-3 w-full rounded-xl bg-tomato py-3 text-sm font-bold text-[color:var(--on-primary)]"
      >
        Permitir e ver a distância
      </button>
    </Caixa>
  );
}

function Caixa({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-2xl border border-charcoal/10 p-4">{children}</div>;
}
