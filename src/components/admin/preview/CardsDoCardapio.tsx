import { ProductCard } from "@/components/site/pizzaria2/ProductCard";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { exigeEscolha } from "@/lib/pizzaria2/menu";

/**
 * Só a fileira de cards de uma categoria, sem a coluna de texto ao lado.
 *
 * Na tela de Produtos é o card que está sendo editado — foto, etiqueta, nome,
 * descrição e preço. Mostrar a seção inteira gastaria metade do espaço com o
 * título e o botão da categoria, que ali ninguém está mexendo, e deixaria o
 * card pequeno demais para se julgar.
 *
 * São os mesmos ProductCard da vitrine, na mesma grade: o que aparece aqui é
 * exatamente o que o cliente vê.
 */
export function CardsDoCardapio({ categorySlug }: { categorySlug: string | undefined }) {
  const { productsByCategory, categoryBySlug } = useMenu();
  const categoria = categorySlug ? categoryBySlug(categorySlug) : undefined;
  const produtos = categorySlug ? productsByCategory(categorySlug) : [];

  if (produtos.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-lg text-charcoal/40">
        Esta categoria ainda não tem produtos.
      </p>
    );
  }

  return (
    <div className="px-6 py-10">
      <div className="mx-auto grid max-w-[920px] grid-cols-2 gap-5 lg:grid-cols-3">
        {produtos.slice(0, 6).map((product) => (
          <ProductCard
            key={product.slug}
            product={product}
            linkToCustomize
            ctaQuickAdd={!exigeEscolha(product, categoria)}
            onQuickAdd={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
