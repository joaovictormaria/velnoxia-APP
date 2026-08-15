import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/cardapio/extras")({
  component: () => <PlaceholderPage title="Extras / Adicionais" phase="Fase 2" />,
});
