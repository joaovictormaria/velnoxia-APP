import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Banknote, CreditCard, Loader2, QrCode, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listCustomersFn } from "@/server/functions/customers.fn";
import { cn } from "@/lib/utils";

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type FormaDePagamento = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH";

/** O rótulo e o ícone de cada forma. Só as que o sistema já tem. */
const FORMAS: Record<FormaDePagamento, { label: string; icone: typeof Wallet }> = {
  CASH: { label: "Dinheiro", icone: Banknote },
  PIX: { label: "PIX", icone: QrCode },
  CREDIT_CARD: { label: "Crédito", icone: CreditCard },
  DEBIT_CARD: { label: "Débito", icone: Wallet },
};

export type DadosDaFinalizacao = {
  customerName: string;
  customerPhone?: string;
  paymentMethod: FormaDePagamento;
  fiado: boolean;
  customerNote?: string;
};

/**
 * A ÚLTIMA TELA: quem é o cliente e como ele paga.
 *
 * A BUSCA DE CLIENTE REUSA `listCustomersFn`, a mesma da aba Clientes. Não há
 * segundo cadastro nem segunda consulta: escolher alguém da lista só preenche
 * nome e telefone, e é o telefone que faz o checkout reencontrar a ficha
 * existente em vez de criar outra.
 *
 * "PAGAR DEPOIS" NÃO É UMA FORMA DE PAGAMENTO — é uma caixa à parte, porque no
 * sistema também são duas coisas separadas: a forma é COMO o cliente paga, o
 * fiado é SE ele já pagou. Quem marca a caixa ainda diz como pretende pagar, e
 * é essa forma que aparece na cobrança depois.
 */
