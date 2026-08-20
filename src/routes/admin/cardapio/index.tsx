import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ImageIcon, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  deleteProductFn,
  listProductsFn,
  setProductActiveFn,
} from "@/server/functions/products.fn";

export const Route = createFileRoute("/admin/cardapio/")({
  component: ProductsPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function ProductsPage() {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["products", categoryId, search],
    queryFn: () =>
      listProductsFn({
        data: { categoryId: categoryId || undefined, search: search || undefined },
      }),
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

  return (
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
              <th className="px-5 py-3 font-medium">Produto</th>
              <th className="px-5 py-3 font-medium">Categoria</th>
              <th className="px-5 py-3 font-medium">Preço</th>
              <th className="px-5 py-3 font-medium">Tamanhos</th>
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
            {data?.products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-neutral-500">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
            {data?.products.map((p) => (
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
                <td className="px-5 py-3 text-neutral-600">{p.category.name}</td>
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
                    <Link
                      to="/admin/cardapio/$productId"
                      params={{ productId: p.id }}
                      className="rounded-lg border border-neutral-200 p-2 text-neutral-600 transition-colors hover:bg-neutral-100"
                      aria-label={`Editar ${p.name}`}
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Excluir "${p.name}"? Esta ação não pode ser desfeita.`)) {
                          remove.mutate(p.id);
                        }
                      }}
                      className="rounded-lg border border-neutral-200 p-2 text-neutral-600 transition-colors hover:bg-red-50 hover:text-[#E11D2E]"
                      aria-label={`Excluir ${p.name}`}
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
