import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/Reveal";

export function Footer() {
  return (
    <footer id="contato" className="relative scroll-mt-24 border-t border-border py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-primary/6 blur-3xl" />
      <div className="relative mx-auto grid max-w-[1440px] 2xl:max-w-400 grid-cols-1 gap-10 px-6 lg:grid-cols-12 lg:px-10">
        <Reveal variant="left" className="lg:col-span-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-accent font-display text-lg font-bold text-primary-foreground">
              V
            </span>
            <span className="font-display text-lg font-semibold">
              velnox<span className="text-primary">.ia</span>
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Sites profissionais criados com Inteligência Artificial para restaurantes que querem
            vender mais, todos os dias.
          </p>
          <Button variant="hero" size="pill" className="mt-6">
            <MessageCircle /> Falar no WhatsApp
          </Button>
        </Reveal>

        <div className="grid grid-cols-2 gap-8 lg:col-span-7 lg:grid-cols-3">
          {[
            { title: "Produto", items: ["Soluções", "Como funciona", "Exemplos", "Planos"] },
            { title: "Empresa", items: ["Sobre", "Depoimentos", "Blog", "Contato"] },
            { title: "Suporte", items: ["FAQ", "Central de ajuda", "Privacidade", "Termos"] },
          ].map((col, ci) => (
            <Reveal key={col.title} variant="up" delay={ci * 100}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.items.map((i) => (
                  <li key={i}>
                    <a
                      href="#top"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {i}
                    </a>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
      <div className="relative mx-auto mt-12 max-w-[1440px] 2xl:max-w-400 border-t border-border px-6 pt-6 lg:px-10">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} velnox.ia — Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}