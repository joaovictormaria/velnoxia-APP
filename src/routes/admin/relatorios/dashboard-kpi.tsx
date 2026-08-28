import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { getFinancialKPIs } from "@/server/functions/inventory-costs.fn";

export const Route = createFileRoute("/admin/relatorios/dashboard-kpi")({
  component: FinancialDashboardPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 });

interface KPIData {
  totalSalesValue?: number;
  totalCost?: number;
  totalProfit?: number;
  profitMargin?: number;
  totalOrders?: number;
  averageOrderValue?: number;
  receitaApurada?: number;
  custoApurado?: number;
  margemApurada?: number | null;
  cobertura?: number;
}

function FinancialDashboardPage() {
  const [period, setPeriod] = useState(30);

  const { data: currentKpi } = useQuery({
    queryKey: ["financialKPIs", period],
    queryFn: async () => {
      try {
        const result = await getFinancialKPIs({ data: { days: period } });
        return (result as any) as KPIData;
      } catch {
        return null;
      }
    },
  });

  const { data: previousKpi } = useQuery({
    queryKey: ["financialKPIs", period * 2],
    queryFn: async () => {
      try {
        const result = await getFinancialKPIs({ data: { days: period * 2 } });
        return (result as any) as KPIData;
      } catch {
        return null;
      }
    },
  });

  const kpi = currentKpi || {};

  const totalSalesValue = kpi.totalSalesValue ?? 0;
  const totalProfit = kpi.totalProfit ?? 0;
  const totalOrders = kpi.totalOrders ?? 0;
  const receitaApurada = kpi.receitaApurada ?? 0;
  const custoApurado = kpi.custoApurado ?? 0;
  const cobertura = kpi.cobertura ?? 0;
  const margemApurada = kpi.margemApurada ?? null;
  /* Para os indicadores de saúde, que precisam de um número. Nulo vira travessão na tela. */
  const margemDaSaude = margemApurada ?? 0;

  /*
   * O PERÍODO ANTERIOR É SUBTRAÍDO, NÃO CONSULTADO.
   *
   * A consulta de comparação pede `period * 2` dias — mas `days` sempre conta
   * a partir de HOJE, então isso devolvia os últimos 60 dias, que CONTÊM os 30
   * atuais. Comparar um conjunto com um superconjunto dele: com vendas
   * estáveis o atual é sempre metade do "anterior", e as três setas apontavam
   * para baixo permanentemente, por construção e não por queda.
   *
   * Subtrair devolve a janela disjunta — os dias 31 a 60 — sem precisar de um
   * parâmetro novo na server function.
   */
  const anterior = previousKpi
    ? {
        totalSalesValue: (previousKpi.totalSalesValue ?? 0) - totalSalesValue,
        totalProfit: (previousKpi.totalProfit ?? 0) - totalProfit,
        receitaApurada: (previousKpi.receitaApurada ?? 0) - receitaApurada,
        custoApurado: (previousKpi.custoApurado ?? 0) - custoApurado,
      }
    : null;

  /*
   * A margem anterior é RECALCULADA a partir dos totais subtraídos. Margem é
   * razão, não soma: subtrair a margem de 60 dias da de 30 não produz a margem
   * dos 30 dias anteriores.
   */
  const margemAnterior =
    anterior && anterior.receitaApurada > 0
      ? ((anterior.receitaApurada - anterior.custoApurado) / anterior.receitaApurada) * 100
      : null;

  const calculateTrend = (current: number, previous?: number | null) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return Math.round(change);
  };

  const salesTrend = anterior ? calculateTrend(totalSalesValue, anterior.totalSalesValue) : null;
  const profitTrend = anterior ? calculateTrend(totalProfit, anterior.totalProfit) : null;
  const marginTrend =
    margemAnterior !== null && margemApurada !== null
      ? calculateTrend(margemApurada, margemAnterior)
      : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="rounded-lg p-2 hover:bg-neutral-100"
          >
            <ArrowLeft className="size-5 text-neutral-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Dashboard de KPIs Financeiros</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Análise comparativa e tendências de desempenho financeiro
            </p>
          </div>
        </div>
      </header>

      {/* Período */}
      <div className="flex flex-wrap gap-3">
        {[
          { value: 7, label: "7 dias" },
          { value: 30, label: "30 dias" },
          { value: 90, label: "90 dias" },
          { value: 365, label: "12 meses" },
        ].map((opt) => (
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

      {/* KPIs Principais com Tendência */}
      {/*
        Faturamento de um lado, resultado apurado do outro.

        Num quarteto único, "Faturamento − Custo" não bateria com "Lucro"
        sempre que a cobertura fosse menor que 100% — e o leitor concluiria,
        com razão, que a tela está errada. Separados, cada bloco fecha na
        própria conta.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KPICardWithTrend
          title="Faturamento"
          value={currency.format(totalSalesValue)}
          trend={salesTrend}
          icon="💰"
          bgColor="bg-blue-50"
        />
        <KPICardWithTrend
          title="Pedidos concluídos"
          value={String(totalOrders)}
          trend={null}
          icon="🧾"
          bgColor="bg-neutral-50"
        />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">Resultado apurado</h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              cobertura >= 90
                ? "bg-emerald-50 text-emerald-700"
                : cobertura > 0
                  ? "bg-amber-50 text-amber-700"
                  : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {percent.format(cobertura / 100)} do faturamento
          </span>
        </div>

        {cobertura === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">
            Nenhuma venda do período tem custo apurado. Vincule os produtos a itens
            de estoque para que a margem possa ser calculada.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPICardWithTrend
              title="Custo de Matéria-Prima"
              value={currency.format(custoApurado)}
              trend={null}
              icon="📦"
              bgColor="bg-orange-50"
            />
            <KPICardWithTrend
              title="Lucro Bruto"
              value={currency.format(totalProfit)}
              trend={profitTrend}
              icon="📈"
              bgColor="bg-emerald-50"
            />
            <KPICardWithTrend
              title="Margem de Lucro"
              value={margemApurada === null ? "—" : percent.format(margemApurada / 100)}
              trend={marginTrend}
              icon="📊"
              bgColor="bg-purple-50"
            />
          </div>
        )}
      </div>

      {/* Análise Detalhada */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Breakdown de Valores */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-4">Breakdown do resultado apurado</h3>

          <div className="space-y-4">
            {/* Faturamento */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-neutral-700">Faturamento</span>
                <span className="text-sm font-bold text-neutral-900">
                  {currency.format(receitaApurada)}
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: "100%" }}></div>
              </div>
            </div>

            {/* Custo */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-neutral-700">Custo (-)</span>
                <span className="text-sm font-bold text-red-600">
                  -{currency.format(custoApurado)}
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full"
                  style={{
                    width: receitaApurada > 0 ? `${(custoApurado / receitaApurada) * 100}%` : "0%",
                  }}
                ></div>
              </div>
            </div>

            {/* Lucro */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-neutral-700">Lucro Bruto</span>
                <span className="text-sm font-bold text-emerald-600">
                  {currency.format(totalProfit)}
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{
                    width: receitaApurada > 0 ? `${(totalProfit / receitaApurada) * 100}%` : "0%",
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <p className="text-xs text-neutral-600 mb-2">
              <strong>Índices de Eficiência:</strong>
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-700">Custo como % do faturamento:</span>
                <span className="font-medium">
                  {percent.format(receitaApurada > 0 ? custoApurado / receitaApurada : 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Lucro como % do faturamento:</span>
                <span className="font-medium text-emerald-700">
                  {percent.format(receitaApurada > 0 ? totalProfit / receitaApurada : 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tendências */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-4">Tendências</h3>

          <div className="space-y-3">
            <TrendCard
              label="Faturamento"
              trend={salesTrend}
              description="Comparado ao período anterior"
            />
            <TrendCard label="Lucro Bruto" trend={profitTrend} description="Mudança percentual" />
            <TrendCard
              label="Margem de Lucro"
              trend={marginTrend}
              description="Tendência de rentabilidade"
            />
          </div>

          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200 flex gap-3">
            <AlertCircle className="size-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Nota sobre comparações</p>
              <p className="text-xs text-amber-800 mt-1">
                As tendências comparam o período atual com o dobro do período (ex: 30 dias vs 60
                dias). Use para identificar padrões de crescimento ou queda.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Health Check */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-4">Saúde Financeira</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <HealthIndicator
            label="Margem de Lucro"
            value={margemApurada === null ? "—" : percent.format(margemDaSaude / 100)}
            status={margemDaSaude >= 40 ? "good" : margemDaSaude >= 25 ? "ok" : "warning"}
            description={
              margemDaSaude >= 40
                ? "Excelente margem"
                : margemDaSaude >= 25
                  ? "Margem aceitável"
                  : "Margem baixa - revisar custos"
            }
          />

          <HealthIndicator
            label="Faturamento vs Custo"
            value={percent.format(receitaApurada > 0 ? custoApurado / receitaApurada : 0)}
            status={
              receitaApurada > 0
                ? custoApurado / receitaApurada <= 0.6
                  ? "good"
                  : custoApurado / receitaApurada <= 0.75
                    ? "ok"
                    : "warning"
                : "warning"
            }
            description={
              receitaApurada > 0
                ? custoApurado / receitaApurada <= 0.6
                  ? "Custos saudáveis"
                  : custoApurado / receitaApurada <= 0.75
                    ? "Custos dentro do esperado"
                    : "Custos muito altos"
                : "Sem faturamento"
            }
          />

          <HealthIndicator
            label="Lucro Bruto"
            value={currency.format(totalProfit)}
            status={totalProfit > 0 ? "good" : "warning"}
            description={totalProfit > 0 ? "Negócio lucrativo" : "Prejuízo - investigar"}
          />
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        💡 Dashboard atualizado em tempo real. Todos os valores referem-se ao lucro bruto
        (receita - custo de matéria-prima).
      </p>
    </div>
  );
}

interface KPICardWithTrendProps {
  title: string;
  value: string;
  trend: number | null;
  icon: string;
  bgColor: string;
}

function KPICardWithTrend({ title, value, trend, icon, bgColor }: KPICardWithTrendProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl">{icon}</span>
        {trend !== null && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
              trend > 0
                ? "bg-emerald-100 text-emerald-700"
                : trend < 0
                  ? "bg-red-100 text-red-700"
                  : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {trend > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-sm text-neutral-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}

interface TrendCardProps {
  label: string;
  trend: number | null;
  description: string;
}

function TrendCard({ label, trend, description }: TrendCardProps) {
  if (trend === null) {
    return (
      <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-neutral-700">{label}</span>
          <span className="text-xs text-neutral-500">Sem dados</span>
        </div>
        <p className="text-xs text-neutral-500">{description}</p>
      </div>
    );
  }

  const isPositive = trend > 0;

  return (
    <div
      className={`p-3 rounded-lg border ${
        isPositive
          ? "bg-emerald-50 border-emerald-200"
          : trend === 0
            ? "bg-neutral-50 border-neutral-200"
            : "bg-red-50 border-red-200"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        <span
          className={`text-sm font-bold ${
            isPositive
              ? "text-emerald-700"
              : trend === 0
                ? "text-neutral-700"
                : "text-red-700"
          }`}
        >
          {trend > 0 ? "+" : ""}{trend}%
        </span>
      </div>
      <p className="text-xs text-neutral-600">{description}</p>
    </div>
  );
}

interface HealthIndicatorProps {
  label: string;
  value: string;
  status: "good" | "ok" | "warning";
  description: string;
}

function HealthIndicator({ label, value, status, description }: HealthIndicatorProps) {
  const statusColors = {
    good: "border-emerald-200 bg-emerald-50",
    ok: "border-amber-200 bg-amber-50",
    warning: "border-red-200 bg-red-50",
  };

  const statusBadgeColors = {
    good: "bg-emerald-100 text-emerald-700",
    ok: "bg-amber-100 text-amber-700",
    warning: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    good: "✓ Saudável",
    ok: "⚠ Atenção",
    warning: "✗ Crítico",
  };

  return (
    <div className={`rounded-xl border p-4 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-neutral-900">{label}</span>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadgeColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>
      <p className="text-2xl font-bold text-neutral-900 mb-1">{value}</p>
      <p className="text-xs text-neutral-700">{description}</p>
    </div>
  );
}
