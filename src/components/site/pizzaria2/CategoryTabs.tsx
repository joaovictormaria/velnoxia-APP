import { cn } from "@/lib/utils";
import type { CategorySlug } from "@/lib/pizzaria2/menu";
import { useMenu } from "@/lib/pizzaria2/menu-provider";

export function CategoryTabs({
  activeSlug,
  onSelect,
}: {
  activeSlug: string;
  onSelect: (slug: CategorySlug) => void;
}) {
  const { categories } = useMenu();

  return (
    <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:overflow-visible sm:pb-0">
      {categories.map((cat) => {
        const Icon = cat.icon;
        const active = cat.slug === activeSlug;
        return (
          <button
            key={cat.slug}
            type="button"
            onClick={() => onSelect(cat.slug)}
            aria-pressed={active}
            className={cn(
              "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
              active
                ? "border-tomato bg-tomato text-mozzarella shadow-[0_10px_24px_-14px_rgba(233,75,44,0.65)]"
                : "border-charcoal/10 bg-mozzarella text-charcoal hover:border-tomato/30",
            )}
          >
            {Icon && (
              <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-mozzarella" : "text-tomato")} />
            )}
            {cat.shortName}
          </button>
        );
      })}
    </div>
  );
}
