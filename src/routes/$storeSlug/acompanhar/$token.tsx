import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Clock, CookingPot, Bike, PackageCheck, XCircle } from "lucide-react";
import { trackOrderFn } from "@/server/functions/order-tracking.fn";
import { DistanciaDoEntregador } from "@/components/site/pizzaria2/DistanciaDoEntregador";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import {
  esquecerPedidoEmAndamento,
  salvarPedidoEmAndamento,
} from "@/lib/pizzaria2/pedido-em-andamento";
import { cn } from "@/lib/utils";
import type { TrackingResponse } from "@/types/api-responses";

export const Route = createFileRoute("/$storeSlug/acompanhar/$token")({
  component: TrackingPage,
});

const PASSOS = [
  { status: "RECEIVED", label: "Pedido recebido", icon: Clock },
  { status: "PREPARING", label: "Em preparo", icon: CookingPot },
  { status: "OUT_FOR_DELIVERY", label: "Saiu para entrega", icon: Bike },
  { status: "COMPLETED", label: "Entregue", icon: PackageCheck },
] as const;

/** Pickup orders never go out for delivery, so that step is not shown to them. */
const passosPara = (type: string) =>
  type === "PICKUP" ? PASSOS.filter((p) => p.status !== "OUT_FOR_DELIVERY") : PASSOS;

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function TrackingPage() {
  const { storeSlug, token } = Route.useParams();
  const [data, setData] = useState<TrackingResponse | null>(null);

  // Refetch on a timer: the customer leaves this screen open while they wait,
  // and the whole point is that it changes without them doing anything.
  useEffect(() => {
    let vivo = true;
    const buscar = () =>
      trackOrderFn({ data: { token } })
        .then((r: any) => {
          const response = r as TrackingResponse;
          if (!vivo) return;
          setData(response);
          /*
           * O atalho do rodapé vive enquanto o pedido vive. Ele sai daqui, e
           * não de um relógio: quem sabe que o pedido terminou é o servidor,
           * e é esta resposta que traz a notícia — o pedido entregue ou
           * cancelado, ou o link que já parou de responder.
           */
          if (!response.ok) {
            esquecerPedidoEmAndamento(storeSlug);
          } else if (response.order.finished) {
            esquecerPedidoEmAndamento(storeSlug);
          } else {
            salvarPedidoEmAndamento(storeSlug, { token, number: response.order.number } as any);
          }
        })
        .catch(() => undefined);
    buscar();
    const id = window.setInterval(buscar, 15_000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [token, storeSlug]);

  if (!data) {
    return <Aviso titulo="Carregando..." texto="Buscando seu pedido." storeSlug={storeSlug} />;
  }

  if (!data.ok) {
    return (
      <Aviso
        titulo="Link não encontrado"
        texto="Este link não existe ou já expirou. Se o pedido foi entregue, ele sai do ar pouco depois."
        storeSlug={storeSlug}
      />
    );
  }

  const { order } = data;
  const passos = passosPara(order.type);
  const atual = passos.findIndex((p) => p.status === order.status);
  const cancelado = order.status === "CANCELLED";

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <p className="text-sm text-charcoal/50">Pedido #{order.number}</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold text-charcoal sm:text-3xl">
        {cancelado ? "Pedido cancelado" : "Acompanhe seu pedido"}
      </h1>

      {order.queuePosition !== null && !cancelado && (
        <p className="mt-3 rounded-xl bg-tomato/10 px-4 py-3 text-sm text-charcoal">
          {order.queuePosition === 1
            ? "Seu pedido é o próximo da fila."
            : `Seu pedido está em ${order.queuePosition}º na fila.`}
        </p>
      )}

      {cancelado ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-charcoal/10 p-4">
          <XCircle className="h-5 w-5 shrink-0 text-tomato" />
          <p className="text-sm text-charcoal/70">
            Este pedido foi cancelado pela loja. Se você não esperava por isso, fale com eles.
          </p>
        </div>
      ) : (
        <ol className="mt-6 space-y-1">
          {passos.map((passo, i) => {
            const feito = i <= atual;
            const agora = i === atual;
            const quando = order.history.find((h: any) => h.status === passo.status);
            const Icon = passo.icon;
            return (
              <li key={passo.status} className="flex items-center gap-3 py-2">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                    feito ? "bg-tomato text-[color:var(--on-primary)]" : "bg-charcoal/8 text-charcoal/35",
                  )}
                >
                  {feito && !agora ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm",
                      agora ? "font-bold text-charcoal" : feito ? "text-charcoal/70" : "text-charcoal/40",
                    )}
                  >
                    {passo.label}
                  </span>
                  {quando && (
                    <span className="block text-xs text-charcoal/45">
                      {hora.format(new Date(quando.createdAt))}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {order.status === "OUT_FOR_DELIVERY" && <DistanciaDoEntregador token={token} />}

      <div className="mt-8 rounded-2xl border border-charcoal/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/45">
          Seu pedido
        </p>
        <ul className="mt-2 space-y-1">
          {order.items.map((item: any, i: any) => (
            <li key={i} className="text-sm text-charcoal/70">
              {item.quantity}x {item.productNameSnapshot}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-charcoal/10 pt-3 font-display text-lg font-bold text-charcoal">
          {formatCurrency(order.total)}
        </p>
      </div>

      <Link
        to="/$storeSlug"
        params={{ storeSlug }}
        className="mt-6 inline-block text-sm font-semibold text-tomato hover:underline"
      >
        ← Voltar ao cardápio
      </Link>
    </main>
  );
}

function Aviso({
  titulo,
  texto,
  storeSlug,
}: {
  titulo: string;
  texto: string;
  storeSlug: string;
}) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-display text-xl font-bold text-charcoal">{titulo}</h1>
      <p className="mt-2 text-sm text-charcoal/60">{texto}</p>
      <Link
        to="/$storeSlug"
        params={{ storeSlug }}
        className="mt-6 inline-block text-sm font-semibold text-tomato hover:underline"
      >
        ← Voltar ao cardápio
      </Link>
    </main>
  );
}
