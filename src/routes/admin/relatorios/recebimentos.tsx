import { createFileRoute, Link } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, HandCoins, AlertCircle } from "lucide-react";
import {
  getPagamentosEmAbertoFn,
  getRecebimentosFn,
  receberPagamentoFn,
} from "@/server/functions/recebimentos.fn";

/*
  MÓDULO PAGO — FIADO, e não FINANCEIRO.

  A tela mora sob `/admin/relatorios`, mas o que ela entrega são contas a
  receber: quem deve, quanto e há quantos dias. Classificá-la pela pasta a
  jogaria em FINANCEIRO junto com receita e margem — e no dia em que os dois
  módulos ficassem em planos diferentes, o cadeado errado apareceria.

  As cinco server functions de recebimentos já exigem FIADO; a guarda de rota
  evita que digitar a URL renda um painel de erros.
*/
export const Route = createFileRoute("/admin/relatorios/recebimentos")(
  rotaPremium("FIADO", RecebimentosPage),
);

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const diaHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

const METODOS = [
  { valor: "PIX", rotulo: "PIX" },
  { valor: "CASH", rotulo: "Dinheiro" },
  { valor: "DEBIT_CARD", rotulo: "Cartão de débito" },
  { valor: "CREDIT_CARD", rotulo: "Cartão de crédito" },
] as const;

/** Os rotulos operacionais, para a coluna de contexto nao mostrar o enum cru. */
const STATUS_OPERACIONAL: Record<string, string> = {
  RECEIVED: "Recebido",
  PREPARING: "Em preparo",
  TABLE_READY: "Pronto (mesa)",
  OUT_FOR_DELIVERY: "Saiu p/ entrega",
  COMPLETED: "Finalizado",
  CANCELLED: "Cancelado",
};

/**
 * VENDA A PRAZO — as duas metades, lado a lado.
 *
 * EM ABERTO é o que a loja tem a receber HOJE: um estado, calculado na hora.
 * RECEBIDOS é o dinheiro que entrou no período, pela data do PAGAMENTO.
 *
 * As duas nunca se somam. Uma venda de 28/08 recebida em 31/08 aparece no
 * faturamento de 28/08 (que é outro relatório) e nos recebimentos de 31/08.
 * Misturar as duas datas num número só é exatamente o erro que esta separação
 * existe para impedir.
 */
