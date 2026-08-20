import { StoreBlog } from "@/components/site/pizzaria2/StoreBlog";
import { useMenu } from "@/lib/pizzaria2/menu-provider";

/**
 * A seção "Novidades" lendo do cardápio da prévia.
 *
 * A página da loja recebe as publicações por prop; aqui elas vêm do provedor,
 * que é onde o rascunho já foi aplicado.
 */
export function PublicacoesDaPrevia() {
  const { posts } = useMenu();
  return (
    <div className="bg-cream px-6 py-10">
      <StoreBlog posts={posts} />
    </div>
  );
}
