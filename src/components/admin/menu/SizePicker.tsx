import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { sugestoesDeTamanho } from "@/lib/size-suggestions";

/**
 * Escolha dos tamanhos de uma categoria.
 *
 * Por seleção, e não por digitação: o nome do tamanho vira o que o cliente lê
 * no cardápio, e um "Média" com M minúsculo ou um "Grande " com espaço sobrando
 * viram tamanhos diferentes que ninguém nota até o preço sair errado.
 *
 * As sugestões são as do ramo da loja, e não todas de uma vez: uma marmitaria
 * não tem nada a ver com "Brotinho". O campo livre continua ao lado para o que
 * nenhuma lista cobre.
 */

export function SizePicker({
  value,
  onChange,
  businessType,
}: {
  value: string[];
  onChange: (sizes: string[]) => void;
  /** Decide quais sugestões aparecem. */
  businessType: string;
}) {
  const sugestoes = sugestoesDeTamanho(businessType);
  const [novo, setNovo] = useState("");

  const alterna = (label: string) =>
    onChange(
      value.includes(label) ? value.filter((s) => s !== label) : [...value, label],
    );

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= value.length) return;
    const copia = [...value];
    const [item] = copia.splice(de, 1);
    copia.splice(para, 0, item);
    onChange(copia);
  };

  function adicionarNovo() {
    const label = novo.trim();
    // Repetido não entra: dois tamanhos com o mesmo nome na mesma categoria são
    // recusados pelo banco, e é melhor avisar aqui do que falhar ao salvar.
    if (!label || value.includes(label)) {
      setNovo("");
      return;
    }
    onChange([...value, label]);
    setNovo("");
  }

  return (
    <div className="space-y-3">
      {/* A ordem importa — é a que o cliente vê no cardápio —, então os
          escolhidos aparecem em lista, e não como um amontoado de marcados. */}
      {value.length > 0 && (
        <ol className="space-y-1.5">
          {value.map((label, i) => (
            <li
              key={label}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5"
            >
              <span className="w-5 text-xs text-neutral-400">{i + 1}º</span>
              <span className="flex-1 text-sm font-medium text-neutral-900">{label}</span>
              <button
                type="button"
                onClick={() => mover(i, i - 1)}
                disabled={i === 0}
                aria-label={`Subir ${label}`}
                className="text-neutral-400 hover:text-neutral-800 disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => mover(i, i + 1)}
                disabled={i === value.length - 1}
                aria-label={`Descer ${label}`}
                className="text-neutral-400 hover:text-neutral-800 disabled:opacity-30"
              >
                <ArrowDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => alterna(label)}
                aria-label={`Remover ${label}`}
                className="text-neutral-400 hover:text-[#E11D2E]"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 p-3">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Sem isso o Enter enviaria o formulário da categoria inteira.
                e.preventDefault();
                adicionarNovo();
              }
            }}
            maxLength={24}
            placeholder="Ex.: Meio litro"
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-base md:text-sm text-neutral-800 placeholder:text-neutral-400"
          />
          <button
            type="button"
            onClick={adicionarNovo}
            className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:border-[#E11D2E] hover:text-[#E11D2E]"
          >
            <Plus className="size-3.5" />
            Incluir
          </button>
      </div>
    </div>
  );
}
