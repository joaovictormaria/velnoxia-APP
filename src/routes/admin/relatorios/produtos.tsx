import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/relatorios/produtos")({
  component: () => <PlaceholderPage title="Relatórios - Produtos" phase="Fase 4" />,
});
