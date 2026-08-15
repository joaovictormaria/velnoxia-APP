import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/cardapio/")({
  component: () => <PlaceholderPage title="Cardápio - Lista de Produtos" phase="Fase 2" />,
});
