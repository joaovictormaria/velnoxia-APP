import { X } from "lucide-react";
import { MenuThumb } from "./MenuThumb";
import { PriceTag } from "./PriceTag";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import type { CartLine } from "@/lib/pizzaria2/cart";

export function CartItemRow({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  const extrasTotal = line.extras.reduce((sum, e) => sum + e.price, 0);
  const lineTotal = (line.unitPrice + extrasTotal) * line.qty;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-charcoal/8 bg-mozzarella p-3">
      <MenuThumb
        image={line.image}
        icon={line.icon}
        alt={line.name}
        className="h-16 w-16 shrink-0 border border-charcoal/8"
        iconClassName="h-7 w-7"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold text-charcoal">
          {line.name}
          {line.sizeLabel ? ` - ${line.sizeLabel}` : ""}
        </p>
        {line.extras.length > 0 && (
          <p className="mt-0.5 text-xs text-charcoal/45">
            + {line.extras.map((e) => e.label).join(", ")}
          </p>
        )}
        {line.note && <p className="mt-0.5 text-xs italic text-charcoal/45">"{line.note}"</p>}
        <p className="mt-1 text-xs font-medium text-charcoal/60">
          {line.qty} x {formatCurrency(line.unitPrice + extrasTotal)}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${line.name} do carrinho`}
          className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-charcoal/30 transition-colors hover:text-tomato"
        >
          <X className="h-4 w-4" />
        </button>
        <PriceTag value={lineTotal} className="text-sm" />
      </div>
    </div>
  );
}
