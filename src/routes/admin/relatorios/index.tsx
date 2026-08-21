import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/admin/relatorios/")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Relatórios</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Funcionalidade em desenvolvimento. Use os links abaixo para acessar relatórios específicos.
          </p>
        </div>
      </header>

      <div className="space-y-2">
        <Link
          to="/admin/relatorios/produtos"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E11D2E] hover:underline"
        >
          Relatório de Produtos <ArrowRight className="size-4" />
        </Link>
        <br />
        <Link
          to="/admin/relatorios/funcionarios"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E11D2E] hover:underline"
        >
          Relatório de Funcionários <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
