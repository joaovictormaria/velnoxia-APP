import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  BarChart3,
  Coins,
  History,
  LineChart,
  Lock,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { bloqueioDaRotaNoPlano } from "@/components/admin/planos/cadeado-do-menu";
import { ROTULO_DO_RECURSO } from "@/lib/planos/catalogo";
import { recursoDaRota } from "@/lib/planos/navegacao";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import { moeda } from "@/lib/formato";
import { getFinancialKPIs } from "@/server/functions/inventory-costs.fn";

/*
  MÓDULO PAGO — RELATORIOS.

  A tela é a porta dos cinco relatórios, e agora também responde sozinha à
  pergunta que fazia a pessoa abrir um deles: como foi o período. Os números
  ficam aqui; o detalhe continua em cada relatório.

  É o ÚNICO caso de `RELATORIOS` puro entre as rotas deste diretório: as
  outras pertencem a FINANCEIRO, FIADO ou FUNCIONARIOS, cada uma pelo que
  entrega e não pela pasta em que mora.
*/
export const Route = createFileRoute("/admin/relatorios/")(
  rotaPremium("RELATORIOS", ReportsPage),
);

/*
  OS CINCO RELATÓRIOS — e o recurso de cada um vem do mapa central.

  Nenhuma lista de permissão aqui: `recursoDaRota` é a mesma fonte que a barra
  lateral e a guarda de rota consultam. Se um relatório mudar de plano no
  catálogo, o cadeado deste card acende sozinho.

  A descrição diz o que a tela ENTREGA. "Relatório de Produtos" não conta a
  ninguém que ali se vê margem por item — e era por isso que a pessoa abria
  cinco telas para achar uma.
*/
const RELATORIOS: Array<{
  to: string;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
}> = [
  {
    to: "/admin/relatorios/receita",
    titulo: "Receita",
    descricao: "Faturamento por período, forma de pagamento e canal de venda.",
    icone: Coins,
  },
  {
    to: "/admin/relatorios/dashboard-kpi",
    titulo: "Indicadores",
    descricao: "Lucro, margem, ticket médio e a cobertura da apuração.",
    icone: LineChart,
  },
  {
    to: "/admin/relatorios/historico",
    titulo: "Histórico de transações",
    descricao: "Cada entrada e saída de dinheiro, na ordem em que aconteceu.",
    icone: History,
  },
  {
    to: "/admin/relatorios/produtos",
    titulo: "Produtos",
    descricao: "Quanto cada item vende, quanto custa e o que sobra dele.",
    icone: BarChart3,
  },
  {
    to: "/admin/relatorios/funcionarios",
    titulo: "Funcionários",
    descricao: "O consumo da equipe no mês, por pessoa e por benefício.",
    icone: BadgePercent,
  },
];

const PERIODOS = [7, 30, 90] as const;

