import { Plus, Trash2 } from "lucide-react";
import { gruposSugeridos } from "@/lib/option-suggestions";

export type GrupoRascunho = {
  name: string;
  minChoices: number;
  maxChoices: number;
  freeChoices: number;
  options: { name: string; price: number }[];
};

/**
 * As perguntas que a categoria faz ao cliente: sabor, ponto da carne,
 * complementos.
 *
 * A regra é escolhida em palavras — "obrigatório escolher 1", "até 3 grátis" —
 * e não em três campos numéricos. Um lojista não deveria precisar traduzir
 * "mínimo 1, máximo 1" para entender que está pedindo um sabor.
 */
export function OptionGroupEditor({
  value,
  onChange,
  businessType,
}: {
  value: GrupoRascunho[];
  onChange: (grupos: GrupoRascunho[]) => void;
  businessType: string;
}) {
  const sugestoes = gruposSugeridos(businessType).filter(
    (s) => !value.some((g) => g.name === s.name),
  );

  const atualiza = (i: number, mudanca: Partial<GrupoRascunho>) =>
    onChange(value.map((g, k) => (k === i ? { ...g, ...mudanca } : g)));

  return (
    <div className="space-y-3">
      {value.map((grupo, i) => (
        <div key={i} className="rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center gap-2">
            <input
              value={grupo.name}
              onChange={(e) => atualiza(i, { name: e.target.value })}
              placeholder="Nome da pergunta. Ex.: Sabor"
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-900"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              aria-label="Remover grupo"
              className="text-neutral-400 hover:text-[#E11D2E]"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <RegraDoGrupo grupo={grupo} onChange={(m) => atualiza(i, m)} />

          <div className="mt-2 space-y-1.5">
            {grupo.options.map((opcao, j) => (
              <div key={j} className="flex items-center gap-2">
                <input
                  value={opcao.name}
                  onChange={(e) =>
                    atualiza(i, {
                      options: grupo.options.map((o, k) =>
                        k === j ? { ...o, name: e.target.value } : o,
                      ),
                    })
                  }
                  placeholder="Opção"
                  className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={opcao.price}
                    onChange={(e) =>
                      atualiza(i, {
                        options: grupo.options.map((o, k) =>
                          k === j ? { ...o, price: Number(e.target.value) } : o,
                        ),
                      })
                    }
                    className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm text-neutral-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    atualiza(i, { options: grupo.options.filter((_, k) => k !== j) })
                  }
                  aria-label="Remover opção"
                  className="text-neutral-400 hover:text-[#E11D2E]"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                atualiza(i, { options: [...grupo.options, { name: "", price: 0 }] })
              }
              className="flex items-center gap-1 text-xs font-semibold text-[#E11D2E]"
            >
              <Plus className="size-3.5" />
              Opção
            </button>
          </div>
        </div>
      ))}

      {/* Os modelos prontos do ramo evitam a página em branco: o dono clica em
          "Sabor" e já vem a pergunta montada, com as opções do negócio dele. */}
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-500">Adicionar:</span>
          {sugestoes.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onChange([...value, s])}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:border-[#E11D2E] hover:text-[#E11D2E]"
            >
              + {s.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange([
                ...value,
                { name: "", minChoices: 0, maxChoices: 1, freeChoices: 0, options: [] },
              ])
            }
            className="rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-[#E11D2E]"
          >
            + em branco
          </button>
        </div>
      )}
    </div>
  );
}

/** A regra em palavras, com os números atrás. */
function RegraDoGrupo({
  grupo,
  onChange,
}: {
  grupo: GrupoRascunho;
  onChange: (m: Partial<GrupoRascunho>) => void;
}) {
  const obrigatorio = grupo.minChoices > 0;
  const unica = grupo.maxChoices === 1;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-600">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={obrigatorio}
          onChange={(e) => onChange({ minChoices: e.target.checked ? 1 : 0 })}
          className="size-3.5 accent-[#E11D2E]"
        />
        Obrigatório
      </label>

      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={unica}
          onChange={(e) =>
            onChange({
              maxChoices: e.target.checked ? 1 : 5,
              // Escolha única e cota grátis não combinam: a única escolha
              // seria sempre a grátis, e o preço nunca entraria na conta.
              freeChoices: e.target.checked ? 0 : grupo.freeChoices,
            })
          }
          className="size-3.5 accent-[#E11D2E]"
        />
        Escolha só uma
      </label>

      {!unica && (
        <>
          <label className="flex items-center gap-1.5">
            Até
            <input
              type="number"
              min="1"
              max="20"
              value={grupo.maxChoices}
              onChange={(e) => onChange({ maxChoices: Number(e.target.value) })}
              className="w-14 rounded border border-neutral-200 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Grátis as primeiras
            <input
              type="number"
              min="0"
              max="20"
              value={grupo.freeChoices}
              onChange={(e) => onChange({ freeChoices: Number(e.target.value) })}
              className="w-14 rounded border border-neutral-200 px-2 py-1"
            />
          </label>
        </>
      )}
    </div>
  );
}
