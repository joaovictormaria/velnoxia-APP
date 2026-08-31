import { Loader2, Minus, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import type { ItemDoBalcao } from "@/lib/balcao/carrinho";
import { totalDeItens } from "@/lib/balcao/carrinho";

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Uma linha já precificada PELO SERVIDOR, na mesma ordem dos itens. */
export type LinhaPrecificada = {
  unitPrice: number;
  quantity: number;
  extras: { nome: string; grupo: string | null; preco: number }[];
  extrasTotal: number;
};

/**
 * O PEDIDO ATUAL, sempre visível ao lado do cardápio.
 *
 * NENHUM NÚMERO DAQUI É CALCULADO NO NAVEGADOR. Preço unitário, adicionais e
 * subtotal vêm de `precificarBalcaoFn`, que chama a mesma `precificarItens` do
 * checkout. Enquanto a resposta não chega, os valores ficam em traço em vez de
 * mostrar uma estimativa que pode não ser o que será cobrado.
 */
export function PainelDoPedido({
  itens,
  linhas,
  subtotal,
  carregando,
  erro,
  onAlterarQuantidade,
  onRemover,
  onEditar,
  onFinalizar,
}: {
  itens: ItemDoBalcao[];
  linhas: LinhaPrecificada[] | null;
  subtotal: number | null;
  carregando: boolean;
  erro: string | null;
  onAlterarQuantidade: (uid: string, delta: number) => void;
  onRemover: (uid: string) => void;
  onEditar: (item: ItemDoBalcao) => void;
  onFinalizar: () => void;
}) {
  const quantidade = totalDeItens(itens);

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <ShoppingCart className="size-4 text-neutral-500" />
        <h2 className="text-sm font-semibold text-neutral-900">Pedido atual</h2>
        {quantidade > 0 && (
          <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
            {quantidade} {quantidade === 1 ? "item" : "itens"}
          </span>
        )}
      </header>

      {itens.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-neutral-400">
          Clique num produto para começar o pedido.
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto">
          {itens.map((item, i) => {
            const linha = linhas?.[i] ?? null;
            const unitario = linha ? linha.unitPrice + linha.extrasTotal : null;
            return (
              <li key={item.uid} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-bold text-neutral-700">
                    {item.quantity}x
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {item.nome}
                      {item.sizeLabel && (
                        <span className="text-neutral-500"> · {item.sizeLabel}</span>
                      )}
                    </p>
                    {linha && linha.extras.length > 0 && (
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {linha.extras
                          .map((e) => (e.preco > 0 ? `${e.nome} (+${dinheiro(e.preco)})` : e.nome))
                          .join(" · ")}
                      </p>
                    )}
                    {item.note && (
                      <p className="mt-0.5 text-xs italic text-neutral-500">“{item.note}”</p>
                    )}
                    <p className="mt-1 text-xs text-neutral-400">
                      {unitario === null ? "—" : `${dinheiro(unitario)} cada`}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-neutral-900">
                    {unitario === null ? "—" : dinheiro(unitario * item.quantity)}
                  </p>
                </div>

                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Diminuir ${item.nome}`}
                    onClick={() => onAlterarQuantidade(item.uid, -1)}
                    className="rounded-lg border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-50"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Aumentar ${item.nome}`}
                    onClick={() => onAlterarQuantidade(item.uid, 1)}
                    className="rounded-lg border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-50"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Editar ${item.nome}`}
                    onClick={() => onEditar(item)}
                    className="rounded-lg border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-50"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${item.nome}`}
                    onClick={() => onRemover(item.uid)}
                    className="ml-auto rounded-lg border border-neutral-200 p-1.5 text-neutral-500 hover:bg-red-50 hover:text-[#E11D2E]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="border-t border-neutral-200 px-4 py-3">
        {erro && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-[#E11D2E]">
            {erro}
          </p>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-500">Total</span>
          <span className="flex items-center gap-2 text-xl font-bold text-neutral-900">
            {carregando && <Loader2 className="size-4 animate-spin text-neutral-400" />}
            {subtotal === null ? "—" : dinheiro(subtotal)}
          </span>
        </div>
        <button
          type="button"
          onClick={onFinalizar}
          disabled={itens.length === 0 || Boolean(erro)}
          className="mt-3 w-full rounded-xl bg-[#E11D2E] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Finalizar pedido
        </button>
      </footer>
    </aside>
  );
}
