import { Check } from "lucide-react";

/**
 * A confirmação de que o item entrou no carrinho.
 *
 * Existe porque o "+" da lista adiciona sem sair da página: sem resposta na
 * tela, a pessoa não sabe se o toque pegou e toca de novo — e acaba com dois
 * do mesmo produto sem ter pedido.
 *
 * Discreto de propósito: aparece rente ao rodapé, some sozinho, não cobre
 * nenhum produto e não pede nenhuma ação. Quem quiser conferir tem o contador
 * do carrinho no topo; isto aqui é só o recibo do toque.
 */
export function AvisoDoCarrinho({ visivel }: { visivel: boolean }) {
  return (
    <div
      /* aria-live e não role="alert": é confirmação de algo que a pessoa
         acabou de fazer, não um alerta que deva cortar a leitura em curso. */
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div
        className={
          "flex items-center gap-2 rounded-full bg-charcoal/90 px-4 py-2.5 text-sm font-medium text-mozzarella shadow-lg backdrop-blur transition-all duration-200 " +
          (visivel ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0")
        }
      >
        <Check className="size-4 shrink-0" />
        {visivel ? "Adicionado ao carrinho" : ""}
      </div>
    </div>
  );
}
