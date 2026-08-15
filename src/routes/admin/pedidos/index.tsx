import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bike, CalendarDays, ChefHat, CircleCheck, Search, ShoppingBag } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { KanbanBoard, type KanbanOrder } from "@/components/admin/orders/KanbanBoard";
import { NewOrderDialog } from "@/components/admin/orders/NewOrderDialog";
import { NotificationBell } from "@/components/admin/layout/NotificationBell";
import { listKanbanOrdersFn, updateOrderStatusFn } from "@/server/functions/orders.fn";

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

  const { data, isPending } = useQuery({
    queryKey: ["orders", "kanban", date, search],
    queryFn: () => listKanbanOrdersFn({ data: { date, search: search || undefined } }),
    refetchInterval: 8_000,
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
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function handleAdvance(order: KanbanOrder, status: OrderStatus) {
    advance.mutate({ id: order.id, status });
  }

  const metrics = data?.metrics;

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

          <div className="relative min-w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido, cliente ou telefone..."
              className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm text-neutral-700 placeholder:text-neutral-400"
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

      {isPending && !data ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <KanbanBoard columns={data?.columns ?? []} onAdvance={handleAdvance} />
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

      <NewOrderDialog />
    </div>
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
