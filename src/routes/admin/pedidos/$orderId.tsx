import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Ban,
  Bike,
  ChefHat,
  CircleCheck,
  Clock,
  CreditCard,
  MapPin,
  MessageSquare,
  Printer,
  ShoppingBag,
  Truck,
  User,
} from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import {
  getOrderFn,
  updateOrderNotesFn,
  updateOrderStatusFn,
} from "@/server/functions/orders.fn";
import { DispatchDialog } from "@/components/admin/orders/DispatchDialog";
import { buscaNoMapa } from "@/lib/endereco";

export const Route = createFileRoute("/admin/pedidos/$orderId")({
  component: OrderDetailPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const PAYMENT_LABEL: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  CASH: "Dinheiro",
  PAYROLL: "Desconto em folha",
};

const STATUS_META: Record<OrderStatus, { label: string; chip: string }> = {
  RECEIVED: { label: "Recebido", chip: "bg-red-50 text-[#E11D2E]" },
  PREPARING: { label: "Em preparo", chip: "bg-amber-100 text-amber-700" },
  OUT_FOR_DELIVERY: { label: "Saiu p/ entrega", chip: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "Finalizado", chip: "bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "Cancelado", chip: "bg-neutral-200 text-neutral-600" },
};

const STEPS: { status: OrderStatus; label: string; icon: typeof ShoppingBag }[] = [
  { status: "RECEIVED", label: "Recebido", icon: ShoppingBag },
  { status: "PREPARING", label: "Em preparo", icon: ChefHat },
  { status: "OUT_FOR_DELIVERY", label: "Saiu p/ entrega", icon: Bike },
  { status: "COMPLETED", label: "Entregue", icon: CircleCheck },
];

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);

  const { data: order, isPending } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrderFn({ data: { id: orderId } }),
    refetchInterval: 15_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  const changeStatus = useMutation({
    mutationFn: (status: OrderStatus) => updateOrderStatusFn({ data: { id: orderId, status } }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      await refresh();
    },
  });

  const saveNote = useMutation({
    mutationFn: (note: string) =>
      updateOrderNotesFn({ data: { id: orderId, internalNote: note } }),
    onSuccess: async () => {
      setInternalNote(null);
      await refresh();
    },
  });

  if (isPending) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (!order) return <p className="text-sm text-[#E11D2E]">Pedido não encontrado.</p>;

  const historyByStatus = new Map(order.statusHistory.map((h) => [h.status, h.createdAt]));
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);
  const elapsed = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60_000);

  const linkDoMapa = buscaNoMapa({
    street: order.deliveryStreet,
    number: order.deliveryNumber,
    neighborhood: order.deliveryNeighborhood,
    city: order.deliveryCity,
    state: order.deliveryState,
    zipCode: order.deliveryZipCode,
  });

  const next =
    order.status === "RECEIVED"
      ? { status: "PREPARING" as OrderStatus, label: "Colocar na fila" }
      : order.status === "PREPARING"
        ? order.type === "PICKUP"
          ? { status: "COMPLETED" as OrderStatus, label: "Finalizar pedido" }
          : null
        : order.status === "OUT_FOR_DELIVERY"
          ? { status: "COMPLETED" as OrderStatus, label: "Marcar como entregue" }
          : null;

  // A saída para entrega não é um clique a mais na fila: é escolher quem leva.
  // Sem entregador o servidor recusa, então o botão abre a escolha.
  const podeDespachar = order.status === "PREPARING" && order.type === "DELIVERY";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/pedidos"
            className="mb-1 flex items-center gap-1.5 text-sm text-[#E11D2E] hover:underline"
          >
            <ArrowLeft className="size-4" />
            Voltar para pedidos
          </Link>
          <h1 className="text-3xl font-bold text-neutral-900">Detalhes do Pedido</h1>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <Printer className="size-4" />
          Imprimir
        </button>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      <section className="flex flex-wrap items-center gap-6 rounded-2xl border border-neutral-200 bg-white p-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-neutral-900">#{order.number}</span>
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_META[order.status].chip}`}
            >
              {STATUS_META[order.status].label}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Pedido realizado em {dateTime.format(new Date(order.createdAt))}
          </p>
        </div>

        <div className="flex gap-8 border-l border-neutral-200 pl-6">
          <div>
            <p className="text-sm text-neutral-500">Tempo decorrido</p>
            <p className="flex items-center gap-1.5 text-lg font-bold text-neutral-900">
              <Clock className="size-4 text-neutral-400" />
              {elapsed} min
            </p>
          </div>
          {order.estimatedDeliveryAt && (
            <div>
              <p className="text-sm text-neutral-500">Previsão</p>
              <p className="flex items-center gap-1.5 text-lg font-bold text-neutral-900">
                <Clock className="size-4 text-neutral-400" />
                {time.format(new Date(order.estimatedDeliveryAt))}
              </p>
            </div>
          )}
        </div>

        {(next || podeDespachar) && (
          <button
            type="button"
            disabled={changeStatus.isPending}
            onClick={() => {
              if (podeDespachar) setDispatching(true);
              else if (next) changeStatus.mutate(next.status);
            }}
            className="ml-auto rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
          >
            {podeDespachar
              ? order.awaitingCourierSince
                ? "Despachar agora"
                : "Escolher entregador"
              : next?.label}
          </button>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card title="Cliente" icon={User}>
            <p className="text-lg font-bold text-neutral-900">{order.customerName}</p>
            <p className="text-sm text-emerald-700">{order.customerPhone}</p>
            {order.customer && (
              <p className="mt-1 text-xs text-neutral-500">
                {order.customer._count.orders}º pedido • cliente desde{" "}
                {new Date(order.customer.createdAt).toLocaleDateString("pt-BR")}
              </p>
            )}
          </Card>

          {order.type === "DELIVERY" ? (
            <Card title="Entrega" icon={Truck}>
              <p className="text-sm text-neutral-800">
                {order.deliveryStreet}, {order.deliveryNumber}
                {order.deliveryComplement ? ` - ${order.deliveryComplement}` : ""}
              </p>
              <p className="text-sm text-neutral-800">
                {[order.deliveryNeighborhood, order.deliveryCity, order.deliveryState]
                  .filter(Boolean)
                  .join(" - ")}
              </p>
              {/* O bairro e o CEP entram na busca: sem eles o mapa não achava
                  endereço nenhum em rua de nome repetido — e "Rua A" existe em
                  meia dúzia de bairros na mesma cidade. */}
              {linkDoMapa && (
                <a
                  href={linkDoMapa}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#E11D2E] px-3 py-1.5 text-sm text-[#E11D2E] hover:bg-red-50"
                >
                  <MapPin className="size-4" />
                  Ver no mapa
                </a>
              )}

              {order.courier?.name ?? order.courierNameSnapshot ? (
                <p className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3 text-sm text-neutral-800">
                  <Bike className="size-4 text-blue-600" />
                  Levando: <strong>{order.courier?.name ?? order.courierNameSnapshot}</strong>
                  {!order.courier && (
                    <span className="text-xs text-neutral-500">(conta removida)</span>
                  )}
                </p>
              ) : order.awaitingCourierSince ? (
                <p className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3 text-sm font-medium text-orange-700">
                  <Clock className="size-4" />
                  Pronto, aguardando entregador
                </p>
              ) : null}
            </Card>
          ) : (
            <Card title="Retirada no balcão" icon={ShoppingBag}>
              <p className="text-sm text-neutral-600">O cliente retira na loja.</p>
            </Card>
          )}

          <Card title="Pagamento" icon={CreditCard}>
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-800">
                {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  order.paymentStatus === "PAID"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {order.paymentStatus === "PAID" ? "Pago" : "Pendente"}
              </span>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Itens do pedido" icon={ShoppingBag}>
            <ul className="divide-y divide-neutral-100">
              {order.items.map((item) => {
                const extrasTotal = item.extras.reduce((s, e) => s + e.priceSnapshot, 0);
                return (
                  <li key={item.id} className="flex gap-3 py-3">
                    {item.product?.imageUrl && (
                      <img
                        src={item.product.imageUrl}
                        alt=""
                        className="size-12 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900">
                        <span className="text-[#E11D2E]">{item.quantity}x</span>{" "}
                        {item.isHalfAndHalf && item.secondProductNameSnapshot
                          ? `Meia ${item.productNameSnapshot} / ${item.secondProductNameSnapshot}`
                          : item.productNameSnapshot}
                        {item.sizeLabel ? ` ${item.sizeLabel}` : ""}
                      </p>
                      {item.extras.map((e) => (
                        <p
                          key={e.id}
                          className="flex justify-between gap-2 text-xs text-neutral-500"
                        >
                          {/* O grupo antes do nome: na cozinha, um sabor
                              obrigatório e um adicional pago são coisas
                              diferentes, e "+ Morango" não distingue as duas. */}
                          <span>
                            {e.groupNameSnapshot
                              ? e.groupNameSnapshot + ": " + e.nameSnapshot
                              : "+ " + e.nameSnapshot}
                          </span>
                          <span>{currency.format(e.priceSnapshot)}</span>
                        </p>
                      ))}
                      {item.note && (
                        <p className="text-xs italic text-neutral-500">"{item.note}"</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-medium text-neutral-900">
                      {currency.format((item.unitPrice + extrasTotal) * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-3 space-y-1.5 border-t border-neutral-200 pt-3 text-sm">
              <Row label="Subtotal" value={currency.format(order.subtotal)} />
              {order.deliveryFee > 0 && (
                <Row label="Taxa de entrega" value={currency.format(order.deliveryFee)} />
              )}
              {order.discount > 0 && (
                <Row
                  label={
                    order.employeeDiscount > 0
                      ? `Desconto de funcionário${
                          order.employeeNameSnapshot ? ` (${order.employeeNameSnapshot})` : ""
                        }`
                      : `Desconto${order.coupon ? ` (${order.coupon.code})` : ""}`
                  }
                  value={`- ${currency.format(order.discount)}`}
                  accent="text-emerald-700"
                />
              )}
              {/* Por qual regra o desconto saiu, em uma linha, sem o dono ter
                  de abrir o plano e refazer a conta de cabeça. */}
              {order.employeeBenefitNote && (
                <p className="pt-0.5 text-xs text-neutral-500">{order.employeeBenefitNote}</p>
              )}
              {order.paymentMethod === "PAYROLL" && (
                <p className="text-xs text-amber-700">
                  A descontar em folha — o pedido fica em aberto até você quitar.
                </p>
              )}
              <div className="flex items-baseline justify-between border-t border-neutral-200 pt-2">
                <dt className="text-lg font-bold text-neutral-900">Total</dt>
                <dd className="text-lg font-bold text-neutral-900">
                  {currency.format(order.total)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Status do pedido" icon={Clock}>
            <ol className="space-y-4">
              {STEPS.map((step, i) => {
                const at = historyByStatus.get(step.status);
                const done = currentIndex >= i && order.status !== "CANCELLED";
                const Icon = step.icon;
                return (
                  <li key={step.status} className="flex items-start gap-3">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                        done ? "bg-[#E11D2E] text-white" : "bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${done ? "text-neutral-900" : "text-neutral-400"}`}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {at ? dateTime.format(new Date(at)) : "Aguardando"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Observações" icon={MessageSquare}>
          {order.customerNote && (
            <div className="mb-3">
              <p className="text-xs text-neutral-500">Cliente</p>
              <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
                {order.customerNote}
              </p>
            </div>
          )}
          <p className="text-xs text-neutral-500">Interna</p>
          <textarea
            rows={3}
            value={internalNote ?? order.internalNote ?? ""}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Anotação visível apenas para a equipe"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900 placeholder:text-neutral-400"
          />
          {internalNote !== null && (
            <button
              type="button"
              disabled={saveNote.isPending}
              onClick={() => saveNote.mutate(internalNote)}
              className="mt-2 rounded-lg bg-[#E11D2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
            >
              {saveNote.isPending ? "Salvando..." : "Salvar observação"}
            </button>
          )}
        </Card>

        <Card title="Histórico de atualizações" icon={Clock}>
          <ul className="space-y-2">
            {order.statusHistory.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 text-sm">
                <span className="text-neutral-800">
                  {STATUS_META[h.status].label}
                  {h.authorName ? ` — ${h.authorName}` : ""}
                </span>
                <span className="shrink-0 text-neutral-500">
                  {dateTime.format(new Date(h.createdAt))}
                </span>
              </li>
            ))}
          </ul>

          {order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Cancelar o pedido #${order.number}?`)) {
                  changeStatus.mutate("CANCELLED");
                }
              }}
              className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-[#E11D2E] hover:bg-red-50"
            >
              <Ban className="size-4" />
              Cancelar pedido
            </button>
          )}
        </Card>
      </div>

      {dispatching && (
        <DispatchDialog
          order={{
            id: order.id,
            number: order.number,
            customerName: order.customerName,
          }}
          onClose={() => setDispatching(false)}
        />
      )}
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-neutral-900">
        <Icon className="size-4 text-[#E11D2E]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-600">{label}</dt>
      <dd className={accent ?? "text-neutral-900"}>{value}</dd>
    </div>
  );
}
