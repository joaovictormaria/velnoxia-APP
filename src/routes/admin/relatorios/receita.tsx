import { createFileRoute } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { getFinancialKPIs } from "@/server/functions/inventory-costs.fn";
import { getFinancialTimeline } from "@/server/functions/financial-timeline.fn";

/*
  MÓDULO PAGO — FINANCEIRO.

  A classificação vem da FUNÇÃO da tela, e não da pasta em que ela mora:
  esta rota está sob `/admin/relatorios`, mas o que entrega é apuração de
  dinheiro. Pelo mesmo critério, "Pagamentos em aberto" é FIADO e o
  relatório de equipe é FUNCIONARIOS, cada um com sua fase.

  As server functions que alimentam esta tela já exigem FINANCEIRO; a
  guarda de rota evita que digitar a URL renda um painel de erros.
*/
export const Route = createFileRoute("/admin/relatorios/receita")(
  rotaPremium("FINANCEIRO", ReportFinancialPage),
);

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
  receitaApurada?: number;
  custoApurado?: number;
  margemApurada?: number | null;
  cobertura?: number;
  pedidosSemVinculo?: number;
  pedidosSemCusto?: number;
  pedidosParciais?: number;
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

  const { data: timelineData } = useQuery({
    queryKey: ["financialTimeline", period],
    queryFn: async () => {
      try {
        const result = await getFinancialTimeline({ data: { days: getDaysForPeriod(period) } });
        return (result as any) || [];
      } catch (err) {
        console.error("Erro ao carregar timeline:", err);
        return [];
      }
    },
  });

  const kpi = kpiData || {};
  const totalSalesValue = kpi.totalSalesValue ?? 0;
  const totalProfit = kpi.totalProfit ?? 0;
  const totalOrders = kpi.totalOrders ?? 0;
  const averageOrderValue = kpi.averageOrderValue ?? 0;
  const receitaApurada = kpi.receitaApurada ?? 0;
  const custoApurado = kpi.custoApurado ?? 0;
  const cobertura = kpi.cobertura ?? 0;
  const pedidosSemVinculo = kpi.pedidosSemVinculo ?? 0;
  const pedidosSemCusto = kpi.pedidosSemCusto ?? 0;
  const pedidosParciais = kpi.pedidosParciais ?? 0;
  /* `null` quando nada foi apurado. Zero diria que a loja nao tem margem. */
  const margemApurada = kpi.margemApurada ?? null;

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

      {/*
        DOIS BLOCOS, E A SEPARAÇÃO É O ASSUNTO.

        Faturamento é tudo que foi vendido. Resultado apurado é só a fatia cujo
        custo o sistema realmente mediu. Juntar os dois num quarteto de cards
        faria "Faturamento − Custos" não bater com "Lucro" — e o leitor
        concluiria, com razão, que a tela está errada.

        Separados, cada bloco fecha na própria aritmética, e a cobertura no
        cabeçalho explica por que o segundo é menor que o primeiro.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          title="Faturamento"
          value={currency.format(totalSalesValue)}
          icon={DollarSign}
          color="bg-emerald-50 text-emerald-700"
          loading={isPending}
        />
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Pedidos</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">
            {isPending ? "-" : totalOrders}
          </p>
          <p className="mt-1 text-xs text-neutral-500">vendas concluídas no período</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Ticket médio</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">
            {isPending ? "-" : currency.format(averageOrderValue)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">faturamento por pedido</p>
        </div>
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
            {isPending ? "—" : `${percent.format(cobertura / 100)} do faturamento`}
          </span>
        </div>

        {!isPending && cobertura === 0 ? (
          /*
            Nada medido. Antes esta situação produzia margem de 100%: sem
            vínculo de estoque o custo chegava como zero, e a tela anunciava
            lucro integral sobre uma venda que ninguém apurou.
          */
          <p className="mt-4 text-sm text-neutral-600">
            Nenhuma venda do período tem custo apurado. Vincule os produtos a itens
            de estoque para que a margem possa ser calculada.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                title="Receita apurada"
                value={currency.format(receitaApurada)}
                icon={DollarSign}
                color="bg-emerald-50 text-emerald-700"
                loading={isPending}
              />
              <KPICard
                title="Custo (CMV)"
                value={currency.format(custoApurado)}
                icon={TrendingDown}
                color="bg-orange-50 text-orange-700"
                loading={isPending}
              />
              <KPICard
                title="Lucro bruto"
                value={currency.format(totalProfit)}
                icon={TrendingUp}
                color="bg-blue-50 text-blue-700"
                loading={isPending}
              />
              <KPICard
                title="Margem"
                value={margemApurada === null ? "—" : percent.format(margemApurada / 100)}
                icon={Percent}
                color="bg-purple-50 text-purple-700"
                loading={isPending}
              />
            </div>

            <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">Receita apurada:</span>
                <span className="font-medium text-neutral-900">
                  {isPending ? "-" : currency.format(receitaApurada)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                <span className="text-sm text-neutral-600">Menos custo da mercadoria:</span>
                <span className="font-medium text-neutral-900">
                  -{isPending ? "-" : currency.format(custoApurado)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                <span className="text-sm font-semibold text-neutral-900">Lucro bruto:</span>
                <span className="text-lg font-bold text-emerald-700">
                  {isPending ? "-" : currency.format(totalProfit)}
                </span>
              </div>
            </div>
          </>
        )}

        {!isPending && (pedidosSemVinculo > 0 || pedidosSemCusto > 0 || pedidosParciais > 0) && (
          <p className="mt-4 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
            {pedidosParciais > 0 && (
              <>
                {pedidosParciais} pedido(s) com apuração parcial — parte das linhas não
                tem custo medido.{" "}
              </>
            )}
            {(pedidosSemVinculo > 0 || pedidosSemCusto > 0) && "Fora da apuração: "}
            {pedidosSemVinculo > 0 && `${pedidosSemVinculo} sem vínculo de estoque`}
            {pedidosSemVinculo > 0 && pedidosSemCusto > 0 && " · "}
            {pedidosSemCusto > 0 && `${pedidosSemCusto} sem custo cadastrado`}.
          </p>
        )}
      </div>

      {/* Gráficos de Evolução */}
      {timelineData && timelineData.length > 0 ? (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-neutral-900">Evolução Temporal</h3>

          {/* Gráfico de Linha - Faturamento vs Custos vs Lucro */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-neutral-700">
              Faturamento vs Custos vs Lucro
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(date) => {
                    const d = new Date(date + "T00:00:00");
                    return d.toLocaleDateString("pt-BR", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any) => currency.format(value)}
                  labelFormatter={(date) => {
                    const d = new Date(date + "T00:00:00");
                    return d.toLocaleDateString("pt-BR");
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalSales"
                  stroke="#10b981"
                  name="Faturamento"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="totalCost"
                  stroke="#f97316"
                  name="Custos"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="totalProfit"
                  stroke="#3b82f6"
                  name="Lucro"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de Área - Lucro Diário */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-neutral-700">Lucro Diário</p>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(date) => {
                    const d = new Date(date + "T00:00:00");
                    return d.toLocaleDateString("pt-BR", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any) => currency.format(value)}
                  labelFormatter={(date) => {
                    const d = new Date(date + "T00:00:00");
                    return d.toLocaleDateString("pt-BR");
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalProfit"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorProfit)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de Barras - Pedidos por Dia */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-neutral-700">
              Quantidade de Pedidos
            </p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(date) => {
                    const d = new Date(date + "T00:00:00");
                    return d.toLocaleDateString("pt-BR", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(date) => {
                    const d = new Date(date + "T00:00:00");
                    return d.toLocaleDateString("pt-BR");
                  }}
                />
                <Bar dataKey="orderCount" fill="#8b5cf6" name="Pedidos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-500">
            📊 Gráficos aparecem quando há pedidos finalizados neste período
          </p>
        </div>
      )}

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
