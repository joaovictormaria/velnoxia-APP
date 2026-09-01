import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { compararValores } from "@/lib/auditoria/diferenca";
import {
  filtrosDeAuditoriaFn,
  listarAuditoriaFn,
} from "@/server/functions/auditoria.fn";

/*
  MÓDULO PAGO — AUDITORIA.

  A tela responde a pergunta que nenhum relatório responde: QUEM mexeu nisto,
  QUANDO, e qual era o valor ANTES. Ela lê o `AuditLog` que o sistema já
  escreve para todas as lojas — a gravação nunca dependeu de plano, e continua
  não dependendo. O que é Premium é a leitura.

  As duas server functions já exigem AUDITORIA; a guarda de rota evita que
  digitar a URL renda um painel de erros em vez de um convite.
*/
export const Route = createFileRoute("/admin/auditoria/")(
  rotaPremium("AUDITORIA", AuditoriaPage),
);

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: null, rotulo: "Tudo" },
] as const;

/**
 * Os nomes que o código grava, em português.
 *
 * NÃO é uma lista de eventos possíveis — é uma tradução dos que existem. O que
 * não estiver aqui aparece cru, e é o comportamento certo: um evento novo tem
 * de aparecer na tela no dia em que passar a ser gravado, e não no dia em que
 * alguém lembrar de traduzi-lo.
 */
const ROTULO_DA_ACAO: Record<string, string> = {
  CREATE: "Criou",
  UPDATE: "Alterou",
  DELETE: "Excluiu",
  EXPORT: "Exportou",
  IMPORT: "Importou",
  REFUND: "Reembolsou",
  REVOKE: "Revogou",
  WEBHOOK: "Webhook",
  RESTOCK: "Entrada de estoque",
  CONSUME: "Baixa de estoque",
  ADJUST: "Ajuste de estoque",
  RELEASE_RESERVATION: "Liberou reserva",
  ABRIR_FIADO: "Abriu fiado",
  RECEBER_PAGAMENTO: "Recebeu pagamento",
  ESTORNAR_PAGAMENTO: "Estornou pagamento",
  LOGIN_SUCCESS: "Entrou",
  LOGIN_FAILED: "Falha no login",
  LOGIN_BLOCKED: "Login bloqueado",
  AUTHORIZE_DEVICE: "Autorizou dispositivo",
  REVOKE_DEVICE: "Revogou dispositivo",
  ROTATE_TOKEN: "Trocou o token",
  OCCUPY_TABLE: "Ocupou a mesa",
  RELEASE_TABLE: "Liberou a mesa",
  MARK_TABLE_CLEANED: "Marcou a mesa como limpa",
  CHANGE_TABLE_STATUS: "Mudou o estado da mesa",
  CALL_WAITER: "Chamou o garçom",
  LINK_ORDER_TABLE: "Vinculou o pedido à mesa",
};

const ROTULO_DO_REGISTRO: Record<string, string> = {
  Product: "Produto",
  Order: "Pedido",
  OrderPayment: "Pagamento",
  Employee: "Funcionário",
  Customer: "Cliente",
  Coupon: "Cupom",
  InventoryItem: "Item de estoque",
  Store: "Loja",
  Table: "Mesa",
  TableSession: "Sessão de mesa",
  Subscription: "Assinatura",
  APIKey: "Chave de API",
  WebhookSubscription: "Webhook",
};

const acao = (v: string) => ROTULO_DA_ACAO[v] ?? v;
const registroDe = (v: string) => ROTULO_DO_REGISTRO[v] ?? v;

/** A cor diz o peso do evento antes de a pessoa ler a linha. */
function corDaAcao(v: string): string {
  if (/DELETE|ESTORNAR|REVOKE|BLOCKED|FAILED/.test(v)) {
    return "bg-red-50 text-red-700 ring-red-200";
  }
  if (/CREATE|RESTOCK|RECEBER|SUCCESS|AUTHORIZE/.test(v)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  return "bg-neutral-100 text-neutral-700 ring-neutral-200";
}

type Evento = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  isSystem: boolean;
  action: string;
  resource: string;
  resourceId: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  status: string;
  errorMessage: string | null;
  ipAddress: string | null;
  createdAt: Date | string;
};

