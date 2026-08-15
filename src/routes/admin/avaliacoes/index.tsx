import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/avaliacoes/")({
  component: () => <PlaceholderPage title="Avaliações" phase="Fase 4" />,
});
