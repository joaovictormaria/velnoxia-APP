import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bike,
  CheckCircle2,
  LogOut,
  MapPin,
  Navigation,
  NavigationOff,
  Phone,
  Wallet,
} from "lucide-react";
import { logoutFn } from "@/server/functions/auth.fn";
import { useCourierLocation } from "@/lib/use-courier-location";
import {
  listMyDeliveriesFn,
  markDeliveryDoneFn,
} from "@/server/functions/courier-deliveries.fn";

export const Route = createFileRoute("/entregador/")({
  component: MinhasEntregasPage,
});

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const PAGAMENTO: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  CASH: "Dinheiro",
  PAYROLL: "Desconto em folha",
};

type Entrega = Awaited<ReturnType<typeof listMyDeliveriesFn>>["emRota"][number];

/**
 * A tela do motoboy, feita para ser usada de uma mão só no celular.
 *
 * Mostra só o que ele precisa para chegar e entregar: endereço, contato e
 * quanto receber. Nada do painel da loja aparece aqui — o servidor nem
 * responderia, mas a tela também não pergunta.
 */
function MinhasEntregasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["my-deliveries"],
    queryFn: () => listMyDeliveriesFn(),
    // A loja despacha do painel e o celular fica no bolso: sem esta atualização
    // ele só veria a entrega nova ao recarregar a página na mão.
    refetchInterval: 15_000,
  });

  const concluir = useMutation({
    mutationFn: (id: string) => markDeliveryDoneFn({ data: { id } }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["my-deliveries"] });
    },
  });

  async function sair() {
    await logoutFn();
    router.navigate({ to: "/admin/login" });
  }

  const emRota = data?.emRota ?? [];
  const localizacao = useCourierLocation(emRota.length > 0);
  const entregues = data?.entregues ?? [];

  return (
    <div className="min-h-screen bg-neutral-950 pb-10">
      <header className="flex items-center justify-between gap-3 px-5 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Bike className="size-7 shrink-0 text-[#E11D2E]" />
          <div className="min-w-0">
            <p className="truncate font-bold text-white">{data?.courierName ?? "Entregas"}</p>
            <p className="truncate text-xs text-neutral-400">{data?.storeName ?? ""}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={sair}
          className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-400 hover:text-white"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </header>

      <main className="admin-theme mx-auto max-w-lg space-y-4 px-4 text-neutral-900">
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
            {error}
          </p>
        )}

        {emRota.length > 0 && <PainelDeLocalizacao {...localizacao} />}

        {isPending && !data ? (
          <p className="py-10 text-center text-sm text-neutral-400">Carregando...</p>
        ) : emRota.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center">
            <Bike className="mx-auto size-10 text-neutral-300" />
            <p className="mt-3 font-semibold text-neutral-900">Nenhuma entrega agora</p>
            <p className="mt-1 text-sm text-neutral-600">
              Quando a loja passar um pedido para você, ele aparece aqui sozinho.
            </p>
          </div>
        ) : (
          <>
            <h1 className="px-1 text-sm font-bold tracking-wide text-neutral-400 uppercase">
              Na rua ({emRota.length})
            </h1>
            {emRota.map((entrega) => (
              <CartaoDeEntrega
                key={entrega.id}
                entrega={entrega}
                pendente={concluir.isPending}
                onConcluir={() => concluir.mutate(entrega.id)}
              />
            ))}
          </>
        )}

        {entregues.length > 0 && (
          <section className="pt-4">
            <h2 className="px-1 text-sm font-bold tracking-wide text-neutral-400 uppercase">
              Entregues hoje ({entregues.length})
            </h2>
            <ul className="mt-3 space-y-2">
              {entregues.map((entrega) => (
                <li
                  key={entrega.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/90 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900">
                      #{entrega.number} - {entrega.customerName}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {hora.format(new Date(entrega.updatedAt))} · {moeda.format(entrega.total)}
                    </span>
                  </span>
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function CartaoDeEntrega({
  entrega,
  pendente,
  onConcluir,
}: {
  entrega: Entrega;
  pendente: boolean;
  onConcluir: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  const endereco = [entrega.deliveryStreet, entrega.deliveryNumber].filter(Boolean).join(", ");
  const complemento = [entrega.deliveryComplement, entrega.deliveryNeighborhood]
    .filter(Boolean)
    .join(" - ");
  const buscaNoMapa = [endereco, entrega.deliveryNeighborhood, entrega.deliveryCity]
    .filter(Boolean)
    .join(", ");

  // Só o que ainda não foi pago é dinheiro para receber na porta. Pix e cartão
  // já quitados viram uma linha informativa, não uma cobrança.
  //
  // Desconto em folha fica de fora: o pedido segue em aberto de propósito, mas
  // quem acerta é a loja no salário — mandar o entregador cobrar na porta seria
  // pedir duas vezes pela mesma comida.
  const receberNaEntrega =
    entrega.paymentStatus !== "PAID" && entrega.paymentMethod !== "PAYROLL";

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-neutral-900">
          #{entrega.number} - {entrega.customerName}
        </h2>
        <span className="shrink-0 text-sm font-bold text-neutral-900">
          {moeda.format(entrega.total)}
        </span>
      </div>

      <p className="mt-3 flex items-start gap-2 text-sm text-neutral-800">
        <MapPin className="mt-0.5 size-4 shrink-0 text-[#E11D2E]" />
        <span>
          {endereco}
          {complemento && <span className="block text-neutral-600">{complemento}</span>}
        </span>
      </p>

      {entrega.customerNote && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {entrega.customerNote}
        </p>
      )}

      <p className="mt-3 flex items-center gap-2 text-sm">
        <Wallet className="size-4 shrink-0 text-neutral-400" />
        <span className={receberNaEntrega ? "font-semibold text-neutral-900" : "text-neutral-600"}>
          {receberNaEntrega
            ? "Receber " + moeda.format(entrega.total) + " em " + (PAGAMENTO[entrega.paymentMethod] ?? entrega.paymentMethod)
            : "Já pago (" + (PAGAMENTO[entrega.paymentMethod] ?? entrega.paymentMethod) + ")"}
        </span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={"tel:" + entrega.customerPhone}
          className="flex items-center justify-center gap-2 rounded-xl border border-neutral-300 py-3 text-sm font-semibold text-neutral-700"
        >
          <Phone className="size-4" />
          Ligar
        </a>
        <a
          href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(buscaNoMapa)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-neutral-300 py-3 text-sm font-semibold text-neutral-700"
        >
          <MapPin className="size-4" />
          Rota
        </a>
      </div>

      {/* Confirmação em dois toques: marcar entregue finaliza o pedido e não tem
          volta, e o celular vai no bolso junto com a moto. */}
      {confirmando ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-900">Entregou o pedido #{entrega.number}?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-lg border border-neutral-300 bg-white py-2.5 text-sm font-semibold text-neutral-600"
            >
              Ainda não
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={onConcluir}
              className="rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Sim, entreguei
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white"
        >
          <CheckCircle2 className="size-5" />
          Marcar como entregue
        </button>
      )}
    </article>
  );
}

/**
 * Compartilhamento da posição, à vista e desligável.
 *
 * Nunca escondido: é a localização dele que está indo para a tela de um
 * cliente, e ele tem de poder ver isso e cortar quando quiser, sem depender de
 * mexer nas permissões do navegador.
 */
function PainelDeLocalizacao({
  estado,
  ligado,
  ativar,
  desativar,
  ultimoEnvio,
}: ReturnType<typeof useCourierLocation>) {
  if (estado === "sem-suporte") {
    return (
      <div className="rounded-2xl bg-white p-4">
        <p className="text-sm text-neutral-600">
          Este navegador não informa localização, então o cliente não verá a distância. As
          entregas funcionam normalmente.
        </p>
      </div>
    );
  }

  if (estado === "negado") {
    return (
      <div className="rounded-2xl bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <NavigationOff className="size-4 text-neutral-400" />
          Localização bloqueada
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          Você bloqueou a localização para este site. Para voltar a mostrar ao cliente a que
          distância você está, libere nas permissões do navegador e toque em ativar de novo.
        </p>
        <button
          type="button"
          onClick={ativar}
          className="mt-3 w-full rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!ligado) {
    return (
      <div className="rounded-2xl bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Navigation className="size-4 text-[#E11D2E]" />
          Mostrar ao cliente que você está chegando
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          O cliente vê só a distância — nunca o seu endereço nem o seu caminho. Para de valer no
          instante em que você marca a entrega, e você pode desligar quando quiser.
        </p>
        <button
          type="button"
          onClick={ativar}
          className="mt-3 w-full rounded-xl bg-[#E11D2E] py-3 text-sm font-bold text-white"
        >
          Ativar localização
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4">
      <p className="min-w-0 text-sm">
        <span className="flex items-center gap-2 font-semibold text-emerald-700">
          <Navigation className="size-4" />
          {estado === "sem-sinal" ? "Procurando sinal de GPS" : "Compartilhando localização"}
        </span>
        <span className="mt-0.5 block text-xs text-neutral-500">
          {estado === "sem-sinal"
            ? "O cliente não vê a distância enquanto isso."
            : ultimoEnvio
              ? `Atualizado às ${hora.format(ultimoEnvio)}`
              : "Enviando a primeira posição..."}
        </span>
      </p>
      <button
        type="button"
        onClick={desativar}
        className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-600"
      >
        Desligar
      </button>
    </div>
  );
}
