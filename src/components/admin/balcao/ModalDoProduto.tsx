import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  extrasDoProduto,
  faltaResponder,
  precoDoItem,
  type ItemDoBalcao,
} from "@/lib/balcao/carrinho";
import type { ExtraDoBalcao, ProdutoDoBalcao } from "@/server/functions/balcao.fn";
import { cn } from "@/lib/utils";

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A montagem de UM item.
 *
 * Simples quando o produto é simples: um produto sem tamanhos, sem perguntas e
 * sem adicionais mostra quantidade, observação e o botão. Nada de seções
 * vazias com títulos anunciando o que não existe.
 *
 * O botão de adicionar fica DESLIGADO enquanto faltar responder uma pergunta
 * obrigatória, com o motivo escrito ao lado. Quem decide isso é a mesma
 * `conferirOpcoes` do servidor — sem ela, o atendente montaria o carrinho
 * inteiro e só descobriria o problema na finalização.
 */
export function ModalDoProduto({
  produto,
  extras,
  edicao,
  aberto,
  onFechar,
  onConfirmar,
}: {
  produto: ProdutoDoBalcao | null;
  extras: ExtraDoBalcao[];
  /** A linha sendo editada, quando o modal foi aberto pelo carrinho. */
  edicao: ItemDoBalcao | null;
  aberto: boolean;
  onFechar: () => void;
  onConfirmar: (item: Omit<ItemDoBalcao, "uid">) => void;
}) {
  const [sizeId, setSizeId] = useState<string | undefined>(undefined);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  // Reabrir o modal recomeça do zero — ou do que a linha em edição já tinha.
  useEffect(() => {
    if (!aberto || !produto) return;
    setSizeId(edicao?.sizeId ?? produto.sizes[0]?.id);
    setOptionIds(edicao?.optionIds ?? []);
    setExtraIds(edicao?.extraIds ?? []);
    setQuantity(edicao?.quantity ?? 1);
    setNote(edicao?.note ?? "");
  }, [aberto, produto, edicao]);

  const extrasDisponiveis = useMemo(
    () => (produto ? extrasDoProduto(extras, produto) : []),
    [extras, produto],
  );

  if (!produto) return null;

  const impedimento = faltaResponder(produto.optionGroups, optionIds);
  const preco = precoDoItem(
    produto,
    { sizeId, optionIds, extraIds, quantity },
    extrasDisponiveis,
  );

  function alternarOpcao(grupoId: string, opcaoId: string) {
    const grupo = produto!.optionGroups.find((g) => g.id === grupoId)!;
    setOptionIds((atual) => {
      if (atual.includes(opcaoId)) return atual.filter((id) => id !== opcaoId);
      const doGrupo = grupo.options.filter((o) => atual.includes(o.id)).map((o) => o.id);
      // Escolha única troca em vez de recusar: quem clica na segunda opção de
      // um "escolha 1" quer aquela, não um aviso de que a primeira já está lá.
      if (grupo.maxChoices === 1) {
        return [...atual.filter((id) => !doGrupo.includes(id)), opcaoId];
      }
      if (doGrupo.length >= grupo.maxChoices) return atual;
      return [...atual, opcaoId];
    });
  }

  function confirmar() {
    if (impedimento) return;
    onConfirmar({
      productId: produto!.id,
      productSlug: produto!.slug,
      nome: produto!.name,
      imageUrl: produto!.imageUrl,
      categoryId: produto!.categoryId,
      sizeId,
      sizeLabel: produto!.sizes.find((s) => s.id === sizeId)?.label,
      optionIds,
      extraIds,
      quantity,
      note: note.trim() || undefined,
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="admin-theme flex max-h-[90vh] flex-col gap-0 overflow-hidden border-neutral-200 bg-white p-0 text-neutral-900 sm:max-w-lg">
        <DialogHeader className="border-b border-neutral-200 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-bold text-neutral-900">
            {produto.name}
          </DialogTitle>
          <DialogDescription className="text-sm text-neutral-500">
            {produto.description || produto.categoryName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {produto.sizes.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Tamanho
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {produto.sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSizeId(s.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm transition-colors",
                      sizeId === s.id
                        ? "border-[#E11D2E] bg-[#E11D2E]/5 font-semibold text-neutral-900"
                        : "border-neutral-300 text-neutral-700 hover:border-neutral-400",
                    )}
                  >
                    {s.label}
                    <span className="ml-2 text-neutral-500">{dinheiro(s.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {produto.optionGroups.map((grupo) => {
            const marcados = grupo.options.filter((o) => optionIds.includes(o.id)).length;
            const cheio = marcados >= grupo.maxChoices;
            return (
              <section key={grupo.id}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {grupo.name}
                  </h3>
                  {grupo.minChoices > 0 && (
                    <span className="rounded-full bg-[#E11D2E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#E11D2E]">
                      Obrigatório
                    </span>
                  )}
                  <span className="text-[11px] text-neutral-400">
                    {grupo.maxChoices === 1 ? "escolha 1" : `até ${grupo.maxChoices}`}
                    {grupo.freeChoices > 0 && ` · ${grupo.freeChoices} grátis`}
                  </span>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {grupo.options.map((o) => {
                    const marcado = optionIds.includes(o.id);
                    const bloqueado = cheio && !marcado && grupo.maxChoices > 1;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={bloqueado}
                        onClick={() => alternarOpcao(grupo.id, o.id)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                          marcado
                            ? "border-[#E11D2E] bg-[#E11D2E]/5 font-medium"
                            : "border-neutral-300 hover:border-neutral-400",
                          bloqueado && "opacity-40",
                        )}
                      >
                        <span className="min-w-0 truncate text-neutral-800">{o.name}</span>
                        {o.price > 0 && (
                          <span className="shrink-0 text-neutral-500">
                            + {dinheiro(o.price)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {extrasDisponiveis.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Adicionais
              </h3>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {extrasDisponiveis.map((e) => {
                  const marcado = extraIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() =>
                        setExtraIds((a) =>
                          a.includes(e.id) ? a.filter((x) => x !== e.id) : [...a, e.id],
                        )
                      }
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                        marcado
                          ? "border-[#E11D2E] bg-[#E11D2E]/5 font-medium"
                          : "border-neutral-300 hover:border-neutral-400",
                      )}
                    >
                      <span className="min-w-0 truncate text-neutral-800">{e.name}</span>
                      <span className="shrink-0 text-neutral-500">+ {dinheiro(e.price)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <label
              htmlFor="balcao-observacao"
              className="text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              Observação
            </label>
            <input
              id="balcao-observacao"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Sem cebola, ponto da carne, embalar separado..."
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base text-neutral-900 md:text-sm"
            />
          </section>
        </div>

        <div className="border-t border-neutral-200 px-6 py-4">
          {impedimento && (
            <p className="mb-3 text-sm font-medium text-[#E11D2E]">{impedimento}</p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-neutral-300 p-1">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-8 text-center text-sm font-semibold">{quantity}</span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={confirmar}
              disabled={Boolean(impedimento)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {edicao ? "Salvar item" : "Adicionar ao pedido"}
              <span className="opacity-80">· {dinheiro(preco.total)}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
