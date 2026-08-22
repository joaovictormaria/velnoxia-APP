import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getTableOrdersFn } from "@/server/functions/table-orders.fn";
import { useTable } from "@/lib/table-context";
import { ArrowLeft, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/(public)/$storeSlug/acompanhar-mesa/$tableId")({
  component: AcompanharMesaPage,
});

function AcompanharMesaPage() {
  const { storeSlug, tableId } = Route.useParams();
  const navigate = useNavigate();
  const { tableNumber, clearTable } = useTable();

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["table-orders", storeSlug, tableId],
    queryFn: () => getTableOrdersFn({ data: { storeSlug, tableId } }),
    refetchInterval: 5000, // Poll a cada 5 segundos
  });

  const statusLabels = {
    RECEIVED: { label: "Recebido", color: "bg-blue-500", icon: "📋" },
    PREPARING: { label: "Preparando", color: "bg-yellow-500", icon: "👨‍🍳" },
    OUT_FOR_DELIVERY: { label: "Entregando", color: "bg-purple-500", icon: "🚚" },
    COMPLETED: { label: "Completo", color: "bg-green-500", icon: "✓" },
    CANCELLED: { label: "Cancelado", color: "bg-red-500", icon: "✕" },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-black">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: "/" })}
              className="rounded-lg p-2 hover:bg-neutral-800"
            >
              <ArrowLeft className="size-5 text-neutral-300" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Seus Pedidos</h1>
              <p className="text-sm text-neutral-400">Mesa #{tableNumber}</p>
            </div>
          </div>
          <button
            onClick={() => {
              clearTable();
              navigate({ to: `/${storeSlug}` });
            }}
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            Sair da Mesa
          </button>
        </div>

        {/* Lista de pedidos */}
        {isLoading ? (
          <div className="text-center text-neutral-400">Carregando pedidos...</div>
        ) : orders.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center">
            <p className="mb-4 text-neutral-400">Você ainda não fez nenhum pedido</p>
            <Button
              onClick={() => navigate({ to: `/${storeSlug}/cardapio` })}
              className="w-full sm:w-auto"
            >
              Fazer Pedido
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const statusInfo = statusLabels[order.status];
              const isCompleted = order.status === "COMPLETED";

              return (
                <div
                  key={order.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 backdrop-blur"
                >
                  {/* Status bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{statusInfo.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-neutral-400">Pedido #{order.number}</p>
                          <p className="text-lg font-bold text-white">{statusInfo.label}</p>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium text-white ${statusInfo.color}`}>
                        {statusInfo.label}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${statusInfo.color}`}
                        style={{
                          width: order.status === "RECEIVED"
                            ? "25%"
                            : order.status === "PREPARING"
                              ? "50%"
                              : order.status === "OUT_FOR_DELIVERY"
                                ? "75%"
                                : "100%",
                        }}
                      />
                    </div>
                  </div>

                  {/* Items */}
                  <div className="mb-4 space-y-1 border-t border-neutral-800 pt-4">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-neutral-300">
                          {item.quantity}x {item.productName}
                        </span>
                        <span className="text-neutral-400">
                          R$ {(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Total e tempo */}
                  <div className="flex items-center justify-between border-t border-neutral-800 pt-4">
                    <div>
                      <p className="text-2xl font-bold text-white">
                        R$ {order.total.toFixed(2)}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {new Date(order.createdAt).toLocaleDateString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    {!isCompleted && order.estimatedDeliveryAt && (
                      <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <Clock className="size-4" />
                        <span>
                          {new Date(order.estimatedDeliveryAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}

                    {isCompleted && (
                      <CheckCircle className="size-6 text-green-400" />
                    )}
                  </div>
                </div>
              );
            })}

            <Button
              onClick={() => navigate({ to: `/${storeSlug}/cardapio` })}
              className="w-full"
            >
              Fazer Novo Pedido
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
