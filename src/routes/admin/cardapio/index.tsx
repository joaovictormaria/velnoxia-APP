import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ImageIcon, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  deleteProductFn,
  getProductFn,
  listProductsFn,
  setProductActiveFn,
} from "@/server/functions/products.fn";
import { ProductForm, type ProductFormValues } from "@/components/admin/products/ProductForm";
import { getControleDeEstoqueFn } from "@/server/functions/settings.fn";
import type { ProductsWithCategoriesResponse, ProductDetailResponse } from "@/types/api-responses";
import { AvisoDeLimpezaInicial } from "@/components/admin/cardapio/AvisoDeLimpezaInicial";

export const Route = createFileRoute("/admin/cardapio/")({
  component: ProductsPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Produto = ProductsWithCategoriesResponse["products"][number];

/**
 * Os produtos em blocos, um por categoria.
 *
 * Uma lista corrida de trinta itens obrigava a ler a coluna "Categoria" linha a
 * linha para saber onde cada um estava — e é por categoria que o dono pensa o
 * cardápio, tanto que é assim que a vitrine o mostra ao cliente.
 *
 * Agrupa por um Map, e não comparando com a linha anterior: hoje o banco já
 * devolve ordenado por categoria, mas se um dia a ordem mudar, a versão por
 * vizinhança quebraria em silêncio, repetindo a mesma categoria em dois blocos.
 */
function agruparPorCategoria(produtos: Produto[]) {
  const grupos = new Map<string, { nome: string; produtos: Produto[] }>();
  for (const p of produtos) {
    if (!p.category) continue;
    const grupo = grupos.get(p.category.id);
    if (grupo) grupo.produtos.push(p);
    else grupos.set(p.category.id, { nome: p.category.name, produtos: [p] });
  }
  return [...grupos.entries()].map(([id, g]) => ({ id, ...g }));
}

function ProductsPage() {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["products", categoryId, search],
    queryFn: () =>
      listProductsFn({
        data: { categoryId: categoryId || undefined, search: search || undefined },
      }),
  });
  const listData = data as ProductsWithCategoriesResponse | undefined;

  const { data: editingProductData } = useQuery({
    queryKey: ["product", editingProductId],
    queryFn: () => getProductFn({ data: { id: editingProductId! } }),
    enabled: !!editingProductId,
  });
  const detailData = editingProductData as ProductDetailResponse | undefined;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["products"] });

  /**
   * O que deu errado na última ação da lista.
   *
   * NASCEU DE UMA FALHA MUDA. Com o controle de estoque ligado, tentar ativar
   * um produto sem receita nem item vinculado era recusado pelo servidor — e a
   * tela não dizia nada: o interruptor voltava sozinho e o dono ficava clicando
   * sem entender. Este é o ponto onde ele mais encontra a regra, porque é aqui
   * que ele volta depois de montar a receita.
   */
  const [erro, setErro] = useState<string | null>(null);

  /*
   * A loja liga o controle de estoque? Vem do SERVIDOR, e não de um palpite da
   * tela — é o mesmo dado que a guarda consulta para recusar.
   */
  const controleDeEstoque = useQuery({
    queryKey: ["controle-de-estoque"],
    queryFn: () => getControleDeEstoqueFn(),
  });
  const controleAtivo = (controleDeEstoque.data as any)?.ativo ?? false;

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      setProductActiveFn({ data: vars }),
    onSuccess: () => {
      setErro(null);
      return invalidate();
    },
    /*
     * A mensagem do servidor passa INTEIRA. A guarda já explica as três saídas
     * — receita, item vinculado, ou desmarcar a participação no estoque — e
     * trocá-la por um "erro ao ativar" genérico jogaria fora exatamente a parte
     * que ensina o dono a resolver.
     */
    onError: (e: Error) =>
      setErro(e?.message || "Não foi possível alterar este produto."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProductFn({ data: { id } }),
    onSuccess: invalidate,
  });

  /*
   * O que falta neste produto para o estoque segui-lo, em uma frase.
   *
   * SÃO DUAS PENDÊNCIAS DIFERENTES, e chamá-las pelo mesmo nome esconderia a
   * segunda:
   *
   *   sem tipo        o produto é anterior a esta pergunta existir. Não está
   *                   errado — funciona como sempre funcionou — mas ninguém
   *                   disse ao sistema como ele deve funcionar.
   *   tipo sem origem o dono escolheu PRODUÇÃO e ainda não montou a receita.
   *                   É o estado normal logo depois de criar o produto, que
   *                   nasce INATIVO justamente por isso — e sem este aviso ele
   *                   ficaria invisível na vitrine sem dizer por quê.
   *
   * Produto inativo TAMBÉM aparece aqui, e é a diferença que importa: o
   * primeiro caso só vale para produto ativo (um inativo não fura estoque
   * nenhum), o segundo vale principalmente para o inativo, porque é ele que
   * está esperando configuração para poder ser ligado.
   */
  const pendenciaDeEstoque = (p: any): string | null => {
    if (!(p.controlaEstoque ?? true)) return null;
    if (!p.tipoDeControle) {
      return p.isActive ? "Estoque pendente" : null;
    }
    const temFicha = (p.productCompositions?.length ?? 0) > 0;
    const temItem = Boolean(p.inventoryItemId);
    if (p.tipoDeControle === "PRODUCAO" && !temFicha && !temItem) {
      return "Falta a receita";
    }
    if (p.tipoDeControle === "REVENDA" && !temItem) {
      return "Falta o item";
    }
    return null;
  };

  const buildProductFormValues = (p: any): ProductFormValues => ({
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId,
    basePrice: p.basePrice,
    imageUrl: p.imageUrl,
    tag: p.tag,
    isActive: p.isActive,
    // `?? true` cai na regra por omissão, nunca na exceção. Ver $productId.tsx.
    controlaEstoque: p.controlaEstoque ?? true,
    /*
     * NULO É O ESTADO CERTO POR OMISSÃO, e é o oposto do `?? true` acima.
     *
     * `controlaEstoque` tem uma regra e uma exceção, então omitir cai na regra.
     * O tipo de controle não tem padrão nenhum: nulo significa "o dono ainda
     * não escolheu", e inventar uma escolha por ele é justamente o backfill
     * automático que esta fase recusou fazer no banco.
     */
    tipoDeControle: p.tipoDeControle ?? null,
    allowHalfAndHalf: p.allowHalfAndHalf,
    halfPizzaPricingRule: p.halfPizzaPricingRule,
    sortOrder: p.sortOrder,
    sizes: p.sizes.map((s: any) => ({
      categorySizeId: s.categorySizeId,
      price: s.price,
      isAvailable: s.isAvailable,
    })),
    optionGroups: p.optionGroups.map((g: any) => ({
      name: g.name,
      minChoices: g.minChoices,
      maxChoices: g.maxChoices,
      freeChoices: g.freeChoices,
      options: g.options.map((o: any) => ({ name: o.name, price: o.price })),
    })),
    // O vinculo com o estoque, para o seletor abrir ja no item certo.
    inventoryItemId: (p as any).inventoryItemId ?? null,
  });

  return (
    <>
      {editingProductId && detailData?.product && (
        <>
          <style>{`body { overflow: hidden; }`}</style>
          <div className="fixed inset-0 z-9999 flex items-end justify-center bg-black/50 p-4 sm:p-8">
          <div className="flex w-full max-w-7xl flex-col">
            <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-neutral-200 bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setEditingProductId(null)}
                aria-label="Voltar"
                className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <ArrowLeft className="size-5" />
              </button>
              <h2 className="text-base font-semibold text-neutral-900">Editar Produto</h2>
            </div>

            <div className="max-h-[90vh] overflow-y-auto rounded-b-2xl border border-neutral-200 bg-white p-5">
              <ProductForm
                productId={detailData.product.id}
                initial={buildProductFormValues(detailData.product)}
                categories={detailData.categories as any}
                onSuccess={() => setEditingProductId(null)}
              />
            </div>
          </div>
        </div>
        </>
      )}

      <div className="space-y-6">
      <AvisoDeLimpezaInicial />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-neutral-900">Cardápio - Lista de Produtos</h1>
      </header>

      {/*
        Fica no topo da lista, e não junto do interruptor: a recusa é um texto
        de três linhas, e enfiá-la dentro da linha do produto quebraria a tabela
        inteira justamente na hora em que o dono precisa ler com calma.
      */}
      {erro && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-[#E11D2E]">{erro}</p>
          <button
            type="button"
            onClick={() => setErro(null)}
            className="shrink-0 text-sm text-red-400 hover:text-[#E11D2E]"
            aria-label="Fechar aviso"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700"
        >
          <option value="">Todos os produtos</option>
          {listData?.categories.map((c: { id: string; name: string }) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="relative w-full min-w-0 flex-1 sm:min-w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-9 pr-3 text-sm text-neutral-700 placeholder:text-neutral-400"
          />
        </div>
      </div>

      {isPending ? (
        <div className="text-center py-10 text-neutral-500">Carregando...</div>
      ) : listData?.products.length === 0 ? (
        <div className="text-center py-10 text-neutral-500">Nenhum produto encontrado.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-max">
          {agruparPorCategoria(listData?.products ?? []).map((grupo) => (
            <div
              key={grupo.id}
              className="flex flex-col rounded-2xl border border-neutral-200 bg-white overflow-hidden"
              style={{ maxHeight: "600px" }}
            >
              {/* Header da categoria */}
              <div className="border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-neutral-100 px-4 py-3 sticky top-0 z-10">
                <div className="text-sm font-bold text-neutral-900">{grupo.nome}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {grupo.produtos.length} {grupo.produtos.length === 1 ? "item" : "itens"}
                </div>
              </div>

              {/* Lista scrollável de produtos */}
              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {grupo.produtos.map((p) => (
                  <div key={p.id} className="relative bg-neutral-50 rounded-lg overflow-hidden hover:bg-neutral-100 transition-colors border border-neutral-200">
                    {/* Barra colorida no topo */}
                    <div className="h-1 bg-blue-500" />
                    {/* Conteúdo do card */}
                    <div className="p-3">
                    {/*
                      `flex-wrap`, e o motivo é aritmético.

                      A linha custa 160px fixos antes do nome: foto (40),
                      os dois gaps (16) e os botões Editar+Excluir (104). Nos
                      breakpoints em que a grade abre 4 colunas de categoria, o
                      card inteiro tem 160px — e sobrava ZERO para o nome, que
                      desaparecia atrás dos botões. Medido: 0px a 1280, 40px a
                      1440, contra 150px confortáveis a 820.

                      Com a quebra, os botões descem para a segunda linha
                      exatamente onde o nome não caberia, e nada muda onde já
                      cabia — tablet e celular continuam com a linha única de
                      sempre.
                    */}
                    <div className="flex flex-wrap items-center gap-2">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="size-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-neutral-200 text-neutral-400">
                          <ImageIcon className="size-4" />
                        </span>
                      )}
                      {/*
                        `basis-24` (96px) é o que faz a quebra acontecer: sem um
                        piso, o nome continuaria encolhendo até zero em vez de
                        empurrar os botões para baixo. `min-w-0` fica porque é
                        ele que permite ao `truncate` cortar um nome longo.
                      */}
                      <div className="flex-1 basis-24 min-w-0">
                        <div className="font-medium text-neutral-900 text-xs truncate">
                          {p.name}
                        </div>
                        {/*
                          O produto legado, que nunca respondeu à pergunta de
                          estoque. Não está errado — continua vendendo como
                          sempre vendeu. O selo existe para que o dono SAIBA
                          que existe uma resposta a dar, em vez de descobrir
                          pela diferença no inventário do mês seguinte.

                          Só com o controle ligado: numa loja que não usa
                          estoque isto seria um aviso sobre um assunto que ela
                          não tem.
                        */}
                        {controleAtivo && pendenciaDeEstoque(p) && (
                          /*
                            `block` + `truncate`, e não `inline-block`.
                            O card desta listagem é estreito, e um `inline-block`
                            não encolhe: o texto do selo empurrava a coluna,
                            escondia o nome do produto e passava por baixo dos
                            botões. O `title` guarda a frase inteira para quem
                            passar o mouse.
                          */
                          <span
                            title={pendenciaDeEstoque(p)!}
                            className="mt-0.5 block max-w-full truncate rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                          >
                            {pendenciaDeEstoque(p)}
                          </span>
                        )}
                        <div className="text-sm font-bold text-[#E11D2E]">
                          R$ {Number(p.basePrice).toFixed(2).replace(".", ",")}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingProductId(p.id)}
                          className="flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors text-xs font-semibold"
                          title={`Editar ${p.name}`}
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Excluir "${p.name}"?`)) {
                              remove.mutate(p.id);
                            }
                          }}
                          className="px-1 py-1.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                          title={`Excluir ${p.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botão flutuante de novo produto */}
      <Link
        to="/admin/cardapio/novo"
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c4172a] shadow-lg"
      >
        <Plus className="size-4" />
        Novo produto
      </Link>
    </div>
    </>
  );
}
