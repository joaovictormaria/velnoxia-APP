import { createFileRoute, Link } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { consumoDeFuncionariosFn } from "@/server/functions/employees.fn";

/*
  MÓDULO PAGO — FUNCIONARIOS.

  FUNCIONARIOS, e não FINANCEIRO: a tela mora sob `/relatorios`, mas o que ela
  entrega é o consumo da equipe. A pasta não classifica o módulo.

  As server functions desta tela já exigem o recurso; a guarda de rota evita
  que digitar a URL renda um painel de erros.
*/
export const Route = createFileRoute("/admin/relatorios/funcionarios")(
  rotaPremium("FUNCIONARIOS", EmployeeReportPage),
);

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Linha = {
  employeeId: string;
  nome: string;
  cargo: string | null;
  ativo: boolean;
  desligado: boolean;
  pedidos: number;
  beneficioConcedido: number;
  aDescontarEmFolha: number;
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function EmployeeReportPage() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1); // 1–12

  const { data, isPending } = useQuery({
    queryKey: ["consumoFuncionarios", ano, mes],
    queryFn: async () => {
      const r = await consumoDeFuncionariosFn({ data: { ano, mes } });
      return (r as unknown as Linha[]) ?? [];
    },
  });

  const linhas = data ?? [];
  const totalBeneficio = linhas.reduce((s, l) => s + l.beneficioConcedido, 0);
  const totalFolha = linhas.reduce((s, l) => s + l.aDescontarEmFolha, 0);

  function mover(passo: number) {
    const d = new Date(ano, mes - 1 + passo, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth() + 1);
  }

  // Não deixa navegar para o futuro: não há folha a fechar em mês que não veio.
  const noMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;

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
          Consumo do mês, para o fechamento da folha.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <button
          onClick={() => mover(-1)}
          className="rounded-lg border border-neutral-200 bg-white p-2.5 text-neutral-700 hover:border-neutral-300"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-44 text-center text-sm font-semibold text-neutral-900">
          {MESES[mes - 1]} de {ano}
        </span>
        <button
          onClick={() => mover(1)}
          disabled={noMesAtual}
          className="rounded-lg border border-neutral-200 bg-white p-2.5 text-neutral-700 hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/*
        O AVISO VEM ANTES DOS NÚMEROS, E NÃO É DECORAÇÃO.

        Nada no banco registra "já descontei este pedido no salário". O sistema
        calcula o VALOR A DESCONTAR no mês pedido; ele não sabe, e não afirma,
        que o desconto aconteceu. Sem esta frase a tela pareceria um controle de
        folha que ela não é — e alguém deixaria de descontar achando que o
        sistema já tinha resolvido.
      */}
      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <p className="text-sm text-amber-900">
          Este relatório calcula o <strong>valor a descontar</strong> no mês selecionado.
          Ele não registra descontos já aplicados na folha — o sistema não controla o
          que o setor de pagamento efetivamente lançou.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">A descontar em folha</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">
            {isPending ? "—" : currency.format(totalFolha)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            pedidos pagos com desconto em folha, ainda em aberto
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Benefício concedido</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">
            {isPending ? "—" : currency.format(totalBeneficio)}
          </p>
          {/*
            A distinção que a tela existe para deixar clara: benefício é receita
            de que a loja abriu mão — já está dentro do total do pedido. Não se
            desconta de salário, e somá-lo à folha cobraria do funcionário
            aquilo que lhe foi dado.
          */}
          <p className="mt-1 text-xs text-neutral-500">
            desconto dado pela loja — <strong>não</strong> é descontado do salário
          </p>
        </div>
      </div>

      {isPending ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Carregando…
        </div>
      ) : linhas.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-neutral-900">
            Nenhum funcionário com movimentação em {MESES[mes - 1]}.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Só aparecem aqui os funcionários com pedidos concluídos no mês. Quem não
            pediu nada não vira linha no fechamento.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">
                  Funcionário
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                  Pedidos
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                  Benefício concedido
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                  A descontar em folha
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                  Total relacionado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {linhas.map((l) => (
                <tr key={l.employeeId} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-neutral-900">{l.nome}</span>
                    {l.cargo && (
                      <span className="ml-2 text-xs text-neutral-500">{l.cargo}</span>
                    )}
                    {/*
                      Quem saiu continua no fechamento: o desligamento não apaga
                      a dívida do mês em que a pessoa ainda trabalhava.
                    */}
                    {l.desligado ? (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                        desligado
                      </span>
                    ) : !l.ativo ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                        desativado
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {l.pedidos}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {currency.format(l.beneficioConcedido)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                    {currency.format(l.aDescontarEmFolha)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {currency.format(l.beneficioConcedido + l.aDescontarEmFolha)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50">
              <tr>
                <td className="px-4 py-3 text-sm font-semibold text-neutral-900" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-700">
                  {currency.format(totalBeneficio)}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-neutral-900">
                  {currency.format(totalFolha)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-700">
                  {currency.format(totalBeneficio + totalFolha)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        A coluna <strong>Total relacionado</strong> soma duas naturezas diferentes — o que
        a loja deu e o que tem a receber — e serve para dimensionar o funcionário, não
        para lançar na folha. O valor a lançar é o da coluna{" "}
        <strong>A descontar em folha</strong>.
      </p>
    </div>
  );
}
