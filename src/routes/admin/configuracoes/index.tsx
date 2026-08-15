import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/configuracoes/")({
  component: () => <PlaceholderPage title="Configurações" phase="Fase 5" />,
});
