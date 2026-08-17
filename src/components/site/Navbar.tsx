import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import logo from "@/assets/velnox.ia_logo.png";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { cn } from "@/lib/utils";

const links = [
  { label: "Soluções", href: "#solucoes" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Exemplos", href: "#exemplos" },
  { label: "Depoimentos", href: "#depoimentos" },
  { label: "Planos", href: "#planos" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "animate-in fade-in slide-in-from-top-4 animation-duration-[600ms] fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "glass border-b" : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto grid max-w-[1440px] 2xl:max-w-400 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-6 py-2 lg:grid-cols-12 lg:px-10">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 lg:col-span-3">
          <img src={logo} alt="velnox.ia" className="h-16 w-auto shrink-0" />
        </Link>

        <nav className="hidden items-center justify-center gap-8 lg:col-span-6 lg:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="relative text-sm text-muted-foreground transition-colors hover:text-foreground after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-all hover:after:w-full"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-3 lg:col-span-3">
          <Button
            variant="hero"
            size="pill"
            className="hidden rounded-sm sm:inline-flex"
            asChild
          >
            <a href="#contato">
              <WhatsAppIcon className="h-4.5 w-4.5" /> Falar no WhatsApp
            </a>
          </Button>
          <Button
            variant="glass"
            size="icon"
            className="rounded-xl lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open && (
        <nav className="animate-in fade-in slide-in-from-top-2 glass border-t px-6 pb-6 pt-2 duration-200 lg:hidden">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-border/60 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Button variant="hero" size="pill" className="mt-5 w-full rounded-sm" asChild>
            <a href="#contato">
              <WhatsAppIcon className="h-4.5 w-4.5" /> Falar no WhatsApp
            </a>
          </Button>
        </nav>
      )}
    </header>
  );
}