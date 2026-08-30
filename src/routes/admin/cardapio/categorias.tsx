import { createFileRoute } from "@tanstack/react-router";
import { SizePicker } from "@/components/admin/menu/SizePicker";
import { IconPicker } from "@/components/admin/menu/IconPicker";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { CategorySaboresSection } from "@/components/site/pizzaria2/CategorySaboresSection";
import { SecaoDoCardapio } from "@/components/site/pizzaria2/SecaoDoCardapio";
import { aplicarRascunhoDeCategoria, SLUG_DA_NOVA } from "@/lib/previa/aplicar-rascunho";
import { getBusinessTypeFn } from "@/server/functions/settings.fn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  deleteCategoryFn,
  listCategoriesFn,
  saveCategoryFn,
} from "@/server/functions/categories.fn";
import { AvisoDeLimpezaInicial } from "@/components/admin/cardapio/AvisoDeLimpezaInicial";

export const Route = createFileRoute("/admin/cardapio/categorias")({
  component: CategoriesPage,
});

type Draft = {
  id: string | null;
  name: string;
  slug: string;
  icon: string;
  badge: string;
  headline: string;
  subhead: string;
  kind: "PIZZA" | "SIMPLE";
  /** Nomes dos tamanhos, na ordem em que o cliente os vê. */
  sizes: string[];
  sortOrder: number;
  isActive: boolean;
};

const EMPTY: Draft = {
  id: null,
  name: "",
  slug: "",
  icon: "",
  badge: "",
  headline: "",
  subhead: "",
  kind: "SIMPLE",
  sizes: [],
  sortOrder: 0,
  isActive: true,
};

