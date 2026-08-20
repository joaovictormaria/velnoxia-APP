import { PromoCarousel } from "@/components/site/pizzaria2/PromoCarousel";
import { useMenu } from "@/lib/pizzaria2/menu-provider";

/**
 * O carrossel de promoções lendo do cardápio da prévia.
 *
 * A tela da loja recebe as promoções por prop; aqui elas precisam vir do
 * provedor, que é onde o rascunho já foi aplicado.
 */
export function PromoCarouselDaPrevia() {
  const { promotions } = useMenu();
  return (
    <div className="bg-gradient-accent py-6">
      <PromoCarousel slides={promotions} />
    </div>
  );
}
