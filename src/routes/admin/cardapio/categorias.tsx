import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/cardapio/categorias")({
  component: () => <PlaceholderPage title="Categorias" phase="Fase 2" />,
});
