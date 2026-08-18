import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu as MenuIcon, Pizza, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoToSection } from "@/lib/pizzaria2/go-to-cardapio";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { useHeaderOverHero } from "@/lib/pizzaria2/hero-overlap";

export function Header() {
  const [open, setOpen] = useState(false);
  const goToSection = useGoToSection();
  const { storeName, tagline, logoUrl, slug: storeSlug } = useStore();
  const { promotions, posts } = useMenu();
  const overHero = useHeaderOverHero();

  // A link to a section the page never rendered scrolls nowhere, so the ones
  // that depend on the owner having content only appear once it exists.
  const sections = [
    { id: "cardapio", label: "Cardápio", show: true },
    { id: "promocoes", label: "Promoções", show: promotions.length > 0 },
    { id: "restaurante", label: "A loja", show: true },
    { id: "avaliacoes", label: "Avaliações", show: true },
    { id: "novidades", label: "Blog", show: posts.length > 0 },
    { id: "contato", label: "Contato", show: true },
  ].filter((s) => s.show);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-charcoal/8 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/$storeSlug"
          params={{ storeSlug }}
          className="flex items-center gap-2"
        >
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
                overHero ? "text-[color:var(--on-primary)]" : "text-charcoal",
              )}
            >
              {storeName}
            </span>
            {tagline && (
              <span
                className={cn(
                  "hidden text-[11px] font-medium uppercase tracking-wide transition-colors sm:inline",
                  overHero
                    ? "text-[color:var(--on-primary-muted)]"
                    : "text-charcoal/45",
                )}
              >
                {tagline}
              </span>
            )}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 md:flex lg:gap-6">
          <Link
            to="/$storeSlug"
            params={{ storeSlug }}
            activeOptions={{ exact: true }}
            className={cn(
              "text-sm font-medium transition-colors",
              overHero
                ? "text-[color:var(--on-primary-muted)] hover:text-[color:var(--on-primary)]"
                : "text-charcoal/70 hover:text-charcoal",
            )}
            activeProps={{
              className: overHero
                ? "!text-[color:var(--on-primary-accent)]"
                : "!text-tomato",
            }}
          >
            Início
          </Link>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(e) => goToSection(section.id, e)}
              className={cn(
                "text-sm font-medium transition-colors",
                overHero
                  ? "text-[color:var(--on-primary-muted)] hover:text-[color:var(--on-primary)]"
                  : "text-charcoal/70 hover:text-charcoal",
              )}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full transition-colors md:hidden",
              overHero
                ? "text-[color:var(--on-primary)] hover:bg-[color:var(--on-primary)]/10"
                : "text-charcoal hover:bg-charcoal/5",
            )}
          >
            {open ? (
              <X className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-charcoal/8 bg-mozzarella px-4 pb-4 pt-2 sm:px-6 md:hidden">
          <ul className="flex flex-col">
            <li>
              <Link
                to="/$storeSlug"
                params={{ storeSlug }}
                activeOptions={{ exact: true }}
                onClick={() => setOpen(false)}
                className="block border-b border-charcoal/8 py-3 text-sm font-medium text-charcoal/70"
                activeProps={{ className: "!text-tomato" }}
              >
                Início
              </Link>
            </li>
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={(e) => {
                    setOpen(false);
                    goToSection(section.id, e);
                  }}
                  className="block border-b border-charcoal/8 py-3 text-sm font-medium text-charcoal/70"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
