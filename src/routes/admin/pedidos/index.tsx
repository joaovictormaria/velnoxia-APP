import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bike,
  CalendarDays,
  ChefHat,
  CircleCheck,
  Clock,
  Search,
  ShoppingBag,
} from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { KanbanBoard, type KanbanOrder } from "@/components/admin/orders/KanbanBoard";
import { MesaCard } from "@/components/admin/orders/MesaCard";
import {
  DispatchDialog,
  type DispatchTarget,
} from "@/components/admin/orders/DispatchDialog";
import { NotificationBell } from "@/components/admin/layout/NotificationBell";
import { listKanbanOrdersFn, listMesasAbertasFn, updateOrderStatusFn } from "@/server/functions/orders.fn";

export const Route = createFileRoute("/admin/pedidos/")({
  component: KanbanPage,
});

/** Local YYYY-MM-DD — toISOString() would give the UTC day, which is already
 *  tomorrow during the evening in UTC-3. */
function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function KanbanPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Pedido cuja saída está sendo decidida — a escolha do entregador é um passo
  // próprio, não um clique que já muda o status.
  const [dispatching, setDispatching] = useState<DispatchTarget | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["orders", "kanban", date, search],
    queryFn: () => listKanbanOrdersFn({ data: { date, search: search || undefined } }),
    refetchInterval: 8_000,
    staleTime: 8_000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: mesas = [] } = useQuery({
    queryKey: ["mesas", "abertas", date, search],
    queryFn: () => listMesasAbertasFn({ data: { date, search: search || undefined } }),
    refetchInterval: 8_000,
    staleTime: 8_000,
    gcTime: 10 * 60 * 1000,
  });

  const advance = useMutation({
    mutationFn: (vars: { id: string; status: OrderStatus }) =>
      updateOrderStatusFn({ data: vars }),
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["orders", "kanban"] });
      await queryClient.invalidateQueries({ queryKey: ["mesas", "abertas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const finalizarMesa = useMutation({
    mutationFn: async (pedidoIds: string[]) => {
      const results = await Promise.all(
        pedidoIds.map((id) => updateOrderStatusFn({ data: { id, status: "COMPLETED" } }))
      );
      return results;
    },
    onSuccess: async (res) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["orders", "kanban"] });
      await queryClient.invalidateQueries({ queryKey: ["mesas", "abertas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => {
      setError("Erro ao finalizar mesa");
    },
  });

  function handleAdvance(order: KanbanOrder, status: OrderStatus) {
    advance.mutate({ id: order.id, status });
  }

  const metrics = data?.metrics;
  const awaiting = data?.awaiting ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Pedidos (Kanban)</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Acompanhe e gerencie os pedidos em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700">
            <CalendarDays className="size-4 text-neutral-500" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none"
            />
          </label>

          <div className="relative w-full min-w-0 flex-1 sm:min-w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido, cliente ou telefone..."
              className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-base md:text-sm text-neutral-700 placeholder:text-neutral-400"
            />
          </div>

          <NotificationBell />
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      {mesas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-neutral-900">Mesas Abertas ({mesas.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mesas.map((mesa) => (
              <MesaCard
                key={mesa.tableId}
                mesa={mesa}
                onFinalize={(tableId, pedidoIds) => finalizarMesa.mutate(pedidoIds)}
              />
            ))}
          </div>
        </section>
      )}

      {awaiting.length > 0 && (
        <WaitingList orders={awaiting} onPick={setDispatching} />
      )}

      {isPending && !data ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <KanbanBoard
          columns={data?.columns ?? []}
          mostrarEntrega={data?.mostrarEntrega ?? true}
          onAdvance={handleAdvance}
          onDispatch={(order) =>
            setDispatching({
              id: order.id,
              number: order.number,
              customerName: order.customerName,
            })
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={ShoppingBag}
          label="Total de pedidos"
          value={metrics ? String(metrics.totalOrders) : "-"}
          accent="#E11D2E"
        />
        <Metric
          icon={ChefHat}
          label="Tempo médio preparo"
          value={metrics?.avgPrepMinutes !== null && metrics ? `${metrics.avgPrepMinutes} min` : "-"}
          accent="#F59E0B"
        />
        <Metric
          icon={Bike}
          label="Tempo médio entrega"
          value={
            metrics?.avgDeliveryMinutes !== null && metrics
              ? `${metrics.avgDeliveryMinutes} min`
              : "-"
          }
          accent="#2563EB"
        />
        <Metric
          icon={CircleCheck}
          label="Taxa de conclusão"
          value={metrics?.completionRate !== null && metrics ? `${metrics.completionRate}%` : "-"}
          accent="#059669"
        />
      </div>

      {dispatching && (
        <DispatchDialog order={dispatching} onClose={() => setDispatching(null)} />
      )}
    </div>
  );
}

/**
 * Pedidos prontos parados por falta de quem leve.
 *
 * Fica acima do quadro, e não dentro da coluna de preparo, porque é a única
 * fila em que o relógio corre contra a comida sem ninguém agindo: misturada
 * aos pedidos que ainda estão no forno, ela some.
 */
function WaitingList({
  orders,
  onPick,
}: {
  orders: {
    id: string;
    number: number;
    customerName: string;
    total: number;
    awaitingCourierSince: string | Date | null;
    deliveryNeighborhood: string | null;
  }[];
  onPick: (order: DispatchTarget) => void;
}) {
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-orange-800">
        <Clock className="size-4" />
        Aguardando entregador ({orders.length})
      </h2>
      <p className="mt-1 text-xs text-orange-700">
        Prontos para sair assim que alguém puder levar.
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {orders.map((order) => {
          const desde = order.awaitingCourierSince
            ? Math.round((Date.now() - new Date(order.awaitingCourierSince).getTime()) / 60_000)
            : 0;
          return (
            <li key={order.id}>
              <button
                type="button"
                onClick={() =>
                  onPick({
                    id: order.id,
                    number: order.number,
                    customerName: order.customerName,
                  })
                }
                className="flex items-center gap-3 rounded-xl border border-orange-300 bg-white px-4 py-2.5 text-left transition-colors hover:border-orange-500"
              >
                <span>
                  <span className="block text-sm font-bold text-neutral-900">
                    #{order.number} - {order.customerName}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {order.deliveryNeighborhood ? order.deliveryNeighborhood + " · " : ""}
                    esperando há {desde} min
                  </span>
                </span>
                <Bike className="size-4 shrink-0 text-orange-600" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent}1a` }}
      >
        <Icon className="size-5" style={{ color: accent }} />
      </span>
      <div>
        <p className="text-sm text-neutral-600">{label}</p>
        <p className="text-2xl font-bold text-neutral-900">{value}</p>
      </div>
    </div>
  );
}
