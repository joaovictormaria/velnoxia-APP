import { createFileRoute, Link } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, PackageX } from "lucide-react";
import { getPerdas } from "@/server/functions/inventory-costs.fn";

/*
  MÓDULO PAGO — FINANCEIRO.

  A classificação vem da FUNÇÃO da tela, e não da pasta em que ela mora:
  esta rota está sob `/admin/relatorios`, mas o que entrega é apuração de
  dinheiro. Pelo mesmo critério, "Pagamentos em aberto" é FIADO e o
  relatório de equipe é FUNCIONARIOS, cada um com sua fase.

  As server functions que alimentam esta tela já exigem FINANCEIRO; a
  guarda de rota evita que digitar a URL renda um painel de erros.
*/
export const Route = createFileRoute("/admin/relatorios/perdas")(
  rotaPremium("FINANCEIRO", PerdasPage),
);

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const quantidade = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/**
 * A PERDA ABERTA EM LINHAS.
 *
 * O total no painel responde "quanto perdi"; esta tela responde as duas
 * perguntas seguintes, que são as que mudam alguma coisa: perdi O QUÊ, e POR
 * QUÊ. Sem elas o número é só um lamento mensal.
 *
 * A fonte é a mesma do total — movimentos `LOSS` do razão, com o custo
 * congelado no movimento. Nenhuma regra de custo nova: se os dois números
 * discordassem, o dono não teria como saber qual acreditar.
 */
function PerdasPage() {
  const [period, setPeriod] = useState(30);

  const { data, isPending } = useQuery({
    queryKey: ["perdas", period],
    queryFn: async () => getPerdas({ data: { days: period } }),
  });

  const linhas = data?.linhas ?? [];
  const total = data?.total ?? 0;
  const semCusto = data?.semCusto ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/relatorios/dashboard-kpi" className="rounded-lg p-2 hover:bg-neutral-100">
            <ArrowLeft className="size-5 text-neutral-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Perdas</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Material que saiu do estoque sem virar venda
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {[
            { value: 7, label: "7 dias" },
            { value: 30, label: "30 dias" },
            { value: 90, label: "90 dias" },
            { value: 365, label: "12 meses" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                period === opt.value
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {/*
        O total e a ressalva juntos. Separá-los deixaria alguém somar a coluna e
        concluir que a conta não fecha — quando o que não fecha é o cadastro.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Total perdido no período
          </p>
          <p className="mt-2 font-display text-3xl font-bold leading-none tracking-tight tabular-nums text-[#E11D2E]">
            {currency.format(total)}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Não é receita e não é custo de venda. Sai do resultado por fora do CMV.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Movimentos no período
          </p>
          <p className="mt-2 font-display text-3xl font-bold leading-none tracking-tight tabular-nums text-neutral-950">
            {linhas.length}
          </p>
          {semCusto > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              {semCusto} sem custo cadastrado — ficaram fora do total acima em vez de
              entrar como R$ 0.
            </p>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">Todas com custo conhecido.</p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {isPending ? (
          <p className="p-8 text-center text-sm text-neutral-500">Carregando...</p>
        ) : linhas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <PackageX className="size-8 text-neutral-300" />
            <p className="text-sm text-neutral-600">Nenhuma perda no período.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Item</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    Quantidade
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    Custo unitário
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">
                    Origem
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">
                    Movimento
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha: any) => (
                  <tr key={linha.movimentoId} className="border-b border-neutral-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-neutral-600">
                      {dateTime.format(new Date(linha.data))}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">{linha.item}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-neutral-700">
                      {quantidade.format(linha.quantidade)} {linha.unidade}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-neutral-600">
                      {/*
                        Travessão, nunca R$ 0,00. Zero afirmaria que o material
                        era de graça — é a mesma armadilha que fazia o relatório
                        antigo anunciar margem de 100%.
                      */}
                      {linha.custoUnitario === null ? "—" : currency.format(linha.custoUnitario)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums">
                      {linha.valor === null ? (
                        <span className="text-amber-700">sem custo</span>
                      ) : (
                        <span className="text-[#E11D2E]">{currency.format(linha.valor)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      <OrigemDaPerda linha={linha} />
                    </td>
                    <td className="px-4 py-3">
                      {/* O id existe para a conferência bater com o razão. */}
                      <code className="font-mono text-xs text-neutral-400">
                        {linha.movimentoId}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * De onde a perda veio, com link quando há para onde ir.
 *
 * `ORDER` é cancelamento depois do preparo — o pedido existe e a página dele
 * conta o resto da história. `PRODUCTION_RUN` é quebra na produção. Sem
 * referência, foi lançamento manual no estoque.
 */
function OrigemDaPerda({ linha }: { linha: any }) {
  if (linha.origem === "ORDER" && linha.referencia) {
    return (
      <span className="flex flex-col gap-0.5">
        <Link
          to="/admin/pedidos/$orderId"
          params={{ orderId: linha.referencia }}
          className="font-medium text-[#E11D2E] hover:underline"
        >
          Pedido cancelado
        </Link>
        {linha.motivo && <span className="text-xs text-neutral-500">{linha.motivo}</span>}
      </span>
    );
  }

  if (linha.origem === "PRODUCTION_RUN") {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-neutral-700">Produção</span>
        {linha.motivo && <span className="text-xs text-neutral-500">{linha.motivo}</span>}
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-neutral-700">Lançamento manual</span>
      {linha.motivo && <span className="text-xs text-neutral-500">{linha.motivo}</span>}
    </span>
  );
}