function ReportsPage() {
  const { admin } = Route.useRouteContext();
  const [dias, setDias] = useState<number>(30);

  /*
    O RESUMO É FINANCEIRO; A TELA É RELATORIOS.

    Hoje os dois andam juntos no Premium, e quem abre esta página tem os dois.
    Mas a pergunta é feita mesmo assim: no dia em que os planos separarem os
    módulos, a consulta nem sai — em vez de disparar uma requisição que o
    servidor recusaria e deixar a tela com um erro no lugar dos números.
  */
  const temFinanceiro =
    !admin?.store.plano ||
    recursoNoEstado(admin.store.plano, "FINANCEIRO") !== "BLOQUEADO";

  const { data, isPending } = useQuery({
    queryKey: ["relatorios", "visao-geral", dias],
    queryFn: () => getFinancialKPIs({ data: { days: dias } }),
    enabled: temFinanceiro,
    staleTime: 60_000,
  });

  const kpi = data as Kpis | undefined;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-neutral-900">Relatórios</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Como foi o período, e onde olhar de perto.
        </p>
      </header>

      {/* ─────────────────────── A VISÃO GERAL ─────────────────────── */}
      {temFinanceiro && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Visão geral
            </h2>
            <div className="flex gap-2">
              {PERIODOS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDias(d)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${
                    dias === d
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {d} dias
                </button>
              ))}
            </div>
          </div>

          {/*
            OS QUATRO NÚMEROS QUE RESPONDEM "COMO FOI O PERÍODO".

            Faturamento e pedidos são o volume; lucro e ticket médio são a
            qualidade dele. Um faturamento alto com margem baixa e um baixo com
            margem alta são negócios diferentes, e nenhum dos dois se enxerga
            com um número só.
          */}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Cartao
              titulo="Faturamento"
              valor={moeda(kpi?.totalSalesValue ?? 0)}
              detalhe={`${kpi?.totalOrders ?? 0} pedido(s) no período`}
              icone={Wallet}
              carregando={isPending}
            />
            <Cartao
              titulo="Lucro"
              valor={moeda(kpi?.totalProfit ?? 0)}
              detalhe={
                kpi?.margemApurada == null
                  ? "Margem ainda não apurada"
                  : `Margem de ${kpi.margemApurada.toFixed(1)}%`
              }
              icone={TrendingUp}
              destaque
              carregando={isPending}
            />
            <Cartao
              titulo="Ticket médio"
              valor={moeda(kpi?.averageOrderValue ?? 0)}
              detalhe="Por pedido, no período"
              icone={Receipt}
              carregando={isPending}
            />
            <Cartao
              titulo="Custo das vendas"
              valor={moeda(kpi?.totalCost ?? 0)}
              detalhe={
                (kpi?.perdas ?? 0) > 0
                  ? `Mais ${moeda(kpi?.perdas)} em perdas`
                  : "Sem perdas registradas"
              }
              icone={Coins}
              carregando={isPending}
            />
          </div>

          {/*
            A RESSALVA QUE IMPEDE A LEITURA ERRADA.

            O lucro só mede o que tem custo conhecido. Sem esta linha, uma loja
            com metade do cardápio sem ficha técnica leria a margem como se
            fosse do faturamento inteiro — e decidiria preço com ela.

            Só aparece quando há o que ressalvar: cobertura cheia não precisa
            de rodapé.
          */}
          {!isPending && kpi && kpi.cobertura != null && kpi.cobertura < 100 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              O lucro e a margem cobrem {kpi.cobertura.toFixed(0)}% do que foi
              vendido — {moeda(kpi.receitaSemCusto)} saíram sem custo conhecido.
              Ver em{" "}
              <Link to="/admin/relatorios/dashboard-kpi" className="font-semibold underline">
                Indicadores
              </Link>
              .
            </p>
          )}
        </section>
      )}

      {/* ─────────────────────── OS RELATÓRIOS ─────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Relatórios completos
        </h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {RELATORIOS.map((r) => (
            <CartaoDeRelatorio
              key={r.to}
              {...r}
              bloqueado={bloqueioDaRotaNoPlano(admin?.store.plano, r.to)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  PEÇAS
 * ═══════════════════════════════════════════════════════════════════════════ */

/** O recorte dos KPIs que esta tela usa. O resto continua no relatório. */
type Kpis = {
  totalSalesValue: number;
  totalCost: number;
  totalProfit: number;
  averageOrderValue: number;
  totalOrders: number;
  margemApurada: number | null;
  cobertura: number | null;
  receitaSemCusto: number;
  perdas: number;
};

function Cartao({
  titulo,
  valor,
  detalhe,
  icone: Icone,
  destaque = false,
  carregando,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  icone: LucideIcon;
  destaque?: boolean;
  carregando: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        destaque ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${
            destaque ? "text-neutral-400" : "text-neutral-500"
          }`}
        >
          {titulo}
        </p>
        <Icone
          className={`size-4 shrink-0 ${destaque ? "text-neutral-400" : "text-neutral-400"}`}
          aria-hidden="true"
        />
      </div>

      {/*
        O esqueleto tem a MESMA altura do número. Sem isso os cards mudam de
        tamanho quando a consulta responde, e a página inteira pula.
      */}
      {carregando ? (
        <div
          className={`mt-2 h-9 w-32 animate-pulse rounded-lg ${
            destaque ? "bg-white/10" : "bg-neutral-100"
          }`}
        />
      ) : (
        <p
          className={`mt-2 font-display text-3xl font-bold tabular-nums ${
            destaque ? "text-white" : "text-neutral-900"
          }`}
        >
          {valor}
        </p>
      )}

      <p className={`mt-1.5 text-xs ${destaque ? "text-neutral-400" : "text-neutral-500"}`}>
        {carregando ? " " : detalhe}
      </p>
    </div>
  );
}

/*
  UM CARD DE RELATÓRIO — clicável quando o plano inclui, explicado quando não.

  O bloqueado não some: escondê-lo faria a loja nunca descobrir que o relatório
  existe, e é ele que dá motivo para assinar. Mesma escolha da barra lateral e
  das abas do estoque.
*/
function CartaoDeRelatorio({
  to,
  titulo,
  descricao,
  icone: Icone,
  bloqueado,
}: {
  to: string;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  bloqueado: ReturnType<typeof bloqueioDaRotaNoPlano>;
}) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-xl ${
            bloqueado ? "bg-neutral-100 text-neutral-400" : "bg-[#E11D2E]/10 text-[#E11D2E]"
          }`}
        >
          {bloqueado ? (
            <Lock className="size-4" aria-hidden="true" />
          ) : (
            <Icone className="size-4" aria-hidden="true" />
          )}
        </span>
        {!bloqueado && (
          <ArrowRight
            className="mt-1 size-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        )}
      </div>

      <p className="mt-3 text-sm font-bold text-neutral-900">{titulo}</p>
      <p className="mt-1 text-xs leading-snug text-neutral-500">
        {bloqueado
          ? `Disponível no Premium, com ${ROTULO_DO_RECURSO[bloqueado]}.`
          : descricao}
      </p>
    </>
  );

  if (bloqueado) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">{conteudo}</div>
    );
  }

  return (
    <Link
      to={to}
      className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 motion-reduce:transition-none"
    >
      {conteudo}
    </Link>
  );
}
