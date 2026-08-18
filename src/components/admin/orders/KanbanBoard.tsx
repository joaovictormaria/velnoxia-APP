import { Link } from "@tanstack/react-router";
import { Bike, ChefHat, CircleCheck, ShoppingBag, User, type LucideIcon } from "lucide-react";
import type { OrderStatus } from "@prisma/client";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const SIZE_SHORT: Record<string, string> = {
  BROTINHO: "B",
  MEDIA: "M",
  GRANDE: "G",
  GIGANTE: "GG",
};

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
  items: { productNameSnapshot: string; quantity: number; sizeLabel: string | null }[];
  discount: number;
  coupon: { code: string } | null;
};

export type KanbanColumnData = {
  status: OrderStatus;
  orders: KanbanOrder[];
  total: number;
};

export function KanbanBoard({
  columns,
  onAdvance,
}: {
  columns: KanbanColumnData[];
  onAdvance: (order: KanbanOrder, status: OrderStatus) => void;
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

            <div className="flex-1 space-y-3 rounded-b-2xl border border-t-0 border-neutral-200 bg-white p-3">
              {orders.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-400">Nenhum pedido.</p>
              )}

              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  badge={col.badge}
                  status={col.status}
                  onAdvance={onAdvance}
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

const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  RECEIVED: { status: "PREPARING", label: "Colocar na fila" },
  PREPARING: { status: "OUT_FOR_DELIVERY", label: "Saiu para entrega" },
  OUT_FOR_DELIVERY: { status: "COMPLETED", label: "Finalizar" },
};

function OrderCard({
  order,
  badge,
  status,
  onAdvance,
}: {
  order: KanbanOrder;
  badge: string;
  status: OrderStatus;
  onAdvance: (order: KanbanOrder, status: OrderStatus) => void;
}) {
  // Pickup orders skip the delivery step entirely.
  const next =
    status === "PREPARING" && order.type === "PICKUP"
      ? { status: "COMPLETED" as OrderStatus, label: "Finalizar" }
      : NEXT_STATUS[status];

  return (
    <article className="rounded-xl border border-neutral-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          to="/admin/pedidos/$orderId"
          params={{ orderId: order.id }}
          className="text-base font-bold text-neutral-900 hover:text-[#E11D2E]"
        >
          #{order.number}
        </Link>
        <span className="text-xs text-neutral-500">{time.format(new Date(order.createdAt))}</span>
      </div>

      <p className="mt-1 text-sm font-medium text-neutral-800">{order.customerName}</p>

      <ul className="mt-2 space-y-0.5">
        {order.items.slice(0, 3).map((item, i) => (
          <li key={i} className="truncate text-xs text-neutral-600">
            {item.quantity}x {item.productNameSnapshot}
            {item.sizeLabel ? ` ${SIZE_SHORT[item.sizeLabel]}` : ""}
          </li>
        ))}
        {order.items.length > 3 && (
          <li className="text-xs text-neutral-400">+ {order.items.length - 3} itens</li>
        )}
      </ul>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-bold text-neutral-900">{currency.format(order.total)}</p>
        {/* The kitchen needs to know a discount was applied, and which code did
            it, before questioning the amount that arrives. */}
        {order.discount > 0 && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            {order.coupon ? order.coupon.code + " · " : ""}
            -{currency.format(order.discount)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${badge}`}>
          {order.type === "DELIVERY" ? "Entrega" : "Retirada"}
        </span>
        <Link
          to="/admin/pedidos/$orderId"
          params={{ orderId: order.id }}
          className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100"
          aria-label={`Detalhes do pedido ${order.number}`}
        >
          <User className="size-4" />
        </Link>
      </div>

      {next && (
        <button
          type="button"
          onClick={() => onAdvance(order, next.status)}
          className="mt-2 w-full rounded-lg border border-neutral-200 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-[#E11D2E] hover:text-[#E11D2E]"
        >
          {next.label}
        </button>
      )}
    </article>
  );
}
