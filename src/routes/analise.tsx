import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Button } from "@/components/ui/button";
import { generateSiteContent, type GeneratedSiteContent } from "@/lib/generate-site";

const title = "Analisando com IA — velnox.ia";
const description =
  "Nossa IA está analisando as informações do seu negócio para gerar um site personalizado.";

export const Route = createFileRoute("/analise")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analise,
});

type OnboardingData = {
  businessType: string;
  businessName: string;
  businessPhone: string;
  businessEmail: string;
};

function Analise() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [content, setContent] = useState<GeneratedSiteContent | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("velnox:onboarding");
    if (!raw) {
      navigate({ to: "/criar-site" });
      return;
    }

    const onboarding = JSON.parse(raw) as OnboardingData;
    setBusinessName(onboarding.businessName);

    generateSiteContent({
      data: {
        businessType: onboarding.businessType,
        businessName: onboarding.businessName,
      },
    })
      .then((result) => {
        setContent(result);
        setStatus("done");
        localStorage.setItem(
          "velnox:generatedSite",
          JSON.stringify({ businessName: onboarding.businessName, content: result }),
        );
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Erro ao gerar o conteúdo.");
        setStatus("error");
      });
  }, [navigate]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Navbar />
      <main>
        <section
          id="analise"
          className="relative mt-22 flex min-h-[calc(100vh-5.5rem)] items-center overflow-hidden pb-16 lg:pb-20"
        >
          <div className="mx-auto max-w-[1440px] 2xl:max-w-400 px-6 lg:px-10">
            <div className="relative isolate mx-auto max-w-xl">
              <div className="pointer-events-none absolute inset-x-6 inset-y-4 -z-10 rounded-[24px] bg-primary/60 opacity-80 blur-[90px]" />

              {status === "loading" && (
                <div className="card-sheen rounded-[28px] border-2! border-primary! bg-card p-8 text-center shadow-card sm:p-10">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </span>
                  <h1 className="mt-6 font-display text-xl font-bold sm:text-2xl">
                    Analisando seu negócio com IA
                  </h1>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Estamos usando as informações que você passou para gerar um site personalizado
                    para o seu restaurante. Isso leva só alguns segundos.
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                    <Sparkles className="h-3.5 w-3.5" /> Powered by velnox.ia
                  </span>
                </div>
              )}

              {status === "error" && (
                <div className="card-sheen rounded-[28px] border-2! border-primary! bg-card p-8 text-center shadow-card sm:p-10">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
                    <AlertTriangle className="h-7 w-7" />
                  </span>
                  <h1 className="mt-6 font-display text-xl font-bold sm:text-2xl">
                    Não deu pra gerar agora
                  </h1>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {errorMessage}
                  </p>
                  <Button variant="hero" size="lg" className="mt-6 rounded-sm" asChild>
                    <Link to="/criar-site">Tentar de novo</Link>
                  </Button>
                </div>
              )}

              {status === "done" && content && (
                <div className="text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-6 w-6" />
                  </span>
                  <h1 className="mt-4 font-display text-xl font-bold sm:text-2xl">
                    Seu site está pronto
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Clique no card abaixo para abrir a prévia em uma nova guia.
                  </p>

                  <a
                    href="/preview"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group mt-6 block overflow-hidden rounded-sm border-2 border-primary bg-[#0b0b0b] text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-glow"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-card/80 px-4 py-2.5">
                      <span className="truncate text-[10px] text-muted-foreground">
                        {businessName.toLowerCase().replace(/\s+/g, "")}.com.br
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Abrir prévia <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="relative px-6 py-8 sm:px-8 sm:py-10">
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,50,50,0.12),transparent_60%)]" />
                      <span className="relative text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
                        {businessName}
                      </span>
                      <h3 className="relative mt-2 font-display text-xl font-extrabold leading-tight sm:text-2xl">
                        {content.headline}
                      </h3>
                      <p className="relative mt-2 max-w-md text-xs text-white/60">
                        {content.subheadline}
                      </p>
                      <span className="relative mt-4 inline-block rounded-lg bg-gradient-accent px-3.5 py-2 text-[10px] font-semibold text-primary-foreground">
                        {content.heroCta}
                      </span>
                    </div>
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
