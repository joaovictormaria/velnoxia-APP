import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu as MenuIcon, Pizza, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { useHeaderOverHero } from "@/lib/pizzaria2/hero-overlap";

export function Header() {
  const [open, setOpen] = useState(false);
  const goToCardapio = useGoToCardapio();
  const { storeName, tagline, logoUrl, slug: storeSlug } = useStore();
  const overHero = useHeaderOverHero();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-charcoal/8 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/$storeSlug" params={{ storeSlug }} className="flex items-center gap-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={storeName}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tomato text-mozzarella">
              <Pizza className="h-4.5 w-4.5" />
            </span>
          )}
          <span className="flex flex-col leading-tight">
            <span
              className={cn(
                "font-display text-lg font-bold transition-colors",
                overHero ? "text-mozzarella" : "text-charcoal",
              )}
            >
              {storeName}
            </span>
            {tagline && (
              <span
                className={cn(
                  "hidden text-[11px] font-medium uppercase tracking-wide transition-colors sm:inline",
                  overHero ? "text-mozzarella/70" : "text-charcoal/45",
                )}
              >
                {tagline}
              </span>
            )}
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            to="/$storeSlug" params={{ storeSlug }}
            activeOptions={{ exact: true }}
            className={cn(
              "text-sm font-medium transition-colors",
              overHero ? "text-mozzarella/80 hover:text-mozzarella" : "text-charcoal/70 hover:text-charcoal",
            )}
            activeProps={{ className: overHero ? "!text-[#ffd166]" : "!text-tomato" }}
          >
            Início
          </Link>
          <a
            href="/$storeSlug#cardapio"
            onClick={goToCardapio}
            className={cn(
              "text-sm font-medium transition-colors",
              overHero ? "text-mozzarella/80 hover:text-mozzarella" : "text-charcoal/70 hover:text-charcoal",
            )}
          >
            Cardápio
          </a>
          <span
            className={cn(
              "cursor-default text-sm font-medium transition-colors",
              overHero ? "text-mozzarella/40" : "text-charcoal/40",
            )}
          >
            Acompanhar pedido
          </span>
          <span
            className={cn(
              "cursor-default text-sm font-medium transition-colors",
              overHero ? "text-mozzarella/40" : "text-charcoal/40",
            )}
          >
            Contato
          </span>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full transition-colors md:hidden",
              overHero ? "text-mozzarella hover:bg-mozzarella/10" : "text-charcoal hover:bg-charcoal/5",
            )}
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-charcoal/8 bg-mozzarella px-4 pb-4 pt-2 sm:px-6 md:hidden">
          <ul className="flex flex-col">
            <li>
              <Link
                to="/$storeSlug" params={{ storeSlug }}
                activeOptions={{ exact: true }}
                onClick={() => setOpen(false)}
                className={cn("block border-b border-charcoal/8 py-3 text-sm font-medium text-charcoal/70")}
                activeProps={{ className: "!text-tomato" }}
              >
                Início
              </Link>
            </li>
            <li>
              <a
                href="/$storeSlug#cardapio"
                onClick={(e) => {
                  setOpen(false);
                  goToCardapio(e);
                }}
                className="block border-b border-charcoal/8 py-3 text-sm font-medium text-charcoal/70"
              >
                Cardápio
              </a>
            </li>
            <li className="border-b border-charcoal/8 py-3 text-sm font-medium text-charcoal/40">
              Acompanhar pedido
            </li>
            <li className="py-3 text-sm font-medium text-charcoal/40">Contato</li>
          </ul>
        </nav>
      )}
    </header>
  );
}
