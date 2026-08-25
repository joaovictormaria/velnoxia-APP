import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
import { getFinancialKPIs } from "@/server/functions/inventory-costs.fn";

export const Route = createFileRoute("/admin/relatorios/receita")({
  component: ReportFinancialPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 });

type PeriodType = "today" | "week" | "month" | "all";

interface KPIData {
  totalSalesValue?: number;
  totalCost?: number;
  totalProfit?: number;
  profitMargin?: number;
  totalOrders?: number;
  averageOrderValue?: number;
}

function ReportFinancialPage() {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [error, setError] = useState<string | null>(null);

  // Calcular dias baseado no período
  const getDaysForPeriod = (p: PeriodType): number => {
    switch (p) {
      case "today":
        return 1;
      case "week":
        return 7;
      case "month":
        return 30;
      case "all":
        return 365; // 1 ano completo
      default:
        return 30;
    }
  };

  const { data: kpiData, isPending } = useQuery({
    queryKey: ["financialKPIs", period],
    queryFn: async () => {
      try {
        const result = await getFinancialKPIs({ data: { days: getDaysForPeriod(period) } });
        return (result as any) as KPIData;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados");
        return null;
      }
    },
  });

  const kpi = kpiData || {};
  const totalSalesValue = kpi.totalSalesValue ?? 0;
  const totalCost = kpi.totalCost ?? 0;
  const totalProfit = kpi.totalProfit ?? 0;
  const profitMargin = kpi.profitMargin ?? 0;
  const totalOrders = kpi.totalOrders ?? 0;
  const averageOrderValue = kpi.averageOrderValue ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="rounded-lg p-2 hover:bg-neutral-100"
            >
              <ArrowLeft className="size-5 text-neutral-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">Relatório de Receita</h1>
              <p className="mt-1 text-sm text-neutral-500">
                Análise de faturamento, custos e lucratividade
              </p>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </div>
      )}

      {/* Filtro de período */}
      <div className="flex flex-wrap gap-3">
        {(
          [
            { value: "today" as const, label: "Hoje" },
            { value: "week" as const, label: "Última semana" },
            { value: "month" as const, label: "Últimos 30 dias" },
            { value: "all" as const, label: "Últimos 12 meses" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              period === opt.value
                ? "bg-[#E11D2E] text-white"
                : "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Faturamento"
          value={currency.format(totalSalesValue)}
          icon={DollarSign}
          color="bg-emerald-50 text-emerald-700"
          loading={isPending}
        />
        <KPICard
          title="Custos"
          value={currency.format(totalCost)}
          icon={TrendingDown}
          color="bg-orange-50 text-orange-700"
          loading={isPending}
        />
        <KPICard
          title="Lucro"
          value={currency.format(totalProfit)}
          icon={TrendingUp}
          color="bg-blue-50 text-blue-700"
          loading={isPending}
        />
        <KPICard
          title="Margem"
          value={percent.format(profitMargin / 100)}
          icon={Percent}
          color="bg-purple-50 text-purple-700"
          loading={isPending}
        />
      </div>

      {/* Detalhes adicionais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Quantidade de pedidos</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">
            {isPending ? "-" : totalOrders}
          </p>
          <p className="mt-1 text-xs text-neutral-500">pedidos neste período</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Ticket médio</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">
            {isPending ? "-" : currency.format(averageOrderValue)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">por pedido</p>
        </div>
      </div>

      {/* Resumo */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900">Resumo Financeiro</h3>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-600">Faturamento bruto:</span>
            <span className="font-medium text-neutral-900">
              {isPending ? "-" : currency.format(totalSalesValue)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
            <span className="text-sm text-neutral-600">Menos custos:</span>
            <span className="font-medium text-neutral-900">
              -{isPending ? "-" : currency.format(totalCost)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
            <span className="text-sm font-semibold text-neutral-900">Lucro bruto:</span>
            <span className="text-lg font-bold text-emerald-700">
              {isPending ? "-" : currency.format(totalProfit)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
            <span className="text-sm text-neutral-600">Margem de lucro:</span>
            <span className="font-medium text-neutral-900">
              {isPending ? "-" : percent.format(profitMargin / 100)}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        💡 Dica: O lucro aqui é o lucro bruto (receita - custo de matéria-prima). Outras despesas
        como aluguel, funcionários e utilitários não estão incluídas.
      </p>
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
  loading?: boolean;
}

function KPICard({ title, value, icon: Icon, color, loading }: KPICardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${color}`}>
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-sm text-neutral-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{loading ? "-" : value}</p>
    </div>
  );
}
