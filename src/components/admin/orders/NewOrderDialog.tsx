import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckSquare, Clock, PartyPopper, X } from "lucide-react";
import {
  getOrderFn,
  listPendingOrdersFn,
  markOrderNotificationsReadFn,
  updateOrderStatusFn,
} from "@/server/functions/orders.fn";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("pt-BR");

const SIZE_LABEL: Record<string, string> = {
  BROTINHO: "Brotinho",
  MEDIA: "Média",
  GRANDE: "Grande",
  GIGANTE: "Gigante",
};

const STORAGE_KEY = "velnoxia:seen-orders";

function readSeen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * Polls for RECEIVED orders and pops a dialog for ones this session hasn't
 * shown yet. Seen ids live in sessionStorage so a refresh doesn't re-alert.
 */
export function NewOrderDialog() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const seenRef = useRef<Set<string> | null>(null);

  const { data: pending } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: () => listPendingOrdersFn(),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!pending) return;

    // First poll only records what already exists — no dialog storm on load.
    if (seenRef.current === null) {
      seenRef.current = new Set([...readSeen(), ...pending.map((o) => o.id)]);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seenRef.current]));
      return;
    }

    const fresh = pending.find((o) => !seenRef.current!.has(o.id));
    if (fresh && !activeId) {
      seenRef.current.add(fresh.id);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seenRef.current]));
      setActiveId(fresh.id);
    }
  }, [pending, activeId]);

  const { data: order } = useQuery({
    queryKey: ["order", activeId],
    queryFn: () => getOrderFn({ data: { id: activeId! } }),
    enabled: Boolean(activeId),
  });

  const decide = useMutation({
    mutationFn: (status: "PREPARING" | "CANCELLED") =>
      updateOrderStatusFn({ data: { id: activeId!, status } }),
    onSuccess: async () => {
      await markOrderNotificationsReadFn({ data: { orderId: activeId! } });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setActiveId(null);
    },
  });

  if (!activeId || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="admin-theme max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-neutral-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold italic">
            <PartyPopper className="size-6 text-[#E11D2E]" />
            Novo pedido recebido!
          </h2>
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="text-neutral-400 hover:text-neutral-700"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-neutral-200 p-5">
          <div className="flex items-start justify-between">
            <p className="text-3xl font-bold text-[#E11D2E]">#{order.number}</p>
            <div className="text-right text-sm text-neutral-600">
              <p>{time.format(new Date(order.createdAt))}</p>
              <p>{day.format(new Date(order.createdAt))}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 border-t border-neutral-200 pt-4 sm:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-neutral-500">Cliente</p>
                <p className="font-bold text-neutral-900">{order.customerName}</p>
                <p className="text-sm text-emerald-700">{order.customerPhone}</p>
              </div>

              {order.type === "DELIVERY" && (
                <div>
                  <p className="text-sm text-neutral-500">Entrega</p>
                  <p className="text-sm text-neutral-800">
                    {order.deliveryStreet}, {order.deliveryNumber}
                  </p>
                  <p className="text-sm text-neutral-800">
                    {[order.deliveryComplement, order.deliveryNeighborhood]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-neutral-500">Pagamento</p>
                <p className="text-sm text-neutral-800">{order.paymentMethod}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-neutral-500">Itens do pedido</p>
              <ul className="mt-2 divide-y divide-neutral-100">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        <span className="text-[#E11D2E]">{item.quantity}x</span>{" "}
                        {item.productNameSnapshot}
                        {item.sizeLabel ? ` ${SIZE_LABEL[item.sizeLabel]}` : ""}
                      </p>
                      {item.isHalfAndHalf && item.secondProductNameSnapshot && (
                        <p className="text-xs text-neutral-500">
                          {item.productNameSnapshot} / {item.secondProductNameSnapshot}
                        </p>
                      )}
                      {item.extras.map((e) => (
                        <p key={e.id} className="text-xs text-neutral-500">
                          + {e.nameSnapshot}
                        </p>
                      ))}
                    </div>
                    <span className="shrink-0 text-sm text-neutral-700">
                      {currency.format(item.unitPrice * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              {order.discount > 0 && (
                <div className="flex items-center justify-between text-sm text-emerald-700">
                  <span>
                    Desconto{order.coupon ? " · " + order.coupon.code : ""}
                  </span>
                  <span>-{currency.format(order.discount)}</span>
                </div>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t border-neutral-200 pt-3">
                <span className="text-lg font-bold">Total</span>
                <span className="text-lg font-bold">{currency.format(order.total)}</span>
              </div>
            </div>
          </div>

          {order.customerNote && (
            <div className="mt-4 border-t border-neutral-200 pt-4">
              <p className="text-sm text-neutral-500">Observação do cliente</p>
              <p className="text-sm text-neutral-800">{order.customerNote}</p>
            </div>
          )}
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => setAutoPrint(e.target.checked)}
            className="size-4 accent-[#E11D2E]"
          />
          Imprimir automaticamente
        </label>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate("CANCELLED")}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#E11D2E] py-3 font-semibold text-[#E11D2E] transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            <Ban className="size-5" />
            Recusar pedido
          </button>
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => {
              // Fire the status change first: window.print() blocks the main
              // thread until the print dialog is dismissed, and the order
              // should not wait on that.
              decide.mutate("PREPARING");
              if (autoPrint) setTimeout(() => window.print(), 0);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#E11D2E] py-3 font-semibold text-white transition-colors hover:bg-[#c4172a] disabled:opacity-60"
          >
            <CheckSquare className="size-5" />
            Colocar na fila
          </button>
        </div>

        <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-neutral-700">
          <Clock className="size-4 text-[#E11D2E]" />
          O pedido será adicionado na coluna <strong>"Em preparo"</strong>.
        </p>
      </div>
    </div>
  );
}
