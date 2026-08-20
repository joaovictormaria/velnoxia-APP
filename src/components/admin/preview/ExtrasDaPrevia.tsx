import { ListaDeExtras } from "@/components/site/pizzaria2/ListaDeExtras";
import { useMenu } from "@/lib/pizzaria2/menu-provider";

/**
 * O cartão de escolhas da tela do produto, com os adicionais cadastrados.
 *
 * É onde o cliente encontra um adicional: nunca no cardápio, só depois de
 * abrir um produto. Mostrar a lista aqui responde "onde isso vai aparecer",
 * que é a dúvida de quem cadastra "Bacon extra" e não vê nada mudar na loja.
 */
export function ExtrasDaPrevia() {
  const { extras } = useMenu();
  return (
    <div className="bg-cream p-8">
      <div className="mx-auto max-w-md rounded-2xl border border-charcoal/8 bg-mozzarella p-5">
        <ListaDeExtras extras={extras} selecionados={[]} onAlternar={() => {}} />
      </div>
    </div>
  );
}
