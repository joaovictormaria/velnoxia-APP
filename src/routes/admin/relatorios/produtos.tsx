import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import {
  getFinancialKPIs,
  getProductProfitability,
} from "@/server/functions/inventory-costs.fn";

export const Route = createFileRoute("/admin/relatorios/produtos")({
  component: ProductReportPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 });

type Produto = {
  productName: string;
  totalOrders: number;
  totalSalesValue: number;
  totalCost: number;
  totalProfit: number;
  profitPercent: number;
};

type Cobertura = {
  cobertura?: number;
  totalSalesValue?: number;
  receitaApurada?: number;
  pedidosParciais?: number;
  pedidosSemVinculo?: number;
  pedidosSemCusto?: number;
};

const PERIODOS = [
  { dias: 7, label: "Última semana" },
  { dias: 30, label: "Últimos 30 dias" },
  { dias: 90, label: "Últimos 90 dias" },
  { dias: 365, label: "Últimos 12 meses" },
] as const;

function ProductReportPage() {
  const [dias, setDias] = useState<number>(30);

  const { data: produtos, isPending } = useQuery({
    queryKey: ["productProfitability", dias],
    queryFn: async () => {
      const r = await getProductProfitability({ data: { days: dias } });
      return (r as unknown as Produto[]) ?? [];
    },
  });

  /*
   * A cobertura vem dos KPIs, e não de uma consulta nova.
   *
   * Este ranking é montado SÓ com pedidos cujo custo foi integralmente apurado —
   * é o único recorte em que a margem por produto não depende de dividir um
   * custo que o razão não sabe dividir. Sem dizer isso na tela, uma lista curta
   * pareceria "vendemos pouco" quando na verdade significa "medimos pouco".
   */
  const { data: kpis } = useQuery({
    queryKey: ["financialKPIs", dias],
    queryFn: async () => {
      const r = await getFinancialKPIs({ data: { days: dias } });
      return (r as unknown as Cobertura) ?? {};
    },
  });

  const lista = produtos ?? [];
  const cobertura = kpis?.cobertura ?? 0;
  const foraDaApuracao =
    (kpis?.pedidosParciais ?? 0) +
    (kpis?.pedidosSemVinculo ?? 0) +
    (kpis?.pedidosSemCusto ?? 0);

  const melhor = lista[0];
  const pior = lista.length > 1 ? lista[lista.length - 1] : undefined;

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
          Rentabilidade por produto, sobre as vendas com custo apurado.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {PERIODOS.map((opt) => (
          <button
            key={opt.dias}
            onClick={() => setDias(opt.dias)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              dias === opt.dias
                ? "bg-[#E11D2E] text-white"
                : "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/*
        A cobertura vem ANTES da tabela, de propósito.

        Um ranking de rentabilidade lido sem saber que fatia do faturamento ele
        cobre é pior do que nenhum ranking: o dono decide o cardápio com base
        numa amostra cujo tamanho ele não conhece.
      */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Cobertura da apuração</h2>
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
        <p className="mt-3 text-sm text-neutral-600">
          Este ranking considera apenas pedidos em que <strong>todas</strong> as linhas
          tiveram o custo medido. Vendas de produtos sem vínculo com o estoque, ou com
          insumo sem custo cadastrado, ficam de fora — em vez de aparecerem aqui com
          margem de 100%.
        </p>
        {foraDaApuracao > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            {foraDaApuracao} pedido(s) do período ficaram fora por apuração incompleta.
          </p>
        )}
      </div>

      {isPending ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Carregando…
        </div>
      ) : lista.length === 0 ? (
        /*
          Vazio explicado, e não "sem dados".
          Lista vazia aqui quase nunca significa que não houve venda: significa
          que nenhuma venda teve custo medido. O texto tem de dizer o que fazer.
        */
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-neutral-900">
            Nenhum produto com custo apurado neste período.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Para um produto aparecer aqui, ele precisa estar vinculado a um item de
            estoque — direto ou por ficha técnica — e esse item precisa ter custo
            cadastrado.
          </p>
        </div>
      ) : (
        <>
          {melhor && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DestaqueCard
                titulo="Maior margem"
                produto={melhor}
                icone={TrendingUp}
                cor="bg-emerald-50 text-emerald-700"
              />
              {/*
                Só aparece quando há mais de um produto. Com um só, "maior" e
                "menor" margem seriam o MESMO produto em dois cartões — que é
                exatamente o que o relatório antigo fazia.
              */}
              {pior && (
                <DestaqueCard
                  titulo="Menor margem"
                  produto={pior}
                  icone={TrendingDown}
                  cor="bg-orange-50 text-orange-700"
                />
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">
                    Produto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    Linhas vendidas
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    Receita
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    CMV
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    Lucro
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    Margem
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {lista.map((p) => (
                  <tr key={p.productName} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {p.productName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                      {p.totalOrders}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                      {currency.format(p.totalSalesValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                      {currency.format(p.totalCost)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        p.totalProfit >= 0 ? "text-emerald-700" : "text-[#E11D2E]"
                      }`}
                    >
                      {currency.format(p.totalProfit)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                      {percent.format(p.profitPercent / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-neutral-500">
            O custo por produto é uma aproximação: o razão de estoque registra o consumo
            por <strong>pedido</strong>, não por linha, e o rateio entre os produtos de um
            mesmo pedido é feito pelo preço de venda.
          </p>
        </>
      )}
    </div>
  );
}

function DestaqueCard({
  titulo,
  produto,
  icone: Icone,
  cor,
}: {
  titulo: string;
  produto: Produto;
  icone: typeof TrendingUp;
  cor: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className={`rounded-lg p-2 ${cor}`}>
          <Icone className="size-5" />
        </span>
        <div>
          <p className="text-sm text-neutral-500">{titulo}</p>
          <p className="text-lg font-bold text-neutral-900">{produto.productName}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-neutral-600">Margem</span>
        <span className="font-semibold text-neutral-900">
          {percent.format(produto.profitPercent / 100)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-sm">
        <span className="text-neutral-600">Lucro no período</span>
        <span className="font-semibold text-neutral-900">
          {currency.format(produto.totalProfit)}
        </span>
      </div>
    </div>
  );
}
