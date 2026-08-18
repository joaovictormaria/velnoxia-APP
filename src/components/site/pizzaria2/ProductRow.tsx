import { Flame, Plus } from "lucide-react";
import { formatCurrency, type Product } from "@/lib/pizzaria2/menu";

/**
 * Compact row for the full cardápio: it shows the name and the price, so a long
 * menu stays scannable. Tapping it opens the item's modal. "Adicionar" is a
 * separate button — pressing it goes straight to the cart instead of opening the
 * modal, which is why the two are siblings and not nested (a button inside a
 * button is invalid and would swallow the click).
 */
export function ProductRow({
  product,
  price,
  onOpen,
  onQuickAdd,
}: {
  product: Product;
  price: number;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  const Icon = product.icon;

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-2xl border border-charcoal/8 bg-mozzarella p-2.5 transition-colors hover:border-tomato/25">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-tomato/8">
          {product.image ? (
            <img
              src={product.image}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            Icon && <Icon className="h-6 w-6 text-tomato" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-display text-base font-bold leading-tight text-charcoal">
              {product.name}
            </span>
            {product.tag && (
              <span className="inline-flex items-center gap-1 rounded-full bg-tomato px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--on-primary)]">
                {product.tag === "Mais pedida" && <Flame className="h-3 w-3" />}
                {product.tag}
              </span>
            )}
          </span>
          <span className="mt-0.5 block font-display text-sm font-bold text-tomato">
            {formatCurrency(price)}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onQuickAdd}
        aria-label={`Adicionar ${product.name} ao carrinho`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tomato text-[color:var(--on-primary)] transition-colors hover:bg-tomato/90"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