function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function CategoriesPage() {
  const { admin } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Onde a prévia deve olhar. Muda quando um campo recebe o cursor. */
  const [foco, setFoco] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategoriesFn(),
  });

  // O ramo decide quais tamanhos são sugeridos: uma marmitaria não deve ver
  // "Brotinho" na lista.
  const { data: businessType } = useQuery({
    queryKey: ["business-type"],
    queryFn: () => getBusinessTypeFn(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveCategoryFn({
        data: {
          id: d.id,
          data: {
            name: d.name,
            slug: d.slug,
            icon: d.icon || null,
            badge: d.badge || null,
            headline: d.headline || null,
            subhead: d.subhead || null,
            kind: d.kind,
            sizes: d.sizes,
            sortOrder: d.sortOrder,
            isActive: d.isActive,
          },
        },
      }),
    onSuccess: () => {
      invalidate();
      setDraft(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategoryFn({ data: { id } }),
    onSuccess: (res) => {
      if (!res.ok) setError(res.error);
      else invalidate();
    },
  });

  return (
    <div className="space-y-6">
      <AvisoDeLimpezaInicial />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-neutral-900">Categorias</h1>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setFoco(null);
            setDraft({ ...EMPTY, sortOrder: (data?.length ?? 0) + 1 });
          }}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
        >
          <Plus className="size-4" />
          Nova categoria
        </button>
      </header>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fechar"
            className="-m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {draft && (
        <div key={draft.id || "novo"} className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-4 sm:p-8">
          <div className="flex w-full max-w-5xl flex-col">
            <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-neutral-200 bg-white px-5 py-3">
              <h2 className="text-base font-semibold text-neutral-900">
                {draft.id ? "Editar categoria" : "Nova categoria"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Fechar"
                className="ml-auto rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="size-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                save.mutate(draft);
              }}
              className="max-h-[90vh] overflow-y-auto rounded-b-2xl border border-neutral-200 bg-white p-5 grid grid-cols-1 gap-4 lg:grid-cols-5"
            >
            {/* Canto superior direito, ocupando as três primeiras linhas: os campos
                de identidade ficam ao lado dela, e o resto do formulário corre
                por baixo em largura inteira.
                admin é null nas rotas públicas da moldura; aqui nunca, mas o tipo
                precisa da guarda para não depender dessa suposição. */}

          <label className="space-y-1.5 lg:col-span-2">
            <span className="text-sm font-medium text-neutral-900">Nome</span>
            <input
              onFocus={() => setFoco("nome-da-categoria")}
              value={draft.name}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  name: e.target.value,
                  slug: draft.id ? draft.slug : slugify(e.target.value),
                })
              }
              required
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">Selo</span>
            <input
              onFocus={() => setFoco("selo-da-categoria")}
              value={draft.badge}
              onChange={(e) => setDraft({ ...draft, badge: e.target.value })}
              placeholder="Sabores que todo mundo ama"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">Ordem</span>
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
            />
          </label>

          <div
            className="space-y-1.5 md:col-span-3"
            onFocusCapture={() => setFoco("icone-da-categoria")}
          >
            <span className="block text-sm font-medium text-neutral-900">Ícone</span>
            <IconPicker
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
              businessType={businessType ?? ""}
            />
            <span className="block text-xs text-neutral-500">
              Aparece ao lado do selo e no lugar da foto, nos produtos desta categoria que
              ainda não têm imagem. Clique de novo para tirar.
            </span>
          </div>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">Descrição — 1ª linha</span>
            <input
              onFocus={() => setFoco("descricao-da-categoria")}
              value={draft.headline}
              onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
              placeholder="Os clássicos que nunca saem de moda."
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">Descrição — 2ª linha</span>
            <input
              onFocus={() => setFoco("descricao-da-categoria")}
              value={draft.subhead}
              onChange={(e) => setDraft({ ...draft, subhead: e.target.value })}
              placeholder="Ingredientes selecionados em cada receita."
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </label>

          <div className="lg:col-span-2 space-y-1.5">
            <span className="block text-sm font-medium text-neutral-700">
              Tamanho, quantidade, Litros...
            </span>
            <SizePicker
              value={draft.sizes}
              onChange={(sizes) => setDraft({ ...draft, sizes })}
              businessType={businessType ?? ""}
            />
          </div>

          <div className="lg:col-span-3 flex items-end">
            <span className="text-xs text-neutral-500">
              Cada produto desta categoria recebe um preço por tamanho. Sem nenhum tamanho, a
              categoria vende pelo preço único — o normal em bebidas e porções. Apagar um
              tamanho apaga os preços dele em todos os produtos.
            </span>
          </div>

          {admin && (
            <div className="lg:col-span-5">
              <PreviaDaVitrine
                storeSlug={admin.store.slug}
                altura={360}
                foco={foco}
                aplicar={(payload) => aplicarRascunhoDeCategoria(payload, draft)}
              >
                <SecaoDoCardapio>
                  <CategorySaboresSection defaultCategorySlug={draft.slug || SLUG_DA_NOVA} />
                </SecaoDoCardapio>
              </PreviaDaVitrine>
            </div>
          )}

          <div className="flex items-center gap-2 lg:col-span-5">
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
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Categoria</th>
              <th className="px-5 py-3 font-medium">Ícone</th>
              <th className="px-5 py-3 font-medium">Produtos</th>
              <th className="px-5 py-3 font-medium">Ordem</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isPending && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-neutral-500">
                  Carregando...
                </td>
              </tr>
            )}
            {data?.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-5 py-3 font-medium text-neutral-900">{c.name}</td>
                <td className="px-5 py-3 text-neutral-600">{c.icon ?? "-"}</td>
                <td className="px-5 py-3 text-neutral-600">{c._count.products}</td>
                <td className="px-5 py-3 text-neutral-600">{c.sortOrder}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      c.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {c.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setFoco(null);
                        setDraft({
                          id: c.id,
                          name: c.name,
                          slug: c.slug,
                          icon: c.icon ?? "",
                          badge: c.badge ?? "",
                          headline: c.headline ?? "",
                          subhead: c.subhead ?? "",
                          kind: c.kind,
                          sizes: c.sizes.map((t) => t.label),
                          sortOrder: c.sortOrder,
                          isActive: c.isActive,
                        });
                      }}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Excluir a categoria "${c.name}"?`)) remove.mutate(c.id);
                      }}
                      className="rounded-lg border border-neutral-200 flex min-h-11 min-w-11 items-center justify-center text-neutral-600 hover:bg-red-50 hover:text-[#E11D2E]"
                      aria-label={`Excluir ${c.name}`}
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
