import { createFileRoute } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bike, Check, Copy, KeyRound, Trash2, UserPlus, Users, X } from "lucide-react";
import {
  createCourierInviteFn,
  deleteCourierFn,
  listCourierInvitesFn,
  listCouriersFn,
  revokeCourierInviteFn,
  setCourierActiveFn,
} from "@/server/functions/courier-invites.fn";

/*
  MÓDULO PAGO — DELIVERY_AVANCADO.

  O delivery BÁSICO não passa por aqui: aceitar pedido de entrega, endereço,
  taxa, frete grátis, pedido mínimo e tempo estimado são do plano básico e
  ficam em Configurações e no checkout. Esta tela é a FROTA — convidar,
  ativar, desativar e revogar entregador —, e é ela que o Premium vende.
*/
export const Route = createFileRoute("/admin/entregadores/")(
  rotaPremium("DELIVERY_AVANCADO", EntregadoresPage),
);

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function EntregadoresPage() {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** O código recém-gerado. Só existe aqui: o servidor guarda o hash e nunca o
   *  devolve, então sair da tela sem copiar significa gerar outro. */
  const [codigoNovo, setCodigoNovo] = useState<{ code: string; name: string } | null>(null);

  const { data: couriers } = useQuery({ queryKey: ["couriers"], queryFn: () => listCouriersFn() });
  const { data: invites } = useQuery({
    queryKey: ["courier-invites"],
    queryFn: () => listCourierInvitesFn(),
  });

  const criar = useMutation({
    mutationFn: () => createCourierInviteFn({ data: { name: nome.trim() } }),
    onSuccess: async (res) => {
      setError(null);
      setCodigoNovo({ code: res.code, name: res.invite.name });
      setNome("");
      await queryClient.invalidateQueries({ queryKey: ["courier-invites"] });
    },
    onError: () => setError("Não foi possível gerar o convite. Confira o nome e tente de novo."),
  });

  const revogar = useMutation({
    mutationFn: (id: string) => revokeCourierInviteFn({ data: { id } }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["courier-invites"] });
    },
  });

  /** Quem está com a exclusão pendente de confirmação. Um por vez. */
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const excluir = useMutation({
    mutationFn: (id: string) => deleteCourierFn({ data: { id } }),
    onSuccess: async (res) => {
      setConfirmando(null);
      if (!res.ok) return setError(res.error);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["couriers"] });
    },
    onError: () => setError("Não foi possível excluir a conta."),
  });

  const alterarAcesso = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => setCourierActiveFn({ data: vars }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["couriers"] });
    },
  });

  const pendentes = (invites ?? []).filter((i) => !i.usedAt && new Date(i.expiresAt) > new Date());

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-neutral-900">Entregadores</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cada entregador cria a própria senha com um código que você entrega a ele. Você nunca
          precisa saber a senha dele, e ele só enxerga as entregas que você passar.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <UserPlus className="size-5 text-[#E11D2E]" />
          Convidar um entregador
        </h2>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim().length >= 2) criar.mutate();
          }}
        >
          <label className="w-full min-w-0 flex-1 sm:min-w-64">
            <span className="mb-1.5 block text-sm font-medium text-neutral-700">
              Nome do entregador
            </span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Carlos"
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-base md:text-sm text-neutral-800 placeholder:text-neutral-400"
            />
          </label>
          <button
            type="submit"
            disabled={criar.isPending || nome.trim().length < 2}
            className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
          >
            {criar.isPending ? "Gerando..." : "Gerar código"}
          </button>
        </form>

        {codigoNovo && <CodigoGerado dados={codigoNovo} onFechar={() => setCodigoNovo(null)} />}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <KeyRound className="size-5 text-[#E11D2E]" />
          Convites em aberto ({pendentes.length})
        </h2>

        {pendentes.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nenhum convite esperando. Os códigos valem 24 horas e param de servir depois disso.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {pendentes.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-neutral-900">{invite.name}</p>
                  <p className="text-xs text-neutral-500">
                    vale até {dataHora.format(new Date(invite.expiresAt))}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={revogar.isPending}
                  onClick={() => revogar.mutate(invite.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-[#E11D2E] hover:text-[#E11D2E] disabled:opacity-60"
                >
                  <Trash2 className="size-4" />
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <Users className="size-5 text-[#E11D2E]" />
          Sua equipe ({couriers?.length ?? 0})
        </h2>

        {!couriers?.length ? (
          <p className="mt-3 text-sm text-neutral-500">
            Ninguém entrou ainda. Gere um código e passe para o seu motoboy.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {couriers.map((courier) => (
              <li key={courier.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Bike className="size-5 text-[#E11D2E]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-neutral-900">
                    {courier.name}
                    {!courier.isActive && (
                      <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        sem acesso
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{courier.email}</p>
                </div>
                <span className="text-sm text-neutral-600">
                  {courier.activeDeliveries === 0 ? "Livre" : courier.activeDeliveries + " na rua"}
                </span>
                {/* Só o botão clicado desliga. isPending é um estado só para os
                    três, e usá-lo direto fazia todos piscarem juntos a cada
                    clique — parecia que o clique tinha ido para outra linha. */}
                <button
                  type="button"
                  disabled={
                    alterarAcesso.isPending && alterarAcesso.variables?.id === courier.id
                  }
                  onClick={() =>
                    alterarAcesso.mutate({ id: courier.id, isActive: !courier.isActive })
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-[#E11D2E] hover:text-[#E11D2E] disabled:opacity-60"
                >
                  {courier.isActive ? <X className="size-4" /> : <Check className="size-4" />}
                  {courier.isActive ? "Tirar acesso" : "Devolver acesso"}
                </button>

                {/* Exclusão pede confirmação na própria linha, e o botão só
                    aparece depois que o nome já foi lido ali do lado — apagar
                    a conta errada não tem desfazer. */}
                {confirmando === courier.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-600">Excluir {courier.name}?</span>
                    <button
                      type="button"
                      disabled={excluir.isPending}
                      onClick={() => excluir.mutate(courier.id)}
                      className="rounded-lg bg-[#E11D2E] px-3 py-1.5 font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(null)}
                      className="text-neutral-500 hover:text-neutral-800"
                    >
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmando(courier.id)}
                    aria-label={`Excluir a conta de ${courier.name}`}
                    title="Excluir conta"
                    className="rounded-lg border border-neutral-300 flex min-h-11 min-w-11 items-center justify-center text-neutral-400 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** O código aparece uma única vez — daí o aviso e o botão de copiar. */
function CodigoGerado({
  dados,
  onFechar,
}: {
  dados: { code: string; name: string };
  onFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="mt-5 rounded-xl border-2 border-dashed border-[#E11D2E] bg-red-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-neutral-800">Código para {dados.name} entrar</p>
        <button
          type="button"
          onClick={onFechar}
          className="text-neutral-400 hover:text-neutral-700"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="block w-full break-all rounded-lg bg-white px-3 py-2.5 text-xl font-bold tracking-[0.2em] text-neutral-900 sm:w-auto sm:px-4 sm:text-2xl sm:tracking-[0.3em]">
          {dados.code}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(dados.code);
            setCopiado(true);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[#E11D2E] px-3 py-2 text-sm font-semibold text-[#E11D2E] hover:bg-white"
        >
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>

      <p className="mt-3 text-sm text-neutral-700">
        Anote ou mande agora para ele: <strong>este código não aparece de novo</strong>. Ele abre{" "}
        <strong>/entregador/entrar</strong>, digita o código e monta a própria senha. Vale por 24
        horas e some no primeiro uso.
      </p>
    </div>
  );
}
