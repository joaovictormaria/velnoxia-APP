import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
 * Os adicionais na hierarquia do cardápio: categoria, depois produto.
 *
 * Um adicional aparece em todos os lugares onde vale — "Bacon extra" ligado a
 * duas categorias aparece nas duas. É repetição de propósito: a pergunta que
 * esta tela responde é "o que este produto oferece?", e não "onde está o
 * bacon?".
 */
function agrupar({ extras, categories, products }: Dados, busca: string) {
  const termo = busca.trim().toLowerCase();
  // Acento não pode atrapalhar: quem procura "acucar" tem de achar "Açúcar".
  const semAcento = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const casa = (e: Extra) => !termo || semAcento(e.name).includes(semAcento(termo));

  const porCategoria = categories
    .map((categoria) => {
      const daCategoria = extras.filter((e) => e.categoryIds.includes(categoria.id));
      const dosProdutos = products
        .filter((p) => p.categoryId === categoria.id)
        .map((produto) => ({
          produto,
          todos: extras.filter((e) => e.productIds.includes(produto.id)),
        }))
        .filter((g) => g.todos.length > 0);

      const naCategoria = daCategoria.filter(casa);
      const porProduto = dosProdutos
        .map((g) => ({ produto: g.produto, extras: g.todos.filter(casa) }))
        .filter((g) => g.extras.length > 0);

      return {
        categoria,
        naCategoria,
        porProduto,
        quantos: naCategoria.length + porProduto.reduce((s, g) => s + g.extras.length, 0),
        /*
         * Se a categoria tem adicionais quando não há busca. O cartão continua
         * na tela enquanto se digita, mostrando "nenhum encontrado" em vez de
         * sumir: cartões que aparecem e somem a cada tecla fazem a grade
         * saltar, e o que a pessoa mirava muda de lugar debaixo do cursor.
         */
        temAlgum: daCategoria.length > 0 || dosProdutos.length > 0,
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

  return { porCategoria, semAlcance };
}

function ExtrasPage() {
  const queryClient = useQueryClient();
  const { admin } = useRouteContext({ from: "/admin" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

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
      price: x.price,
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

  /**
   * Uma linha dentro do cartão.
   *
   * Compacta porque o cartão é estreito: nome e preço na primeira linha, e as
   * ações só aparecem ao passar o mouse ou ao focar pelo teclado. Botões
   * sempre visíveis em cada linha transformavam um cartão de dez adicionais
   * numa parede de vinte botões.
   */
  const linhaDoExtra = (x: Extra) => (
    <li key={x.id} className="group flex items-center gap-2 py-2">
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-medium ${
            x.isActive ? "text-neutral-900" : "text-neutral-400 line-through"
          }`}
          title={x.name}
        >
          {x.name}
        </span>
        <span className="text-xs text-neutral-500 tabular-nums">
          {currency.format(x.price)}
          {!x.isActive && " · inativo"}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={() => editar(x)}
          aria-label={`Editar ${x.name}`}
          className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => excluir(x)}
          aria-label={`Excluir ${x.name}`}
          className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-red-50 hover:text-[#E11D2E]"
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>
    </li>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Extras / Adicionais</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Cada adicional aparece onde você mandar: numa categoria inteira ou em produtos
            escolhidos. Ele só é oferecido na tela desses produtos — e o pedido recusa o que não
            estiver na lista.
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

      {/* Uma busca só, e não uma por cartão: o mesmo adicional costuma estar em
          várias categorias, e procurar "bacon" é procurar na loja inteira. Sete
          caixinhas fariam a pessoa escolher onde digitar antes de procurar. */}
      {data && grupos && grupos.porCategoria.length > 0 && (
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
          className="grid gap-5 rounded-2xl border border-neutral-200 bg-white p-5 lg:grid-cols-5"
        >
          {/* Topo à direita, como nas outras telas. O adicional só aparece na
              tela do produto, nunca no cardápio — é a resposta para quem
              cadastra "Bacon extra" e não vê nada mudar na loja. */}
          {admin && (
            <div className="hidden lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:block">
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

          <div className="space-y-5 lg:col-span-3">
            <div className="flex flex-wrap items-end gap-4">
              <label className="min-w-56 flex-1 space-y-1.5">
                <span className="text-sm font-medium text-neutral-900">Nome</span>
                <input
                  onFocus={() => setFoco("lista-de-extras")}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base text-neutral-900 md:text-sm"
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
                  className="w-32 rounded-lg border border-neutral-200 px-3 py-2 text-base text-neutral-900 md:text-sm"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                  className="size-4 accent-[#E11D2E]"
                />
                <span className="text-sm text-neutral-800">Ativo</span>
              </label>
            </div>

            <div>
              <p className="text-sm font-medium text-neutral-900">Onde ele pode ser pedido</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Marcar a categoria vale para tudo que estiver nela, inclusive os produtos que você
                cadastrar depois. Use os produtos avulsos só para as exceções.
              </p>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <fieldset className="rounded-xl border border-neutral-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Categorias inteiras
                  </legend>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto">
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
                </fieldset>

                <fieldset className="rounded-xl border border-neutral-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Produtos avulsos
                  </legend>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto">
                    {data.products.map((p) => {
                      // Um produto cuja categoria já foi marcada não precisa ser
                      // marcado de novo: dizer isso evita o dono achar que
                      // esqueceu algo e criar alcance duplicado.
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
                              {jaPelaCategoria ? "já vem pela categoria" : p.categoryName}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            </div>

            <div className="flex gap-2">
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
          </div>
        </form>
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
          <ul className="mt-2 divide-y divide-amber-200">
            {grupos.semAlcance.map(linhaDoExtra)}
          </ul>
        </section>
      ) : null}

      {grupos && grupos.porCategoria.length === 0 && grupos.semAlcance.length === 0 && !isPending && (
        <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Nenhum adicional cadastrado ainda.
        </p>
      )}

      {/* Cartões lado a lado, um por categoria. `auto-fill` com largura mínima
          em vez de um número fixo de colunas: quem tem três categorias não fica
          com dois buracos na linha, e quem tem doze aproveita a tela inteira. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
        {grupos?.porCategoria.map(({ categoria, naCategoria, porProduto, quantos }) => (
          <section
            key={categoria.id}
            className="flex flex-col rounded-2xl border border-neutral-200 bg-white"
          >
            <header className="border-b border-neutral-200 px-4 py-3">
              <h2 className="truncate font-bold text-neutral-900" title={categoria.name}>
                {categoria.name}
              </h2>
              <p className="text-xs text-neutral-500">
                {quantos} {quantos === 1 ? "adicional" : "adicionais"}
              </p>
            </header>

            {/* A rolagem é do miolo, não do cartão: o título da categoria fica
                parado enquanto a lista corre, senão numa grade de doze cartões
                ninguém saberia mais de qual categoria está lendo. */}
            <div className="max-h-80 overflow-y-auto px-4 py-1">
              {naCategoria.length > 0 && (
                <ul className="divide-y divide-neutral-100">{naCategoria.map(linhaDoExtra)}</ul>
              )}

              {porProduto.map(({ produto, extras }) => (
                <div key={produto.id} className="mt-2 border-t border-neutral-200 pt-2">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    só em {produto.name}
                  </p>
                  <ul className="divide-y divide-neutral-100">{extras.map(linhaDoExtra)}</ul>
                </div>
              ))}

              {quantos === 0 && (
                <p className="py-6 text-center text-sm text-neutral-400">
                  Nenhum adicional encontrado.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
