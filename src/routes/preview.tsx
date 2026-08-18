import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { stockImageUrl } from "@/lib/stock-image";
import type { GeneratedSiteContent } from "@/lib/generate-site";

export const Route = createFileRoute("/preview")({
  /**
   * Este domínio é a entrada do aplicativo, não a vitrine do produto: quem
   * chega aqui quer entrar na própria conta. A tela de marketing continua no
   * repositório, mas fora do caminho — se um dia voltar a ser servida, será
   * de outro endereço.
   */
  beforeLoad: () => {
    throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [{ title: "Prévia do site — gerado por velnox.ia" }],
  }),
  component: Preview,
});

type Stored = {
  businessName: string;
  content: GeneratedSiteContent;
};

function Preview() {
  const [data, setData] = useState<Stored | null | undefined>(undefined);

  useEffect(() => {
    const raw = localStorage.getItem("velnox:generatedSite");
    setData(raw ? (JSON.parse(raw) as Stored) : null);
  }, []);

  if (data === undefined) return null;

  if (data === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div>
          <p className="font-display text-lg font-bold">Nenhuma prévia encontrada</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Gere um site em "Criar meu site" primeiro.
          </p>
          <Button variant="hero" size="lg" className="mt-6 rounded-sm" asChild>
            <Link to="/criar-site">Criar meu site</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { businessName, content } = data;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] 2xl:max-w-340 items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-accent text-sm font-bold text-primary-foreground">
              {businessName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate font-display text-base font-bold">{businessName}</span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            {content.sections.slice(0, 4).map((s) => (
              <span key={s.name} className="text-sm text-muted-foreground">
                {s.name}
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="hero" size="sm" className="hidden rounded-sm sm:inline-flex">
              <WhatsAppIcon className="h-3.5 w-3.5" /> {content.heroCta}
            </Button>
            <Menu className="h-5 w-5 text-muted-foreground md:hidden" />
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 sm:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,50,50,0.14),transparent_55%)]" />
          <div className="relative mx-auto max-w-[1200px] 2xl:max-w-340 px-6 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {content.artDirection.style}
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl 2xl:text-6xl">
              {content.headline}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {content.subheadline}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button variant="hero" size="xl" className="rounded-sm">
                {content.heroCta} <ArrowRight />
              </Button>
              <Button variant="glass" size="xl" className="rounded-sm">
                {content.heroSecondaryCta}
              </Button>
            </div>
            <div className="mx-auto mt-12 aspect-video max-w-3xl overflow-hidden rounded-[28px] border-2 border-primary shadow-glow">
              <img
                src={stockImageUrl(content.heroImageKeyword, 1200, 675)}
                alt={content.heroImageDescription}
                title={content.heroImageDescription}
                loading="eager"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </section>

        {content.sections.map((s, i) => (
          <section
            key={s.name}
            className="animate-in fade-in slide-in-from-bottom-4 border-t border-border py-16 duration-700 sm:py-20"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}
          >
            <div className="mx-auto max-w-[1200px] 2xl:max-w-340 px-6">
              <div
                className={
                  i % 2 === 1
                    ? "grid grid-cols-1 items-center gap-10 lg:grid-cols-2"
                    : "grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:[direction:rtl]"
                }
              >
                <div className="lg:[direction:ltr]">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                    {s.name}
                  </span>
                  {s.headline && (
                    <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
                      {s.headline}
                    </h2>
                  )}
                  {s.body && (
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {s.body}
                    </p>
                  )}
                  {s.cta && (
                    <Button variant="hero" size="lg" className="mt-6 rounded-sm">
                      {s.cta} <ArrowRight />
                    </Button>
                  )}
                </div>
                <div className="aspect-4/3 overflow-hidden rounded-[24px] border border-border shadow-soft lg:[direction:ltr]">
                  <img
                    src={stockImageUrl(s.imageKeyword, 900, 675)}
                    alt={s.imageDescription ?? s.name}
                    title={s.imageDescription}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </section>
        ))}

        <section className="border-t border-border bg-primary/8 py-16 text-center sm:py-20">
          <div className="mx-auto max-w-xl px-6">
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
              {businessName} está pronto para vender mais.
            </h2>
            <Button variant="hero" size="xl" className="mt-6 rounded-sm">
              {content.heroCta} <ArrowRight />
            </Button>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Prévia gerada por velnox.ia — mockup, não é o site final
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
