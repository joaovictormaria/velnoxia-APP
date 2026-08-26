import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { deleteExtraFn, listExtrasFn, saveExtraFn } from "@/server/functions/extras.fn";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { ExtrasDaPrevia } from "@/components/admin/preview/ExtrasDaPrevia";
import { aplicarRascunhoDeExtra } from "@/lib/previa/aplicar-rascunho";

export const Route = createFileRoute("/admin/cardapio/extras")({
  component: ExtrasPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Dados = Awaited<ReturnType<typeof listExtrasFn>>;
type Extra = Dados["extras"][number];

type Draft = {
  id: string | null;
  name: string;
  price: number;
  isActive: boolean;
  categoryIds: string[];
  productIds: string[];
};

const NOVO: Draft = {
  id: null,
  name: "",
  price: 0,
  isActive: true,
  categoryIds: [],
  productIds: [],
};

/**
 * Os adicionais na hierarquia do cardápio: produto, depois categoria.
 *
 * Organiza por produto: um card por produto com seus extras.
 * Um adicional apareça em categoria ou produto específico.
 */
function agrupar({ extras, categories, products }: Dados, busca: string) {
  const termo = busca.trim().toLowerCase();
  // Acento não pode atrapalhar: quem procura "acucar" tem de achar "Açúcar".
  const semAcento = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const casa = (e: Extra) => !termo || semAcento(e.name).includes(semAcento(termo));

  const porProduto = products
    .map((produto) => {
      // Extras que valem para este produto especificamente
      const dosProduto = extras.filter((e) => e.productIds.includes(produto.id));
      // Extras que valem para toda a categoria do produto
      const daCategoria = extras.filter((e) => e.categoryIds.includes(produto.categoryId));

      // Combinar e filtrar por busca
      const todos = [...daCategoria, ...dosProduto].filter(casa);
      const unicos = [...new Map(todos.map((e) => [e.id, e])).values()];

      return {
        produto,
        categoria: categories.find((c) => c.id === produto.categoryId),
        extras: unicos,
        quantos: unicos.length,
        temAlgum: [...daCategoria, ...dosProduto].length > 0,
      };
    })
    .filter((g) => g.temAlgum);

  /*
   * Adicional que não vale em lugar nenhum. O cadastro não deixa criar assim,
   * mas apagar a última categoria em que ele valia o deixa órfão — e sem este
   * bloco ele sumiria da tela continuando a existir no banco.
   */
  const semAlcance = extras.filter(
    (e) => e.categoryIds.length === 0 && e.productIds.length === 0,
  );

  return { porProduto, semAlcance };
}

function ExtrasPage() {
  const queryClient = useQueryClient();
  const { admin } = useRouteContext({ from: "/admin" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["extras"],
    queryFn: () => listExtrasFn(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["extras"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveExtraFn({
        data: {
          id: d.id,
          data: {
            name: d.name,
            price: d.price,
            isActive: d.isActive,
            categoryIds: d.categoryIds,
            productIds: d.productIds,
          },
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) return setErro(res.error);
      setErro(null);
      setDraft(null);
      invalidate();
    },
    onError: () => setErro("Não foi possível salvar o adicional."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteExtraFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const grupos = data ? agrupar(data, busca) : null;

  function editar(x: Extra) {
    setErro(null);
    setDraft({
      id: x.id,
      name: x.name,
      price: Number(x.price) || 0,
      isActive: x.isActive,
      categoryIds: x.categoryIds,
      productIds: x.productIds,
    });
  }

  function excluir(x: Extra) {
    // O aviso diz "de todos os lugares" porque a linha clicada está dentro de
    // uma categoria: sem isso, apagar dali pareceria tirar só daquele grupo.
    if (confirm(`Excluir "${x.name}" de todos os lugares onde ele é oferecido?`)) {
      remove.mutate(x.id);
    }
  }

  const cardDoExtra = (x: Extra) => (
    <div
      key={x.id}
      className="relative bg-neutral-50 rounded-lg overflow-hidden hover:bg-neutral-100 transition-colors border border-neutral-200"
    >
      <div className="h-1 bg-blue-500" />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div
              className={`font-medium text-xs truncate ${
                x.isActive ? "text-neutral-900" : "text-neutral-400 line-through"
              }`}
              title={x.name}
            >
              {x.name}
            </div>
            <div className="text-sm font-bold text-[#E11D2E]">
              {currency.format(Number(x.price) || 0)}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => editar(x)}
              aria-label={`Editar ${x.name}`}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors text-xs font-semibold"
            >
              <Pencil className="size-3.5" />
              Editar
            </button>
            <button
              type="button"
              onClick={() => excluir(x)}
              aria-label={`Excluir ${x.name}`}
              className="px-1 py-1.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
              title={`Excluir ${x.name}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Extras / Adicionais</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Cada produto tem seus extras organizados em um card. Um adicional pode valer numa
            categoria inteira ou em produtos escolhidos. Ele só é oferecido na tela desses
            produtos — e o pedido recusa o que não estiver na lista.
          </p>
        </div>
        <button
          type="button"
          // Desabilitado enquanto o cardápio não chegou, porque o formulário
          // precisa das categorias e dos produtos para oferecer a escolha. Um
          // botão que aceita o clique e não abre nada é pior que um cinza: a
          // pessoa clica de novo achando que errou a mira.
          disabled={!data}
          title={data ? undefined : "Aguardando o cardápio carregar"}
          onClick={() => {
            setErro(null);
            setDraft(NOVO);
          }}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          Novo extra
        </button>
      </header>

      {/* Uma busca só, e não uma por cartão: procurar "bacon" é procurar na loja inteira. */}
      {data && grupos && grupos.porProduto.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar adicional..."
            aria-label="Buscar adicional"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-base text-neutral-700 placeholder:text-neutral-400 md:text-sm"
          />
        </div>
      )}

      {/* Uma consulta que falha não pode virar tela em branco. Sem isto, o erro
          ficava só no console do servidor e a página parecia vazia — como se a
          loja não tivesse adicional nenhum. */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-[#E11D2E]">
            Não foi possível carregar os adicionais.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 rounded-lg border border-[#E11D2E] px-3 py-1.5 text-sm font-semibold text-[#E11D2E] hover:bg-white"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {erro && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {erro}
        </p>
      )}

      {draft && data && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-4 sm:p-8">
          <div className="flex w-full max-w-2xl flex-col">
            <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-neutral-200 bg-white px-5 py-3">
              <h2 className="text-base font-semibold text-neutral-900">
                {draft.id ? "Editar extra" : "Novo extra"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setErro(null);
                }}
                aria-label="Fechar"
                className="ml-auto rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="size-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
              className="max-h-[80vh] overflow-y-auto rounded-b-2xl border border-neutral-200 bg-white p-5 space-y-5"
            >
              <div className="grid gap-4 lg:grid-cols-5">
                <label className="space-y-1.5 lg:col-span-2">
                  <span className="text-sm font-medium text-neutral-900">Nome</span>
                  <input
                    onFocus={() => setFoco("lista-de-extras")}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    required
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
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
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
                  />
                </label>

                <label className="flex cursor-pointer items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    className="size-4 accent-[#E11D2E]"
                  />
                  <span className="text-sm font-medium text-neutral-900">Ativo</span>
                </label>
              </div>

              <div>
                <p className="text-sm font-medium text-neutral-900">Onde ele pode ser pedido</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Marcar a categoria vale para tudo que estiver nela. Use os produtos avulsos só para exceções.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      const newSet = new Set(expandedCategories);
                      if (newSet.has("categorias")) {
                        newSet.delete("categorias");
                      } else {
                        newSet.add("categorias");
                      }
                      setExpandedCategories(newSet);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-left font-medium text-neutral-900 hover:bg-neutral-100"
                  >
                    <ChevronDown
                      className={`size-4 transition-transform ${
                        expandedCategories.has("categorias") ? "rotate-180" : ""
                      }`}
                    />
                    Categorias inteiras
                  </button>

                  {expandedCategories.has("categorias") && (
                    <div className="max-h-48 space-y-1.5 border border-neutral-200 rounded-lg p-3 bg-white overflow-y-auto">
                      {data.categories.map((c) => (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.categoryIds.includes(c.id)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                categoryIds: e.target.checked
                                  ? [...draft.categoryIds, c.id]
                                  : draft.categoryIds.filter((id) => id !== c.id),
                              })
                            }
                            className="size-4 accent-[#E11D2E]"
                          />
                          <span className="text-sm text-neutral-800">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      const newSet = new Set(expandedCategories);
                      if (newSet.has("produtos")) {
                        newSet.delete("produtos");
                      } else {
                        newSet.add("produtos");
                      }
                      setExpandedCategories(newSet);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-left font-medium text-neutral-900 hover:bg-neutral-100"
                  >
                    <ChevronDown
                      className={`size-4 transition-transform ${
                        expandedCategories.has("produtos") ? "rotate-180" : ""
                      }`}
                    />
                    Produtos avulsos
                  </button>

                  {expandedCategories.has("produtos") && (
                    <div className="max-h-48 space-y-1.5 border border-neutral-200 rounded-lg p-3 bg-white overflow-y-auto">
                      {data.products.map((p) => {
                        const jaPelaCategoria = draft.categoryIds.includes(p.categoryId);
                        return (
                          <label
                            key={p.id}
                            className={`flex cursor-pointer items-center gap-2 ${
                              jaPelaCategoria ? "opacity-50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={jaPelaCategoria}
                              checked={draft.productIds.includes(p.id) && !jaPelaCategoria}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  productIds: e.target.checked
                                    ? [...draft.productIds, p.id]
                                    : draft.productIds.filter((id) => id !== p.id),
                                })
                              }
                              className="size-4 accent-[#E11D2E]"
                            />
                            <span className="text-sm text-neutral-800">
                              {p.name}
                              <span className="ml-1.5 text-xs text-neutral-500">
                                {jaPelaCategoria ? "pela categoria" : p.categoryName}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="rounded-xl bg-[#E11D2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
                >
                  {save.isPending ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setErro(null);
                  }}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPending && <p className="text-sm text-neutral-500">Carregando...</p>}

      {grupos?.semAlcance.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="size-4" />
            Não aparecem em lugar nenhum ({grupos.semAlcance.length})
          </h2>
          <p className="mt-1 text-sm text-amber-900/80">
            Estes adicionais existem, mas a categoria ou o produto onde valiam foi apagado. Edite
            cada um e escolha onde ele deve ser oferecido.
          </p>
          <div className="mt-4 space-y-2">
            {grupos.semAlcance.map(cardDoExtra)}
          </div>
        </section>
      ) : null}

      {grupos && grupos.porProduto.length === 0 && grupos.semAlcance.length === 0 && !isPending && (
        <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Nenhum adicional cadastrado ainda.
        </p>
      )}

      {/* Cartões lado a lado com largura mínima. `auto-fill` adapta ao tamanho da tela. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4 auto-rows-max">
        {grupos?.porProduto.map(({ produto, categoria, extras, quantos }) => (
          <div
            key={produto.id}
            className="flex flex-col rounded-2xl border border-neutral-200 bg-white overflow-hidden"
            style={{ maxHeight: "600px" }}
          >
            {/* Header do produto */}
            <div className="border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-neutral-100 px-4 py-3 sticky top-0 z-10">
              <div className="text-sm font-bold text-neutral-900 truncate" title={produto.name}>
                {produto.name}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5 truncate" title={categoria?.name}>
                {categoria?.name}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {quantos} {quantos === 1 ? "adicional" : "adicionais"}
              </div>
            </div>

            {/* Lista scrollável de extras */}
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {extras.length > 0 && extras.map(cardDoExtra)}

              {quantos === 0 && (
                <p className="py-6 text-center text-sm text-neutral-400">
                  Nenhum adicional encontrado.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
