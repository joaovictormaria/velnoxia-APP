import { Link } from "@tanstack/react-router";
import {
  Bike,
  ChefHat,
  CircleCheck,
  Clock,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import type { OrderStatus } from "@prisma/client";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const time = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export const COLUMNS: {
  status: OrderStatus;
  label: string;
  icon: LucideIcon;
  header: string;
  badge: string;
}[] = [
  {
    status: "RECEIVED",
    label: "Recebidos",
    icon: ShoppingBag,
    header: "bg-[#E11D2E]",
    badge: "bg-red-50 text-[#E11D2E]",
  },
  {
    status: "PREPARING",
    label: "Em preparo",
    icon: ChefHat,
    header: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700",
  },
  {
    status: "OUT_FOR_DELIVERY",
    label: "Saiu p/ entrega",
    icon: Bike,
    header: "bg-blue-600",
    badge: "bg-blue-50 text-blue-700",
  },
  {
    status: "COMPLETED",
    label: "Finalizados",
    icon: CircleCheck,
    header: "bg-emerald-600",
    badge: "bg-emerald-50 text-emerald-700",
  },
];

export type KanbanOrder = {
  id: string;
  number: number;
  createdAt: string | Date;
  customerName: string;
  total: number;
  type: "DELIVERY" | "PICKUP";
  items: {
    productNameSnapshot: string;
    quantity: number;
    sizeLabel: string | null;
  }[];
  discount: number;
  coupon: { code: string } | null;
  /** Preenchido quando o pedido está pronto e sem quem o leve. */
  awaitingCourierSince: string | Date | null;
  courier: { name: string } | null;
  /** O nome copiado no despacho. Sobrevive à exclusão da conta. */
  courierNameSnapshot: string | null;
};

export type KanbanColumnData = {
  status: OrderStatus;
  orders: KanbanOrder[];
  total: number;
};

export function KanbanBoard({
  columns,
  onAdvance,
  onDispatch,
}: {
  columns: KanbanColumnData[];
  onAdvance: (order: KanbanOrder, status: OrderStatus) => void;
  /** Entrega não avança sozinha: passa pela escolha de quem leva. */
  onDispatch: (order: KanbanOrder) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const data = columns.find((c) => c.status === col.status);
        const orders = data?.orders ?? [];
        const total = data?.total ?? 0;
        const Icon = col.icon;

        return (
          <section key={col.status} className="flex flex-col">
            <header
              className={`flex items-center justify-between rounded-t-2xl px-4 py-3 text-white ${col.header}`}
            >
              <h2 className="text-sm font-bold">
                {col.label} ({total})
              </h2>
              <Icon className="size-5" />
            </header>

            <div className="h-[calc(100vh-24rem)] min-h-[16rem] space-y-3 overflow-y-auto rounded-b-2xl border border-t-0 border-neutral-200 bg-white p-3">
              {orders.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-400">
                  Nenhum pedido.
                </p>
              )}

              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  badge={col.badge}
                  status={col.status}
                  onAdvance={onAdvance}
                  onDispatch={onDispatch}
                />
              ))}

              {total > orders.length && (
                <p className="pt-1 text-sm text-neutral-500">
                  + {total - orders.length} pedidos
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const NEXT_STATUS: Partial<
  Record<OrderStatus, { status: OrderStatus; label: string }>
> = {
  RECEIVED: { status: "PREPARING", label: "Colocar na fila" },
  PREPARING: { status: "OUT_FOR_DELIVERY", label: "Saiu para entrega" },
  OUT_FOR_DELIVERY: { status: "COMPLETED", label: "Finalizar" },
};

function OrderCard({
  order,
  badge,
  status,
  onAdvance,
  onDispatch,
}: {
  order: KanbanOrder;
  badge: string;
  status: OrderStatus;
  onAdvance: (order: KanbanOrder, status: OrderStatus) => void;
  onDispatch: (order: KanbanOrder) => void;
}) {
  // Pickup orders skip the delivery step entirely.
  const next =
    status === "PREPARING" && order.type === "PICKUP"
      ? { status: "COMPLETED" as OrderStatus, label: "Finalizar" }
      : NEXT_STATUS[status];

  // Sair para entrega é escolher quem leva: o botão abre a escolha em vez de
  // mudar o status, que o servidor recusaria sem entregador.
  const precisaEscolherEntregador = status === "PREPARING" && order.type === "DELIVERY";
  const esperando = Boolean(order.awaitingCourierSince);

  return (
    <Link
      to="/admin/pedidos/$orderId"
      params={{ orderId: order.id }}
      className="block rounded-xl border border-neutral-200 p-3 transition-colors hover:border-[#E11D2E]/40 hover:bg-[#E11D2E]/[0.03] focus-visible:border-[#E11D2E] focus-visible:outline-none"
    >
      <article>
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-base font-bold text-neutral-900">
            #{order.number} - {order.customerName}
          </span>
          <span className="shrink-0 text-xs text-neutral-500">
            {time.format(new Date(order.createdAt))}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-neutral-900">
            {currency.format(order.total)}
          </p>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge}`}
          >
            {order.type === "DELIVERY" ? "Entrega" : "Retirada"}
          </span>
          {/* The kitchen needs to know a discount was applied, and which code did
            it, before questioning the amount that arrives. */}
          {order.discount > 0 && (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              {order.coupon ? order.coupon.code + " · " : ""}-
              {currency.format(order.discount)}
            </span>
          )}
          {esperando && (
            <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
              <Clock className="size-3" />
              Aguardando entregador
            </span>
          )}
          {/* A conta pode ter sido apagada depois da entrega; aí vale a cópia
              feita no despacho, e o pedido continua dizendo quem levou. */}
          {(order.courier?.name ?? order.courierNameSnapshot) && (
            <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              <Bike className="size-3" />
              {order.courier?.name ?? order.courierNameSnapshot}
            </span>
          )}
        </div>

        {(next || precisaEscolherEntregador) && (
          <button
            type="button"
            onClick={(e) => {
              // O cartao e uma ancora de verdade: parar a propagacao impede o
              // handler do Link, mas nao o navegador de seguir o href.
              e.preventDefault();
              e.stopPropagation();
              if (precisaEscolherEntregador) onDispatch(order);
              else if (next) onAdvance(order, next.status);
            }}
            className={`mt-2 w-full rounded-lg border py-1.5 text-xs font-medium transition-colors ${
              esperando
                ? "border-orange-300 bg-orange-50 text-orange-700 hover:border-orange-500"
                : "border-neutral-200 text-neutral-700 hover:border-[#E11D2E] hover:text-[#E11D2E]"
            }`}
          >
            {precisaEscolherEntregador
              ? esperando
                ? "Despachar agora"
                : "Escolher entregador"
              : next?.label}
          </button>
        )}
      </article>
    </Link>
  );
}
