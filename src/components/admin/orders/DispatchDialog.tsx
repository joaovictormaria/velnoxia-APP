import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bike, Clock, UserPlus, X } from "lucide-react";
import { listCouriersFn } from "@/server/functions/courier-invites.fn";
import { dispatchOrderFn, setOrderAwaitingCourierFn } from "@/server/functions/orders.fn";

export type DispatchTarget = { id: string; number: number; customerName: string };

/**
 * Passo obrigatório entre "em preparo" e "saiu para entrega".
 *
 * Existe porque entrega não sai sem entregador — o servidor recusa —, então a
 * escolha precisa de um lugar. Quando não há ninguém para levar, a saída daqui
 * é a lista de espera, nunca um pedido solto na rua sem responsável.
 */
export function DispatchDialog({
  order,
  onClose,
}: {
  order: DispatchTarget;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: couriers, isPending } = useQuery({
    queryKey: ["couriers"],
    queryFn: () => listCouriersFn(),
  });

  const disponiveis = (couriers ?? []).filter((c) => c.isActive);

  async function aoConcluir() {
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
    await queryClient.invalidateQueries({ queryKey: ["order"] });
    queryClient.invalidateQueries({ queryKey: ["couriers"] });
    onClose();
  }

  const despachar = useMutation({
    mutationFn: (courierId: string) => dispatchOrderFn({ data: { id: order.id, courierId } }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      await aoConcluir();
    },
  });

  const aguardar = useMutation({
    mutationFn: () => setOrderAwaitingCourierFn({ data: { id: order.id, awaiting: true } }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      await aoConcluir();
    },
  });

  const ocupado = despachar.isPending || aguardar.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="admin-theme max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-neutral-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Bike className="size-5 text-[#E11D2E]" />
              Quem vai levar?
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Pedido #{order.number} · {order.customerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
            {error}
          </p>
        )}

        {isPending ? (
          <p className="mt-6 text-sm text-neutral-500">Carregando entregadores...</p>
        ) : disponiveis.length === 0 ? (
          <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm text-neutral-700">
              Nenhum entregador com acesso ativo. Crie um convite para o motoboy montar a conta
              dele — leva um minuto.
            </p>
            <Link
              to="/admin/entregadores"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#E11D2E] px-3 py-2 text-sm font-semibold text-[#E11D2E] hover:bg-red-50"
            >
              <UserPlus className="size-4" />
              Cadastrar entregador
            </Link>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {disponiveis.map((courier) => (
              <li key={courier.id}>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    setError(null);
                    despachar.mutate(courier.id);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-left transition-colors hover:border-[#E11D2E] hover:bg-red-50 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-neutral-900">
                      {courier.name}
                    </span>
                    {/* Quantas ele já leva agora: é o que evita empilhar tudo
                        no mesmo motoboy sem perceber. */}
                    <span className="block text-xs text-neutral-500">
                      {courier.activeDeliveries === 0
                        ? "Livre"
                        : `${courier.activeDeliveries} entrega(s) em andamento`}
                    </span>
                  </span>
                  <Bike className="size-5 shrink-0 text-neutral-400" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            setError(null);
            aguardar.mutate();
          }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
        >
          <Clock className="size-4" />
          Ninguém agora — deixar aguardando
        </button>
        <p className="mt-2 text-center text-xs text-neutral-500">
          O pedido fica no topo do quadro até alguém pegar. O cliente continua vendo "em preparo".
        </p>
      </div>
    </div>
  );
}
