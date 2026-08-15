import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/relatorios/")({
  component: () => <PlaceholderPage title="Relatórios - Visão Geral" phase="Fase 4" />,
});
