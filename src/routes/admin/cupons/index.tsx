import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/admin/layout/PlaceholderPage";

export const Route = createFileRoute("/admin/cupons/")({
  component: () => <PlaceholderPage title="Descontos / Cupons" phase="Fase 4" />,
});
