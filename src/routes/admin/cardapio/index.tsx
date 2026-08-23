import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ImageIcon, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  deleteProductFn,
  getProductFn,
  listProductsFn,
  setProductActiveFn,
} from "@/server/functions/products.fn";
import { ProductForm, type ProductFormValues } from "@/components/admin/products/ProductForm";

export const Route = createFileRoute("/admin/cardapio/")({
  component: ProductsPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Produto = Awaited<ReturnType<typeof listProductsFn>>["products"][number];

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

  const { data: editingProductData } = useQuery({
    queryKey: ["product", editingProductId],
    queryFn: () => getProductFn({ data: { id: editingProductId! } }),
    enabled: !!editingProductId,
  });

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
      {editingProductId && editingProductData?.product && (
        <div className="fixed inset-0 z-9999 flex items-end justify-center bg-black/50 p-4 sm:p-8">
          <div className="flex w-full max-w-5xl flex-col">
            <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-neutral-200 bg-white px-5 py-3">
              <h2 className="text-base font-semibold text-neutral-900">Editar Produto</h2>
              <button
                type="button"
                onClick={() => setEditingProductId(null)}
                aria-label="Fechar"
                className="ml-auto rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="max-h-[90vh] overflow-y-auto rounded-b-2xl border border-neutral-200 bg-white p-5">
              <ProductForm
                productId={editingProductData.product.id}
                initial={buildProductFormValues(editingProductData.product)}
                categories={editingProductData.categories}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-neutral-900">Cardápio - Lista de Produtos</h1>
        <Link
          to="/admin/cardapio/novo"
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c4172a]"
        >
          <Plus className="size-4" />
          Novo produto
        </Link>
      </header>

      <div className="flex flex-wrap gap-3">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-base md:text-sm text-neutral-700"
        >
          <option value="">Todos os produtos</option>
          {data?.categories.map((c) => (
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

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              {/* Sem coluna "Categoria": ela agora é o título de cada bloco, e
                  repeti-la em toda linha só gastaria largura. */}
              <th className="px-5 py-3 font-medium">Produto</th>
              <th className="px-5 py-3 font-medium">Preço</th>
              <th className="px-5 py-3 font-medium">Tamanhos</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>

          {(isPending || data?.products.length === 0) && (
            <tbody>
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-neutral-500">
                  {isPending ? "Carregando..." : "Nenhum produto encontrado."}
                </td>
              </tr>
            </tbody>
          )}

          {agruparPorCategoria(data?.products ?? []).map((grupo) => (
            <tbody key={grupo.id} className="divide-y divide-neutral-100">
              <tr>
                <th
                  colSpan={5}
                  scope="colgroup"
                  className="border-y border-neutral-200 bg-neutral-50 px-5 py-2.5 text-left"
                >
                  <span className="text-sm font-bold text-neutral-900">{grupo.nome}</span>
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    {grupo.produtos.length}{" "}
                    {grupo.produtos.length === 1 ? "produto" : "produtos"}
                  </span>
                </th>
              </tr>
              {grupo.produtos.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="size-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
                        <ImageIcon className="size-4" />
                      </span>
                    )}
                    <span className="font-medium text-neutral-900">{p.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-neutral-900">{currency.format(p.basePrice)}</td>
                <td className="px-5 py-3 text-neutral-600">
                  {p.sizes.length === 0
                    ? "-"
                    : p.sizes.map((s) => s.categorySize.label).join(", ")}
                </td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      toggleActive.mutate({ id: p.id, isActive: !p.isActive })
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      p.isActive
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                    }`}
                  >
                    {p.isActive ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingProductId(p.id)}
                      className="rounded-lg border border-neutral-200 flex min-h-11 min-w-11 items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-100"
                      aria-label={`Editar ${p.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Excluir "${p.name}"? Esta ação não pode ser desfeita.`)) {
                          remove.mutate(p.id);
                        }
                      }}
                      className="rounded-lg border border-neutral-200 flex min-h-11 min-w-11 items-center justify-center text-neutral-600 transition-colors hover:bg-red-50 hover:text-[#E11D2E]"
                      aria-label={`Excluir ${p.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
    </>
  );
}
