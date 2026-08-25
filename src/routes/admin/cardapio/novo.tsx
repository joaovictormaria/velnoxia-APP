import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link
          to="/admin/cardapio"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:border-neutral-300"
          title="Voltar para cardápio"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Voltar</span>
        </Link>
      </header>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <ProductForm productId={null} initial={EMPTY} categories={data.categories} />
      </div>
    </div>
  );
}
