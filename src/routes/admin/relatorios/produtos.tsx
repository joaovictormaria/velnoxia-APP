import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { productReportFn } from "@/server/functions/reports.fn";

export const Route = createFileRoute("/admin/relatorios/produtos")({
  component: ProductReportPage,
});

type Days = 1 | 7 | 30 | 90;
const PERIODOS: { days: Days; label: string }[] = [
  { days: 1, label: "Hoje" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ProductReportPage() {
  const [days, setDays] = useState<Days>(30);
  const { data, isPending } = useQuery({
    queryKey: ["report-products", days],
    queryFn: () => productReportFn({ data: { days } }),
  });

  const maiorFaturamento = Math.max(...(data?.map((p) => p.revenue) ?? [0]), 1);
  const totalFaturado = data?.reduce((s, p) => s + p.revenue, 0) ?? 0;

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
          O que mais saiu, e o que mais rendeu — nem sempre é o mesmo item.
        </p>
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

      {isPending ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : !data?.length ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nenhum item vendido no período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 text-right font-medium">Qtd. vendida</th>
                <th className="px-4 py-3 text-right font-medium">Faturamento</th>
                <th className="px-4 py-3 font-medium">Participação</th>
              </tr>
            </thead>
            <tbody>
              {/* Ordenado por faturamento, não por quantidade: o item que sai
                  mais nem sempre é o que sustenta a loja. */}
              {data.map((p) => (
                <tr key={p.name} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
                  <td className="px-4 py-3 text-right text-neutral-700">{p.quantity}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900">
                    {money(p.revenue)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-[#E11D2E]/70"
                          style={{ width: `${(p.revenue / maiorFaturamento) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-neutral-500">
                        {totalFaturado ? ((p.revenue / totalFaturado) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