function RecebimentosPage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(30);
  const [recebendo, setRecebendo] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<string>("PIX");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const { data: aberto } = useQuery({
    queryKey: ["pagamentos-em-aberto"],
    queryFn: async () => getPagamentosEmAbertoFn({ data: {} }),
    refetchInterval: 60_000,
  });

  const { data: recebidos } = useQuery({
    queryKey: ["recebimentos", period],
    queryFn: async () => getRecebimentosFn({ data: { days: period } }),
  });

  const receber = useMutation({
    mutationFn: (v: { orderId: string; amount: number; method: string }) =>
      receberPagamentoFn({ data: v as any }),
    onSuccess: async (res: any) => {
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setErro(null);
      setRecebendo(null);
      setValor("");
      await queryClient.invalidateQueries({ queryKey: ["pagamentos-em-aberto"] });
      await queryClient.invalidateQueries({ queryKey: ["recebimentos"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "kanban"] });
    },
    onError: () => setErro("Não foi possível registrar o recebimento."),
  });

  const linhas = (aberto?.linhas ?? []) as any[];
  const alvo = linhas.find((l) => l.orderId === recebendo);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/relatorios/dashboard-kpi" className="rounded-lg p-2 hover:bg-neutral-100">
            <ArrowLeft className="size-5 text-neutral-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Pagamentos e recebimentos</h1>
            <p className="mt-1 text-sm text-neutral-500">
              O que ainda falta receber e o dinheiro que já entrou
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                period === d ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
      </header>

      {erro && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* `data-tour`: âncora do tutorial guiado. Não muda nada na tela. */}
        <div data-tour="total-em-aberto" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Em aberto agora
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-amber-900">
            {currency.format(aberto?.total ?? 0)}
          </p>
          <p className="mt-2 text-xs text-amber-800">
            {(aberto?.quantidade ?? 0) === 0
              ? "Nenhuma conta em aberto."
              : `${aberto?.quantidade} conta(s) a receber.`}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Recebido nos últimos {period} dias
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-emerald-700">
            {currency.format(recebidos?.total ?? 0)}
          </p>
          {/*
            A ressalva que impede a leitura errada: este número é DINHEIRO QUE
            ENTROU, não venda. Parte dele pode ser de venda de semanas atrás.
          */}
          <p className="mt-2 text-xs text-neutral-500">
            Dinheiro que entrou no período, pela data do pagamento — não é
            faturamento do período.
          </p>
        </div>
      </div>

      {/* ---------- EM ABERTO ---------- */}
      <section
        data-tour="lista-em-aberto"
        className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
      >
        <h2 className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900">
          Pagamentos em aberto
        </h2>
        {linhas.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">Nenhuma conta em aberto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-xs font-semibold text-neutral-700">
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Pedido</th>
                  <th className="px-4 py-3 text-left">Venda</th>
                  <th className="px-4 py-3 text-left">Forma</th>
                  <th className="px-4 py-3 text-left">Situação</th>
                  <th className="px-4 py-3 text-right">Original</th>
                  <th className="px-4 py-3 text-right">Pago</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Dias</th>
                  <th className="px-4 py-3 text-left">Aberto por</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.orderId} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                      {l.cliente}
                      {l.observacao && (
                        <span className="block text-xs text-neutral-500">{l.observacao}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to="/admin/pedidos/$orderId"
                        params={{ orderId: l.orderId }}
                        className="font-medium text-[#E11D2E] hover:underline"
                      >
                        #{l.numero}
                      </Link>
                    </td>
                    {/* A data da VENDA, que não se move quando o pagamento chega. */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-neutral-600">
                      {dia.format(new Date(l.dataDaVenda))}
                    </td>
                    {/* A forma combinada na VENDA. A do recebimento só existe
                        quando o dinheiro entra, e vive no OrderPayment. */}
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {METODOS.find((m) => m.valor === l.formaDePagamento)?.rotulo ??
                        l.formaDePagamento}
                    </td>
                    {/* Contexto: dívida de pedido em preparo se cobra diferente
                        de dívida de pedido já entregue. */}
                    <td className="px-4 py-3 text-sm">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        {STATUS_OPERACIONAL[l.statusOperacional] ?? l.statusOperacional}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-neutral-600">
                      {currency.format(l.valorOriginal)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-emerald-700">
                      {l.valorPago > 0 ? currency.format(l.valorPago) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-amber-800">
                      {currency.format(l.saldo)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-neutral-600">
                      {l.diasEmAberto}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{l.abertoPor ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {/*
                        `data-tour` em TODAS as linhas, e o tutorial pega a
                        primeira. É o alvo que pode não existir: sem conta em
                        aberto não há linha, e por isso aquele passo é opcional
                        no catálogo.
                      */}
                      <button
                        type="button"
                        data-tour="botao-receber"
                        onClick={() => {
                          setRecebendo(l.orderId);
                          setValor(String(l.saldo.toFixed(2)));
                          setErro(null);
                        }}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:border-emerald-500"
                      >
                        Receber
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- MODAL DE RECEBIMENTO ---------- */}
      {alvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
              <HandCoins className="size-5 text-emerald-600" />
              Receber pagamento
            </h3>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Cliente</dt>
                <dd className="font-medium">{alvo.cliente}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Pedido</dt>
                <dd className="font-medium">#{alvo.numero}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Venda em</dt>
                <dd className="tabular-nums">{dia.format(new Date(alvo.dataDaVenda))}</dd>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2">
                <dt className="text-neutral-500">Saldo em aberto</dt>
                <dd className="font-bold tabular-nums text-amber-800">
                  {currency.format(alvo.saldo)}
                </dd>
              </div>
            </dl>

            <label className="mt-4 block text-sm font-medium text-neutral-700">
              Valor recebido
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={alvo.saldo}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-base tabular-nums"
              />
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              Pode receber menos que o saldo — o restante continua em aberto.
            </p>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-neutral-700">Método</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {METODOS.map((m) => (
                  <label
                    key={m.valor}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      metodo === m.valor
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="metodo"
                      value={m.valor}
                      checked={metodo === m.valor}
                      onChange={() => setMetodo(m.valor)}
                      className="accent-emerald-600"
                    />
                    {m.rotulo}
                  </label>
                ))}
              </div>
            </fieldset>

            <p className="mt-4 flex items-start gap-2 text-xs text-neutral-500">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              O recebimento entra na data de hoje. A venda continua sendo de{" "}
              {dia.format(new Date(alvo.dataDaVenda))}.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setRecebendo(null);
                  setErro(null);
                }}
                className="rounded-xl border-2 border-neutral-300 py-2.5 font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={receber.isPending}
                onClick={() =>
                  receber.mutate({
                    orderId: alvo.orderId,
                    amount: Number(valor),
                    method: metodo,
                  })
                }
                className="rounded-xl bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Confirmar recebimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- RECEBIDOS ---------- */}
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900">
          Recebimentos do período
        </h2>
        {(recebidos?.linhas ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">
            Nenhum recebimento no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-xs font-semibold text-neutral-700">
                  <th className="px-4 py-3 text-left">Recebido em</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Pedido</th>
                  <th className="px-4 py-3 text-left">Venda em</th>
                  <th className="px-4 py-3 text-left">Método</th>
                  <th className="px-4 py-3 text-left">Recebido por</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(recebidos?.linhas ?? []).map((r: any) => (
                  <tr key={r.pagamentoId} className="border-b border-neutral-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-neutral-900">
                      {diaHora.format(new Date(r.recebidoEm))}
                    </td>
                    <td className="px-4 py-3 text-sm">{r.cliente}</td>
                    <td className="px-4 py-3 text-sm">#{r.numero}</td>
                    {/* As duas datas lado a lado: é o ponto inteiro da feature. */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-neutral-500">
                      {dia.format(new Date(r.dataDaVenda))}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {METODOS.find((m) => m.valor === r.metodo)?.rotulo ?? r.metodo}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{r.recebidoPor ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-emerald-700">
                      {currency.format(r.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
