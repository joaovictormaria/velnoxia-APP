import { createFileRoute, Link } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { ArrowRight } from "lucide-react";

/*
  MÓDULO PAGO — RELATORIOS.

  Esta tela não traz número nenhum: é o índice que leva às cinco telas de
  relatório. Todas as cinco já são pagas — Financeiro e Funcionários —,
  então deixá-la aberta ofereceria ao BASIC uma porta para cinco cadeados.

  É o ÚNICO caso de `RELATORIOS` puro entre as rotas deste diretório: as
  outras sete pertencem a FINANCEIRO, FIADO ou FUNCIONARIOS, cada uma pelo
  que entrega e não pela pasta em que mora.
*/
export const Route = createFileRoute("/admin/relatorios/")(
  rotaPremium("RELATORIOS", ReportsPage),
);

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
          to="/admin/relatorios/receita"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E11D2E] hover:underline"
        >
          Relatório de Receita <ArrowRight className="size-4" />
        </Link>
        <br />
        <Link
          to="/admin/relatorios/dashboard-kpi"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E11D2E] hover:underline"
        >
          Dashboard de KPIs <ArrowRight className="size-4" />
        </Link>
        <br />
        <Link
          to="/admin/relatorios/historico"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E11D2E] hover:underline"
        >
          Histórico de Transações <ArrowRight className="size-4" />
        </Link>
        <br />
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
