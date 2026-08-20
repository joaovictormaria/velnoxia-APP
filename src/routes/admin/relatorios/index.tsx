import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { salesOverviewFn } from "@/server/functions/reports.fn";

export const Route = createFileRoute("/admin/relatorios/")({
  component: ReportsPage,
});

type Days = 7 | 30 | 90;
const PERIODOS: { days: Days; label: string }[] = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIPO: Record<string, string> = { DELIVERY: "Entrega", PICKUP: "Retirada" };
const PAGAMENTO: Record<string, string> = {
  PIX: "Pix",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
};

function ReportsPage() {
  const [days, setDays] = useState<Days>(30);
  const { data, isPending } = useQuery({
    queryKey: ["report-overview", days],
    queryFn: () => salesOverviewFn({ data: { days } }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Relatórios</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Pedidos cancelados ficam de fora do faturamento.
          </p>
        </div>
        <Link
          to="/admin/relatorios/produtos"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E11D2E] hover:underline"
        >
          Ver por produto <ArrowRight className="size-4" />
        </Link>
      </header>

      <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
        {PERIODOS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setDays(p.days)}
            className={
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
              (days === p.days
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {isPending || !data ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              label="Faturamento"
              value={money(data.revenue)}
              explicacao="Tudo o que a loja vendeu no período, somado. Pedidos cancelados não entram."
              atual={data.revenue}
              anterior={data.previousRevenue}
            />
            <Card
              label="Pedidos"
              value={String(data.orderCount)}
              explicacao="Quantos pedidos entraram no período, sem contar os cancelados."
              atual={data.orderCount}
              anterior={data.previousOrderCount}
            />
            <Card
              label="Ticket médio"
              value={money(data.averageTicket)}
              explicacao="Quanto cada cliente gastou, em média, por pedido. É o faturamento dividido pelo número de pedidos — mostra se o pedido está engordando quando você cria um combo ou oferece um adicional."
            />
            <Card
              label="Cancelados"
              value={String(data.cancelled)}
              explicacao="Pedidos que foram cancelados no período. Não entram no faturamento nem no ticket médio."
            />
          </div>

          <Series series={data.series} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Breakdown
              title="Entrega ou retirada"
              explicacao="Quantos clientes pediram para entregar e quantos foram buscar. Ajuda a dimensionar quantos entregadores você precisa."
              rows={data.byOrderType}
              total={data.orderCount}
              label={(k) => TIPO[k] ?? k}
            />
            <Breakdown
              title="Forma de pagamento"
              explicacao="Como os clientes pagaram. Útil para saber quanto troco deixar no caixa e quanto vai cair na maquininha."
              rows={data.byPaymentMethod}
              total={data.orderCount}
              label={(k) => PAGAMENTO[k] ?? k}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** The comparison is only drawn when there is a previous period to compare
 *  with; "+100%" against zero says nothing. */
function Card({
  label,
  value,
  explicacao,
  atual,
  anterior,
}: {
  label: string;
  value: string;
  /**
   * O que o número quer dizer, em uma linha.
   *
   * Fica embaixo e sempre visível, e não escondido atrás de um "?": quem abre
   * esta tela é dono de restaurante, não analista, e um rótulo como "ticket
   * médio" não se explica sozinho. Uma dica que só aparece no passar do mouse
   * também não existe para quem está no celular.
   */
  explicacao: string;
  atual?: number;
  anterior?: number;
}) {
  const comparavel = atual !== undefined && anterior !== undefined && anterior > 0;
  const variacao = comparavel ? ((atual - anterior) / anterior) * 100 : 0;
  const subiu = variacao >= 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      {comparavel && (
        <p
          className={
            "mt-1 inline-flex items-center gap-1 text-xs " +
            (subiu ? "text-green-600" : "text-[#E11D2E]")
          }
        >
          {subiu ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {Math.abs(variacao).toFixed(0)}% vs. período anterior
        </p>
      )}
      <p className="mt-2 border-t border-neutral-100 pt-2 text-xs leading-relaxed text-neutral-500">
        {explicacao}
      </p>
    </div>
  );
}

/** Bars drawn with plain divs — a chart library for one series would be more
 *  code to keep than the chart is worth. */
function Series({ series }: { series: { date: string; orders: number; revenue: number }[] }) {
  const max = Math.max(...series.map((d) => d.revenue), 1);
  const vazio = series.every((d) => d.orders === 0);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Faturamento por dia</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Quanto entrou em cada dia do período. Serve para achar seus dias fortes e
        fracos da semana.
      </p>
      {vazio ? (
        <p className="mt-6 text-center text-sm text-neutral-500">
          Nenhum pedido no período.
        </p>
      ) : (
        <div className="mt-4 flex h-40 items-end gap-1">
          {series.map((d) => (
            <div
              key={d.date}
              title={`${new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR")} · ${d.orders} pedido(s) · ${money(d.revenue)}`}
              className="flex-1 rounded-t bg-[#E11D2E]/80 transition-colors hover:bg-[#E11D2E]"
              style={{ height: `${Math.max((d.revenue / max) * 100, d.orders > 0 ? 3 : 0)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Breakdown({
  title,
  explicacao,
  rows,
  total,
  label,
}: {
  title: string;
  /** Uma linha dizendo o que a divisão responde. Ver o Card acima. */
  explicacao: string;
  rows: { key: string; count: number }[];
  total: number;
  label: (k: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <p className="mt-1 text-xs text-neutral-500">{explicacao}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Sem dados no período.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-sm text-neutral-700 sm:w-40">{label(r.key)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-[#E11D2E]/70"
                  style={{ width: `${total ? (r.count / total) * 100 : 0}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-sm tabular-nums text-neutral-600 sm:w-10">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