function AuditoriaPage() {
  const [dias, setDias] = useState<number | null>(30);
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroRegistro, setFiltroRegistro] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [pagina, setPagina] = useState(0);

  /*
   * Qualquer mexida no filtro volta para a primeira página. Sem isto, filtrar
   * estando na página 4 mostraria "nenhum evento" para um filtro que tem
   * resultado — só não tem cem.
   */
  function trocar<T>(set: (v: T) => void) {
    return (valor: T) => {
      set(valor);
      setPagina(0);
    };
  }

  const { data: opcoes } = useQuery({
    queryKey: ["auditoria", "filtros"],
    queryFn: async () => filtrosDeAuditoriaFn({ data: {} }),
    staleTime: 5 * 60_000,
  });

  const { data, isPending } = useQuery({
    queryKey: ["auditoria", dias, filtroAcao, filtroRegistro, filtroUsuario, pagina],
    queryFn: async () =>
      listarAuditoriaFn({
        data: {
          dias,
          acao: filtroAcao || undefined,
          recurso: filtroRegistro || undefined,
          usuarioId: filtroUsuario || undefined,
          pagina,
        },
      }),
  });

  const eventos = (data?.eventos ?? []) as Evento[];
  const temFiltro = Boolean(filtroAcao || filtroRegistro || filtroUsuario) || dias !== 30;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-neutral-900">
            <ShieldCheck className="size-5 text-white" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Auditoria</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Quem mudou o quê, quando, e o valor antes e depois
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.rotulo}
              type="button"
              onClick={() => trocar(setDias)(p.dias)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                dias === p.dias
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </header>

      {/* ---------- FILTROS ---------- */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Seletor
            rotulo="Ação"
            valor={filtroAcao}
            aoTrocar={trocar(setFiltroAcao)}
            vazio="Todas as ações"
            opcoes={(opcoes?.actions ?? []).map((a) => ({ valor: a, rotulo: acao(a) }))}
          />
          <Seletor
            rotulo="Registro"
            valor={filtroRegistro}
            aoTrocar={trocar(setFiltroRegistro)}
            vazio="Todos os registros"
            opcoes={(opcoes?.resources ?? []).map((r) => ({
              valor: r,
              rotulo: registroDe(r),
            }))}
          />
          <Seletor
            rotulo="Quem fez"
            valor={filtroUsuario}
            aoTrocar={trocar(setFiltroUsuario)}
            vazio="Qualquer pessoa"
            opcoes={(opcoes?.users ?? []).map((u) => ({
              valor: u.userId,
              rotulo: u.userEmail ?? u.userId,
            }))}
          />
        </div>

        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setDias(30);
              setFiltroAcao("");
              setFiltroRegistro("");
              setFiltroUsuario("");
              setPagina(0);
            }}
            className="mt-3 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
          >
            Limpar filtros
          </button>
        )}
      </section>

      {/* ---------- LISTA ---------- */}
      {isPending ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Carregando…
        </p>
      ) : eventos.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-neutral-900">Nenhum evento no período</p>
          <p className="mt-1 text-sm text-neutral-500">
            {temFiltro
              ? "Tente ampliar o período ou limpar os filtros."
              : "As mudanças feitas no painel aparecem aqui assim que acontecem."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {eventos.map((e) => (
            <LinhaDoEvento key={e.id} evento={e} />
          ))}
        </ul>
      )}

      {/* ---------- PAGINAÇÃO ---------- */}
      {(pagina > 0 || data?.temMais) && (
        <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3">
          <button
            type="button"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Anterior
          </button>
          <span className="text-sm tabular-nums text-neutral-500">Página {pagina + 1}</span>
          <button
            type="button"
            disabled={!data?.temMais}
            onClick={() => setPagina((p) => p + 1)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function Seletor({
  rotulo,
  valor,
  aoTrocar,
  vazio,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  aoTrocar: (v: string) => void;
  vazio: string;
  opcoes: { valor: string; rotulo: string }[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {rotulo}
      </span>
      <select
        value={valor}
        onChange={(ev) => aoTrocar(ev.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
      >
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

function LinhaDoEvento({ evento }: { evento: Evento }) {
  const [aberto, setAberto] = useState(false);
  const mudancas = compararValores(evento.oldValue, evento.newValue);
  const falhou = evento.status === "FAILED";

  return (
    <li
      className={`rounded-2xl border bg-white ${
        falhou ? "border-red-200" : "border-neutral-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${corDaAcao(
                evento.action,
              )}`}
            >
              {acao(evento.action)}
            </span>
            <span className="text-sm font-medium text-neutral-900">
              {registroDe(evento.resource)}
            </span>
            <span className="max-w-[16rem] truncate font-mono text-xs text-neutral-400">
              {evento.resourceId}
            </span>
          </div>

          {/*
            "Sistema" é uma resposta, e "—" não é: um evento de webhook não tem
            pessoa, e dizer isso é diferente de não saber quem foi.
          */}
          <p className="mt-1.5 text-sm text-neutral-600">
            {evento.isSystem
              ? "Sistema"
              : (evento.userEmail ?? evento.userId ?? "Autor não registrado")}
            {evento.ipAddress && (
              <span className="text-neutral-400"> · IP {evento.ipAddress}</span>
            )}
          </p>

          {evento.reason && (
            <p className="mt-1 text-sm text-neutral-500">{evento.reason}</p>
          )}

          {falhou && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              A operação falhou
              {evento.errorMessage ? `: ${evento.errorMessage}` : "."}
            </p>
          )}
        </div>

        <time className="shrink-0 text-xs tabular-nums text-neutral-500">
          {quando.format(new Date(evento.createdAt))}
        </time>
      </div>

      {mudancas.length > 0 && (
        <div className="border-t border-neutral-100">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            <ChevronDown
              className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            {aberto ? "Esconder" : "Ver"} o que mudou
            <span className="text-neutral-400">({mudancas.length})</span>
          </button>

          {aberto && (
            <div className="overflow-x-auto border-t border-neutral-100">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-neutral-500">
                    <th className="px-4 py-2 text-left">Campo</th>
                    <th className="px-4 py-2 text-left">Antes</th>
                    <th className="px-4 py-2 text-left">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {mudancas.map((m) => (
                    <tr key={m.campo} className="border-t border-neutral-100 align-top">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">
                        {m.campo}
                      </td>
                      <td className="px-4 py-2 text-neutral-500 line-through decoration-neutral-300">
                        {m.antes}
                      </td>
                      <td className="px-4 py-2 font-medium text-neutral-900">{m.depois}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
