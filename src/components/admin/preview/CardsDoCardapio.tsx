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
export function CardsDoCardapio({
  categorySlug,
  slugEmEdicao,
}: {
  categorySlug: string | undefined;
  /** Qual card recebe as marcas de foco. */
  slugEmEdicao?: string;
}) {
  const { productsByCategory, categoryBySlug } = useMenu();
  const categoria = categorySlug ? categoryBySlug(categorySlug) : undefined;
  const todos = categorySlug ? productsByCategory(categorySlug) : [];

  /**
   * Três cards, e o produto em edição sempre entre eles.
   *
   * Cortar os três primeiros deixaria de fora justamente o produto que a
   * lojista está mexendo quando ele é o quarto da categoria — e a prévia
   * mostraria os vizinhos dele. A janela desliza para conter o editado.
   */
  const onde = todos.findIndex((p) => p.slug === slugEmEdicao);
  const inicio = onde < 0 ? 0 : Math.min(Math.max(0, onde - 1), Math.max(0, todos.length - 3));
  const produtos = todos.slice(inicio, inicio + 3);

  if (produtos.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-lg text-charcoal/40">
        Esta categoria ainda não tem produtos.
      </p>
    );
  }

  return (
    <div className="px-6 py-10">
      <div className="mx-auto grid max-w-[920px] grid-cols-3 gap-5">
        {produtos.map((product) => (
          <ProductCard
            key={product.slug}
            product={product}
            marcado={product.slug === slugEmEdicao}
            linkToCustomize
            ctaQuickAdd={!exigeEscolha(product, categoria)}
            onQuickAdd={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
