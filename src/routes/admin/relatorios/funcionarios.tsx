import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { employeeReportFn, settlePayrollFn } from "@/server/functions/reports.fn";

export const Route = createFileRoute("/admin/relatorios/funcionarios")({
  component: EmployeeReportPage,
});

type Days = 1 | 7 | 30 | 90;
const PERIODOS: { days: Days; label: string }[] = [
  { days: 1, label: "Hoje" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function EmployeeReportPage() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<Days>(30);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["report-employees", days],
    queryFn: () => employeeReportFn({ data: { days } }),
  });

  const quitar = useMutation({
    mutationFn: (employeeId: string) => settlePayrollFn({ data: { employeeId } }),
    onSuccess: async () => {
      setConfirmando(null);
      await queryClient.invalidateQueries({ queryKey: ["report-employees"] });
    },
  });

  const linhas = data ?? [];
  const totalDesconto = linhas.reduce((s, l) => s + l.desconto, 0);
  const totalPago = linhas.reduce((s, l) => s + l.pago, 0);
  const totalFolha = linhas.reduce((s, l) => s + l.emFolha, 0);

  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/admin/relatorios"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="size-4" /> Voltar para os relatórios
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Relatórios — Funcionários</h1>
        <p className="mt-1 text-sm text-neutral-500">
          O que cada um pegou no período e quanto isso custou à casa. O valor pago já está no
          faturamento; o desconto é o que a loja bancou.
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Numero rotulo="Desconto concedido" valor={money(totalDesconto)} destaque />
        <Numero rotulo="Pago pelos funcionários" valor={money(totalPago)} />
        <Numero rotulo="A descontar em folha" valor={money(totalFolha)} />
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        {isPending ? (
          <p className="text-sm text-neutral-500">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nenhum pedido de funcionário neste período.{" "}
            <Link to="/admin/funcionarios" className="font-medium underline">
              Ver o cadastro
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="pb-2 pr-3 font-medium">Funcionário</th>
                  <th className="pb-2 pr-3 text-right font-medium">Pedidos</th>
                  <th className="pb-2 pr-3 text-right font-medium">Itens na cota</th>
                  <th className="pb-2 pr-3 text-right font-medium">Desconto</th>
                  <th className="pb-2 pr-3 text-right font-medium">Pago</th>
                  <th className="pb-2 pr-3 text-right font-medium">Em folha</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {linhas.map((l) => (
                  <tr key={l.employeeId ?? l.nome}>
                    <td className="py-3 pr-3">
                      <span className="font-medium text-neutral-900">{l.nome}</span>
                      {/* A ficha pode ter sido apagada; o pedido guarda o nome
                          desde a compra, então a linha continua existindo. */}
                      {!l.cadastrado && (
                        <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                          fora do cadastro
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right text-neutral-600">{l.pedidos}</td>
                    <td className="py-3 pr-3 text-right text-neutral-600">{l.itens}</td>
                    <td className="py-3 pr-3 text-right font-medium text-emerald-700">
                      {money(l.desconto)}
                    </td>
                    <td className="py-3 pr-3 text-right text-neutral-900">{money(l.pago)}</td>
                    <td className="py-3 pr-3 text-right text-amber-700">
                      {l.emFolha > 0 ? money(l.emFolha) : "—"}
                    </td>
                    <td className="py-3 text-right">
                      {l.emFolha > 0 &&
                        l.employeeId &&
                        (confirmando === l.employeeId ? (
                          <span className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={quitar.isPending}
                              onClick={() => quitar.mutate(l.employeeId!)}
                              className="rounded-lg bg-[#E11D2E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmando(null)}
                              className="text-xs text-neutral-500 hover:text-neutral-800"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmando(l.employeeId)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                          >
                            Quitar {l.pedidosEmFolha}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          "Quitar" marca como pagos os pedidos que estavam para descontar em folha — use depois de
          acertar o mês com a pessoa. Cancelados não entram em nenhuma coluna.
        </p>
      </section>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-sm text-neutral-500">{rotulo}</p>
      <p
        className={
          "mt-1 text-2xl font-bold " + (destaque ? "text-[#E11D2E]" : "text-neutral-900")
        }
      >
        {valor}
      </p>
    </div>
  );
}
