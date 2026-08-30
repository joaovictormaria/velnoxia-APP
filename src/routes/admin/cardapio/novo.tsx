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
  // Regra, não exceção: produto novo nasce participando do estoque.
  controlaEstoque: true,
  /*
   * SEM ESCOLHA PRÉVIA, de propósito.
   *
   * Um default aqui responderia a pergunta pelo dono — e a resposta errada
   * seria invisível, porque o rádio já viria marcado. Nulo faz a tela pedir a
   * escolha, que é o único momento em que ela é barata: quem está cadastrando
   * a Coca-Cola sabe agora que ela é revenda.
   */
  tipoDeControle: null,
  allowHalfAndHalf: false,
  halfPizzaPricingRule: "HIGHEST_PRICE",
  sortOrder: 0,
  sizes: [],
  optionGroups: [],
  // Produto novo nasce sem vinculo; escolhe-se no formulario.
  inventoryItemId: null,
};

function NewProductPage() {
  const { data, isPending } = useQuery({
    queryKey: ["product-form-options"],
    queryFn: () => getProductFormOptionsFn(),
  });

  if (isPending || !data) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return <ProductForm productId={null} initial={EMPTY} categories={data.categories} />;
}
