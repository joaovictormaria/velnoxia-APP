import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProductForm, PRODUTO_EM_BRANCO } from "@/components/admin/products/ProductForm";
import { getProductFormOptionsFn } from "@/server/functions/products.fn";

export const Route = createFileRoute("/admin/cardapio/novo")({
  component: NewProductPage,
});

function NewProductPage() {
  const { data, isPending } = useQuery({
    queryKey: ["product-form-options"],
    queryFn: () => getProductFormOptionsFn(),
  });

  if (isPending || !data) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return <ProductForm productId={null} initial={PRODUTO_EM_BRANCO} categories={data.categories} />;
}
