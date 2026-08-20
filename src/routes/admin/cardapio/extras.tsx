import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteExtraFn, listExtrasFn, saveExtraFn } from "@/server/functions/extras.fn";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { ExtrasDaPrevia } from "@/components/admin/preview/ExtrasDaPrevia";
import { aplicarRascunhoDeExtra } from "@/lib/previa/aplicar-rascunho";

export const Route = createFileRoute("/admin/cardapio/extras")({
  component: ExtrasPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Draft = { id: string | null; name: string; price: number; isActive: boolean };

function ExtrasPage() {
  const queryClient = useQueryClient();
  const { admin } = useRouteContext({ from: "/admin" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [foco, setFoco] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["extras"],
    queryFn: () => listExtrasFn(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["extras"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveExtraFn({
        data: { id: d.id, data: { name: d.name, price: d.price, isActive: d.isActive } },
      }),
    onSuccess: () => {
      invalidate();
      setDraft(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteExtraFn({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-neutral-900">Extras / Adicionais</h1>
        <button
          type="button"
          onClick={() => setDraft({ id: null, name: "", price: 0, isActive: true })}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
        >
          <Plus className="size-4" />
          Novo extra
        </button>
      </header>

      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
          className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 lg:grid-cols-5"
        >
          {/* Topo à direita, como nas outras telas. O adicional só aparece na
              tela do produto, nunca no cardápio — é a resposta para quem
              cadastra "Bacon extra" e não vê nada mudar na loja. */}
          {admin && (
            <div className="lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1">
              <PreviaDaVitrine
                storeSlug={admin.store.slug}
                foco={foco}
                largura={720}
                aplicar={(payload) => aplicarRascunhoDeExtra(payload, draft)}
              >
                <ExtrasDaPrevia />
              </PreviaDaVitrine>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4 lg:col-span-3">
          <label className="min-w-56 flex-1 space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">Nome</span>
            <input
              onFocus={() => setFoco("lista-de-extras")}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">Preço</span>
            <input
              type="number"
              step="0.01"
              min="0"
              onFocus={() => setFoco("lista-de-extras")}
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              required
              className="w-32 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
            />
          </label>

          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-xl bg-[#E11D2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
          >
            {save.isPending ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Cancelar
          </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Extra</th>
              <th className="px-5 py-3 font-medium">Preço</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isPending && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-neutral-500">
                  Carregando...
                </td>
              </tr>
            )}
            {data?.map((x) => (
              <tr key={x.id} className="hover:bg-neutral-50">
                <td className="px-5 py-3 font-medium text-neutral-900">{x.name}</td>
                <td className="px-5 py-3 text-neutral-900">{currency.format(x.price)}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      x.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {x.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          id: x.id,
                          name: x.name,
                          price: x.price,
                          isActive: x.isActive,
                        })
                      }
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Excluir "${x.name}"?`)) remove.mutate(x.id);
                      }}
                      className="rounded-lg border border-neutral-200 p-1.5 text-neutral-600 hover:bg-red-50 hover:text-[#E11D2E]"
                      aria-label={`Excluir ${x.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
