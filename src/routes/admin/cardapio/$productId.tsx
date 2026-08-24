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
    basePrice: p.basePrice,
    imageUrl: p.imageUrl,
    tag: p.tag,
    isActive: p.isActive,
    allowHalfAndHalf: p.allowHalfAndHalf,
    halfPizzaPricingRule: p.halfPizzaPricingRule,
    sortOrder: p.sortOrder,
    sizes: p.sizes?.map((s: any) => ({
      categorySizeId: s.categorySizeId,
      price: s.price,
      isAvailable: s.isAvailable,
    })) ?? [],
    optionGroups: p.optionGroups?.map((g: any) => ({
      name: g.name,
      minChoices: g.minChoices,
      maxChoices: g.maxChoices,
      freeChoices: g.freeChoices,
      options: g.options.map((o: any) => ({ name: o.name, price: o.price })),
    })),
  };

  return <ProductForm productId={p.id} initial={initial} categories={product.categories} />;
}
