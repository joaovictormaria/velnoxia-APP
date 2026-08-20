import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, type Extra } from "@/lib/pizzaria2/menu";

/**
 * Os adicionais que o cliente marca antes de pôr no carrinho.
 *
 * Separada da tela do produto para a prévia do painel mostrar exatamente esta
 * lista enquanto a lojista cadastra um adicional — duas cópias do mesmo
 * markup divergiriam no primeiro ajuste, e a prévia passaria a mostrar algo
 * que a loja não tem.
 */
export function ListaDeExtras({
  extras,
  selecionados,
  onAlternar,
}: {
  extras: Extra[];
  selecionados: string[];
  onAlternar: (id: string) => void;
}) {
  return (
    <>
      <h2 className="font-display text-base font-bold text-charcoal">Adicione extras</h2>
      <div data-previa="lista-de-extras" className="mt-3 flex flex-col gap-2.5">
        {extras.map((extra) => (
          <label
            key={extra.id}
            className="flex cursor-pointer items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2.5">
              <Checkbox
                checked={selecionados.includes(extra.id)}
                onCheckedChange={() => onAlternar(extra.id)}
                className="border-tomato data-[state=checked]:border-tomato data-[state=checked]:bg-tomato data-[state=checked]:text-mozzarella"
              />
              <span className="text-charcoal/80">{extra.label}</span>
            </span>
            <span className="text-charcoal/50">{formatCurrency(extra.price)}</span>
          </label>
        ))}
      </div>
    </>
  );
}
