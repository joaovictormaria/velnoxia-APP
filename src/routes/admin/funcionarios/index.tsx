import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgePercent, Check, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import {
  deleteEmployeeFn,
  listBenefitPlansFn,
  listEmployeesFn,
  saveEmployeeFn,
  setEmployeeActiveFn,
} from "@/server/functions/employees.fn";

export const Route = createFileRoute("/admin/funcionarios/")({
  component: FuncionariosPage,
});

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** (11) 91234-5678, a partir dos dígitos que estão guardados. */
function telefoneLegivel(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length < 10) return d;
  const ddd = d.slice(0, 2);
  const corpo = d.slice(2);
  const meio = corpo.length > 8 ? corpo.slice(0, 5) : corpo.slice(0, 4);
  return `(${ddd}) ${meio}-${corpo.slice(meio.length)}`;
}

type Rascunho = {
  id: string | null;
  name: string;
  jobTitle: string;
  phone: string;
  planId: string;
  pin: string;
};

const VAZIO: Rascunho = { id: null, name: "", jobTitle: "", phone: "", planId: "", pin: "" };

function FuncionariosPage() {
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const { data: funcionarios } = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployeesFn(),
  });
  const { data: planos } = useQuery({
    queryKey: ["benefit-plans"],
    queryFn: () => listBenefitPlansFn(),
  });

  async function recarregar() {
    await queryClient.invalidateQueries({ queryKey: ["employees"] });
  }

  const salvar = useMutation({
    mutationFn: () =>
      saveEmployeeFn({
        data: {
          id: rascunho.id,
          data: {
            name: rascunho.name.trim(),
            jobTitle: rascunho.jobTitle.trim() || null,
            phone: rascunho.phone,
            planId: rascunho.planId || null,
          },
          pin: rascunho.pin || null,
        },
      }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      setRascunho(VAZIO);
      await recarregar();
    },
    onError: () => setError("Não foi possível salvar. Confira os dados e tente de novo."),
  });

  const alterarAtivo = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => setEmployeeActiveFn({ data: vars }),
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      await recarregar();
    },
  });

  const excluir = useMutation({
    mutationFn: (id: string) => deleteEmployeeFn({ data: { id } }),
    onSuccess: async (res) => {
      setConfirmando(null);
      if (!res.ok) return setError(res.error);
      setError(null);
      await recarregar();
    },
    onError: () => setError("Não foi possível excluir o cadastro."),
  });

  const editando = rascunho.id !== null;
  const podeSalvar =
    rascunho.name.trim().length >= 2 &&
    rascunho.phone.replace(/\D/g, "").length >= 10 &&
    (editando || rascunho.pin.length === 4);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-neutral-900">Funcionários</h1>
        <p className="mt-1 text-sm text-neutral-600">
          O funcionário pede pelo site como qualquer cliente. O sistema o reconhece pelo telefone
          mais o PIN, aplica o desconto do plano dele e respeita a cota do dia. Ele não entra no
          painel e não vê pedido nenhum.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      {!planos?.length && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Você ainda não criou nenhum plano de benefício. Sem plano, o funcionário fica cadastrado
          mas não ganha desconto nenhum.{" "}
          <Link to="/admin/funcionarios/planos" className="font-semibold underline">
            Criar um plano
          </Link>
        </p>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <UserPlus className="size-5 text-[#E11D2E]" />
          {editando ? `Editando ${rascunho.name || "funcionário"}` : "Cadastrar funcionário"}
        </h2>

        <form
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (podeSalvar) salvar.mutate();
          }}
        >
          <Campo rotulo="Nome">
            <input
              value={rascunho.name}
              onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })}
              placeholder="Ex.: Marina"
              className={ENTRADA}
            />
          </Campo>

          <Campo rotulo="Função (opcional)">
            <input
              value={rascunho.jobTitle}
              onChange={(e) => setRascunho({ ...rascunho, jobTitle: e.target.value })}
              placeholder="Ex.: cozinha"
              className={ENTRADA}
            />
          </Campo>

          <Campo rotulo="WhatsApp">
            <input
              value={rascunho.phone}
              onChange={(e) =>
                setRascunho({ ...rascunho, phone: e.target.value.replace(/\D/g, "").slice(0, 13) })
              }
              inputMode="numeric"
              placeholder="11912345678"
              className={ENTRADA}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Tem de ser o mesmo número que ele usa para pedir no site.
            </span>
          </Campo>

          <Campo rotulo="Plano de benefício">
            <select
              value={rascunho.planId}
              onChange={(e) => setRascunho({ ...rascunho, planId: e.target.value })}
              className={ENTRADA}
            >
              <option value="">Sem benefício</option>
              {(planos ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isActive ? "" : " (desativado)"}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo={editando ? "Novo PIN (opcional)" : "PIN de 4 dígitos"}>
            <input
              value={rascunho.pin}
              onChange={(e) =>
                setRascunho({ ...rascunho, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })
              }
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000"
              className={`${ENTRADA} tracking-[0.4em]`}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              {editando
                ? "Deixe em branco para manter o PIN atual."
                : "Combine com ele. É o que confirma que o desconto é dele mesmo."}
            </span>
          </Campo>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={salvar.isPending || !podeSalvar}
              className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
            >
              {salvar.isPending ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => setRascunho(VAZIO)}
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:border-neutral-400"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <Users className="size-5 text-[#E11D2E]" />
          Sua equipe ({funcionarios?.length ?? 0})
        </h2>

        {!funcionarios?.length ? (
          <p className="mt-3 text-sm text-neutral-500">
            Ninguém cadastrado ainda. Cadastre acima quem come na casa.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {funcionarios.map((f: any) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                  <BadgePercent className="size-5 text-[#E11D2E]" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-neutral-900">
                    {f.name}
                    {f.jobTitle && (
                      <span className="ml-2 text-sm font-normal text-neutral-500">{f.jobTitle}</span>
                    )}
                    {!f.isActive && (
                      <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        sem benefício
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {telefoneLegivel(f.phone)} · {f.plano?.name ?? "sem plano"}
                  </p>
                </div>

                <div className="text-right text-sm">
                  <p className="text-neutral-600">
                    {f.pedidosHoje === 0
                      ? "Nada hoje"
                      : `${f.pedidosHoje} ${f.pedidosHoje === 1 ? "pedido" : "pedidos"} hoje`}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {moeda.format(f.descontoNoMes)} no mês
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setRascunho({
                      id: f.id,
                      name: f.name,
                      jobTitle: f.jobTitle ?? "",
                      phone: f.phone,
                      planId: f.plano?.id ?? "",
                      pin: "",
                    })
                  }
                  aria-label={`Editar ${f.name}`}
                  title="Editar"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                >
                  <Pencil className="size-4" />
                </button>

                {/* Só a linha clicada desliga: `isPending` é um estado só para
                    todas, e usá-lo direto fazia a lista inteira piscar junto. */}
                <button
                  type="button"
                  disabled={alterarAtivo.isPending && alterarAtivo.variables?.id === f.id}
                  onClick={() => alterarAtivo.mutate({ id: f.id, isActive: !f.isActive })}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-[#E11D2E] hover:text-[#E11D2E] disabled:opacity-60"
                >
                  {f.isActive ? <X className="size-4" /> : <Check className="size-4" />}
                  {f.isActive ? "Suspender" : "Reativar"}
                </button>

                {/* A confirmação fica na própria linha, ao lado do nome que a
                    pessoa acabou de ler: apagar o cadastro errado não desfaz. */}
                {confirmando === f.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-600">Excluir {f.name}?</span>
                    <button
                      type="button"
                      disabled={excluir.isPending}
                      onClick={() => excluir.mutate(f.id)}
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
                    onClick={() => setConfirmando(f.id)}
                    aria-label={`Excluir o cadastro de ${f.name}`}
                    title="Excluir cadastro"
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 text-neutral-400 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          Suspender tira o benefício na hora e mantém a ficha — férias, afastamento. Excluir apaga o
          cadastro; os pedidos antigos continuam dizendo quem pegou o quê.
        </p>
      </section>
    </div>
  );
}

const ENTRADA =
  "w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-base md:text-sm text-neutral-800 placeholder:text-neutral-400";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">{rotulo}</span>
      {children}
    </label>
  );
}