export function FinalizarPedido({
  aberto,
  total,
  formasAceitas,
  enviando,
  erro,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  total: number | null;
  formasAceitas: string[];
  enviando: boolean;
  erro: string | null;
  onFechar: () => void;
  onConfirmar: (dados: DadosDaFinalizacao) => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [busca, setBusca] = useState("");
  const [forma, setForma] = useState<FormaDePagamento | null>(null);
  const [fiado, setFiado] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);

  const disponiveis = formasAceitas.filter(
    (f): f is FormaDePagamento => f in FORMAS,
  );

  useEffect(() => {
    if (!aberto) return;
    setNome("");
    setTelefone("");
    setBusca("");
    setForma(disponiveis[0] ?? null);
    setFiado(false);
    setObservacao("");
    setTentouEnviar(false);
    // `disponiveis` é derivado das props e recriado a cada render; usar a lista
    // como dependência reabriria o formulário em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  /**
   * A busca só sai do lugar com dois caracteres. Com um, a consulta devolve
   * quase a lista inteira e o atendente lê 200 nomes para achar um.
   */
  const { data: clientes, isFetching } = useQuery({
    queryKey: ["balcao-clientes", busca],
    queryFn: () => listCustomersFn({ data: { search: busca } }),
    enabled: aberto && busca.trim().length >= 2,
  });

  const nomeVazio = nome.trim().length === 0;

  function confirmar() {
    setTentouEnviar(true);
    if (nomeVazio || !forma || enviando) return;
    onConfirmar({
      customerName: nome.trim(),
      customerPhone: telefone.replace(/\D/g, "") || undefined,
      paymentMethod: forma,
      fiado,
      customerNote: observacao.trim() || undefined,
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="admin-theme flex max-h-[90vh] flex-col gap-0 overflow-hidden border-neutral-200 bg-white p-0 text-neutral-900 sm:max-w-md">
        <DialogHeader className="border-b border-neutral-200 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-bold text-neutral-900">
            Finalizar pedido
          </DialogTitle>
          <DialogDescription className="text-sm text-neutral-500">
            {total === null ? "Conferindo o total..." : `Total ${dinheiro(total)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <label
              htmlFor="balcao-cliente-busca"
              className="text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              Cliente já cadastrado
            </label>
            <input
              id="balcao-cliente-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone (opcional)"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base text-neutral-900 md:text-sm"
            />
            {busca.trim().length >= 2 && (
              <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-neutral-200">
                {isFetching ? (
                  <p className="px-3 py-2 text-xs text-neutral-400">Procurando...</p>
                ) : !clientes?.length ? (
                  <p className="px-3 py-2 text-xs text-neutral-400">
                    Ninguém encontrado. Digite o nome abaixo para criar na hora.
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {clientes.slice(0, 8).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setNome(c.name);
                            setTelefone(c.phone);
                            setBusca("");
                          }}
                          className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-50"
                        >
                          <span className="truncate text-sm text-neutral-800">{c.name}</span>
                          <span className="shrink-0 text-xs text-neutral-400">{c.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="balcao-nome"
                className="text-xs font-semibold uppercase tracking-wide text-neutral-500"
              >
                Nome *
              </label>
              <input
                id="balcao-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Quem vai retirar"
                className={cn(
                  "mt-2 w-full rounded-xl border px-3 py-2.5 text-base text-neutral-900 md:text-sm",
                  tentouEnviar && nomeVazio ? "border-[#E11D2E]" : "border-neutral-300",
                )}
              />
              {tentouEnviar && nomeVazio && (
                <p className="mt-1 text-xs font-medium text-[#E11D2E]">
                  Informe o nome do cliente.
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="balcao-telefone"
                className="text-xs font-semibold uppercase tracking-wide text-neutral-500"
              >
                Telefone
              </label>
              <input
                id="balcao-telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                inputMode="tel"
                placeholder="Opcional"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base text-neutral-900 md:text-sm"
              />
              <p className="mt-1 text-[11px] text-neutral-400">
                Com telefone, o pedido entra na ficha do cliente.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Forma de pagamento
            </h3>
            {disponiveis.length === 0 ? (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                A loja não tem nenhuma forma de pagamento marcada em Configurações.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {disponiveis.map((f) => {
                  const Icone = FORMAS[f].icone;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setForma(f)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                        forma === f
                          ? "border-[#E11D2E] bg-[#E11D2E]/5 font-semibold"
                          : "border-neutral-300 text-neutral-700 hover:border-neutral-400",
                      )}
                    >
                      <Icone className="size-4 shrink-0" />
                      {FORMAS[f].label}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setFiado((f) => !f)}
              aria-pressed={fiado}
              className={cn(
                "mt-2 flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                fiado
                  ? "border-amber-400 bg-amber-50"
                  : "border-neutral-300 hover:border-neutral-400",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                  fiado ? "border-amber-500 bg-amber-500" : "border-neutral-300",
                )}
              >
                {fiado && <span className="size-2 rounded-[2px] bg-white" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-neutral-900">
                  Fiado / pagar depois
                </span>
                <span className="block text-xs text-neutral-500">
                  O pedido vai para a fila normalmente e a cobrança fica em aberto na
                  tela de pagamentos.
                </span>
              </span>
            </button>
          </section>

          <section>
            <label
              htmlFor="balcao-obs-pedido"
              className="text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              Observação do pedido
            </label>
            <input
              id="balcao-obs-pedido"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              maxLength={500}
              placeholder="Opcional"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base text-neutral-900 md:text-sm"
            />
          </section>
        </div>

        <div className="border-t border-neutral-200 px-6 py-4">
          {erro && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-[#E11D2E]">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={enviando}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={confirmar}
              /*
               * O BOTÃO SE DESLIGA ENQUANTO A REQUISIÇÃO CORRE.
               *
               * É a trava contra o clique duplo, e ela é necessária: criar
               * pedido não tem chave de idempotência: dois envios viram dois
               * pedidos, com duas reservas de estoque.
               */
              disabled={enviando || disponiveis.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando && <Loader2 className="size-4 animate-spin" />}
              {enviando
                ? "Registrando..."
                : fiado
                  ? "Registrar pedido fiado"
                  : "Confirmar pedido"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
