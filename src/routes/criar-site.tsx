import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { AiAssistant } from "@/components/site/AiAssistant";

const title = "Criar meu site — velnox.ia";
const description =
  "Responda algumas perguntas rápidas e geramos um exemplo personalizado do site do seu restaurante — na hora, sem compromisso.";

export const Route = createFileRoute("/criar-site")({
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
  component: CriarSite,
});

function CriarSite() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Navbar />
      <main>
        <AiAssistant />
      </main>
    </div>
  );
}
