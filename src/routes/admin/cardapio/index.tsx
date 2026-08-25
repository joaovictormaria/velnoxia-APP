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
import type { ProductsWithCategoriesResponse, ProductDetailResponse } from "@/types/api-responses";

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

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      setProductActiveFn({ data: vars }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProductFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const buildProductFormValues = (p: any): ProductFormValues => ({
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId,
    basePrice: p.basePrice,
    imageUrl: p.imageUrl,
    tag: p.tag,
    isActive: p.isActive,
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
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-neutral-900">Cardápio - Lista de Produtos</h1>
      </header>

      <div className="flex flex-wrap gap-3">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-base md:text-sm text-neutral-700"
        >
          <option value="">Todos os produtos</option>
          {listData?.categories.map((c: { id: string; name: string }) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="relative w-full min-w-0 flex-1 sm:min-w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-base md:text-sm text-neutral-700 placeholder:text-neutral-400"
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
                    <div className="flex items-center gap-2">
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
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-neutral-900 text-xs truncate">
                          {p.name}
                        </div>
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
