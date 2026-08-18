import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, Plus, X } from "lucide-react";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { formatCurrency, type Product } from "@/lib/pizzaria2/menu";

/**
 * Opened by tapping a row in the full cardápio. The row shows the name; this is
 * where the photo runs large and everything that comes in the item is spelled
 * out, without leaving the menu.
 */
export function ProductModal({
  product,
  price,
  tags,
  linkToCustomize,
  onAdd,
  onCustomize,
  onClose,
}: {
  product: Product;
  price: number;
  tags?: string[];
  linkToCustomize: boolean;
  onAdd: () => void;
  onCustomize?: () => void;
  onClose: () => void;
}) {
  const { slug: storeSlug } = useStore();
  const Icon = product.icon;

  // Escape closes it, and the page behind stops scrolling — otherwise a flick on
  // the modal drags the menu underneath it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      className="fixed inset-0 z-100 flex items-end justify-center bg-charcoal/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      {/* The click that closes belongs to the backdrop; inside the panel it must
          not travel up, or every tap on the content would dismiss it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-mozzarella shadow-[0_30px_80px_-30px_rgba(23,23,23,0.6)] sm:rounded-[28px]"
      >
        <div className="relative">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="aspect-4/3 w-full object-cover sm:rounded-t-[28px]"
            />
          ) : (
            <div className="grid aspect-4/3 w-full place-items-center bg-tomato/8 sm:rounded-t-[28px]">
              {Icon && <Icon className="h-16 w-16 text-tomato" />}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-mozzarella/90 text-charcoal/60 shadow-[0_6px_16px_-6px_rgba(23,23,23,0.4)] transition-colors hover:text-tomato"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          {product.tag && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-tomato px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--on-primary)]">
              {product.tag === "Mais pedida" && (
                <Flame className="h-3.5 w-3.5" />
              )}
              {product.tag}
            </span>
          )}
        </div>

        <div className="p-5 sm:p-6">
          <h2 className="font-display text-2xl font-extrabold leading-tight text-charcoal">
            {product.name}
          </h2>

          <p className="mt-2 text-base leading-relaxed text-charcoal/65">
            {product.desc}
          </p>

          {tags && tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-olive/10 px-2.5 py-1 text-xs font-semibold text-olive"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="font-display text-2xl font-extrabold text-charcoal">
              {formatCurrency(price)}
            </span>
            <button
              type="button"
              onClick={() => {
                onAdd();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-tomato px-5 py-3 text-sm font-semibold text-[color:var(--on-primary)] transition-transform hover:scale-[1.02]"
            >
              <Plus className="h-4 w-4" />
              Adicionar ao carrinho
            </button>
          </div>

          {/* A customizable item added at its default size is a guess; this is
              the way to the screen where the choices actually are. */}
          {linkToCustomize &&
            (onCustomize ? (
              <button
                type="button"
                onClick={() => {
                  onCustomize();
                  onClose();
                }}
                className="mt-4 text-sm font-semibold text-tomato hover:underline"
              >
                Montar do meu jeito →
              </button>
            ) : (
              <Link
                to="/$storeSlug/produto/$slug"
                params={{ storeSlug, slug: product.slug }}
                onClick={onClose}
                className="mt-4 inline-block text-sm font-semibold text-tomato hover:underline"
              >
                Montar do meu jeito →
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
