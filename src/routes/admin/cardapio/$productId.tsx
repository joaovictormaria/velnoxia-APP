import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProductForm, type ProductFormValues } from "@/components/admin/products/ProductForm";
import { getProductFn } from "@/server/functions/products.fn";
import type { ProductDetailResponse } from "@/types/api-responses";

export const Route = createFileRoute("/admin/cardapio/$productId")({
  component: EditProductPage,
});

function EditProductPage() {
  const { productId } = Route.useParams();
  const { data, isPending } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => getProductFn({ data: { id: productId } }),
  });
  const product = data as ProductDetailResponse | undefined;

  if (isPending || !product) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (!product.product) return <p className="text-sm text-[#E11D2E]">Produto não encontrado.</p>;

  const p = product.product;
  const initial: ProductFormValues = {
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId,
    basePrice: Number(p.basePrice),
    imageUrl: p.imageUrl,
    tag: p.tag,
    isActive: p.isActive,
    /*
     * `?? true` cobre o produto lido por um caminho que ainda não devolve a
     * coluna. Cair na REGRA por omissão é o padrão seguro: o contrário faria
     * um produto virar exceção sozinho, sem ninguém ter pedido.
     */
    controlaEstoque: (p as any).controlaEstoque ?? true,
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
    sizes: p.sizes?.map((s: any) => ({
      categorySizeId: s.categorySizeId,
      price: s.price,
      isAvailable: s.isAvailable,
    })) ?? [],
    optionGroups: (p as any).optionGroups?.map((g: any) => ({
      name: g.name,
      minChoices: g.minChoices,
      maxChoices: g.maxChoices,
      freeChoices: g.freeChoices,
      options: g.options.map((o: any) => ({ name: o.name, price: o.price })),
    })),
    // O vinculo com o estoque, para o seletor abrir ja no item certo.
    inventoryItemId: (p as any).inventoryItemId ?? null,
  };

  return <ProductForm productId={p.id} initial={initial} categories={(product as any).categories} />;
}
