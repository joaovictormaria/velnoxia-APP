import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/clientes/")({
  component: () => <PlaceholderPage title="Clientes" phase="Fase 4" />,
});
