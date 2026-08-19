import type { OptionGroup } from "@/lib/pizzaria2/menu";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import { cn } from "@/lib/utils";

/**
 * As perguntas que o cardápio faz antes do item ir para o carrinho.
 *
 * A forma segue a regra do grupo, sem o cliente precisar entendê-la: escolha
 * única vira botão de rádio, várias viram caixas de marcar. Ninguém deveria ter
 * que ler "máximo 1" para descobrir que só cabe um.
 */
export function OptionGroups({
  groups,
  selected,
  onToggle,
}: {
  groups: OptionGroup[];
  selected: string[];
  onToggle: (group: OptionGroup, optionId: string) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const escolhidosNoGrupo = group.options.filter((o) => selected.includes(o.id)).length;
        const unica = group.max === 1;
        const cheio = escolhidosNoGrupo >= group.max;

        return (
          <section key={group.id}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="font-display text-lg font-bold text-charcoal">{group.name}</h2>
              {group.min > 0 && (
                <span className="rounded-full bg-tomato/10 px-2 py-0.5 text-[11px] font-semibold text-tomato">
                  Obrigatório
                </span>
              )}
              <span className="text-xs text-charcoal/50">{regra(group)}</span>
            </div>

            <div className="mt-2 space-y-1.5">
              {group.options.map((option) => {
                const marcado = selected.includes(option.id);
                // Cheio bloqueia só o que não está marcado — desmarcar sempre
                // pode, senão o cliente fica preso na primeira escolha.
                const bloqueado = cheio && !marcado && !unica;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={bloqueado}
                    onClick={() => onToggle(group, option.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                      marcado
                        ? "border-tomato bg-tomato/5"
                        : "border-charcoal/12 hover:border-tomato/40",
                      bloqueado && "opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center border",
                        unica ? "rounded-full" : "rounded-md",
                        marcado ? "border-tomato bg-tomato" : "border-charcoal/25",
                      )}
                    >
                      {marcado && (
                        <span
                          className={cn(
                            "bg-[color:var(--on-primary)]",
                            unica ? "size-2 rounded-full" : "size-2.5 rounded-[3px]",
                          )}
                        />
                      )}
                    </span>

                    <span className="min-w-0 flex-1 text-sm text-charcoal">{option.name}</span>

                    {option.price > 0 && (
                      <span className="shrink-0 text-sm font-semibold text-charcoal/70">
                        + {formatCurrency(option.price)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** A regra em português, e não em números soltos. */
function regra(group: OptionGroup): string {
  if (group.free > 0) {
    return group.free === 1
      ? "A primeira é grátis"
      : `As ${group.free} primeiras são grátis`;
  }
  if (group.max === 1) return "Escolha 1";
  if (group.min === group.max) return `Escolha ${group.min}`;
  return `Até ${group.max}`;
}
