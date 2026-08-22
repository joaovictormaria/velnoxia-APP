import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/admin/relatorios/produtos")({
  component: ProductReportPage,
});

function ProductReportPage() {
  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/admin/relatorios"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" /> Voltar para os relatórios
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Relatórios — Produtos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Funcionalidade em desenvolvimento.
        </p>
      </header>
    </div>
  );
}
