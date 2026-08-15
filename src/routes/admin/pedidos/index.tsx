import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/pedidos/")({
  component: () => <PlaceholderPage title="Pedidos (Kanban)" phase="Fase 3" />,
});
