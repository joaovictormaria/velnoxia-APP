import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { Footer } from "@/components/site/Footer";
import { IntroScreen } from "@/components/site/IntroScreen";

const title = "velnox.ia — Sites com IA para restaurantes venderem mais";
const description =
  "A velnox.ia cria sites profissionais para restaurantes com Inteligência Artificial: mais pedidos no WhatsApp, delivery integrado e destaque no Google.";

export const Route = createFileRoute("/")({
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
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const INTRO_SEEN_KEY = "velnox:intro-seen";

function Index() {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(INTRO_SEEN_KEY)) {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
      setShowIntro(true);
    }
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {/* IntroScreen unmounts itself (internal `gone` state) once its exit
          animation finishes — onDone only marks the explode as started, it
          must not be used to remove the component from the tree early. */}
      {showIntro && <IntroScreen onDone={() => {}} />}
      <Navbar />
      <main>
        <Hero />
      </main>
      <Footer />
    </div>
  );
}
