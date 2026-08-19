import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProductForm, type ProductFormValues } from "@/components/admin/products/ProductForm";
import { getProductFormOptionsFn } from "@/server/functions/products.fn";

export const Route = createFileRoute("/admin/cardapio/novo")({
  component: NewProductPage,
});

const EMPTY: ProductFormValues = {
  name: "",
  slug: "",
  description: "",
  categoryId: "",
  basePrice: 0,
  imageUrl: null,
  tag: null,
  isActive: true,
  allowHalfAndHalf: false,
  halfPizzaPricingRule: "HIGHEST_PRICE",
  sortOrder: 0,
  sizes: [],
  optionGroups: [],
};

function NewProductPage() {
  const { data, isPending } = useQuery({
    queryKey: ["product-form-options"],
    queryFn: () => getProductFormOptionsFn(),
  });

  if (isPending || !data) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return <ProductForm productId={null} initial={EMPTY} categories={data.categories} />;
}
