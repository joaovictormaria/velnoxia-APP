import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

/**
 * Escolha dos tamanhos de uma categoria.
 *
 * Por seleção, e não por digitação: o nome do tamanho vira o que o cliente lê
 * no cardápio, e um "Média" com M minúsculo ou um "Grande " com espaço sobrando
 * viram tamanhos diferentes que ninguém nota até o preço sair errado.
 *
 * O campo livre continua existindo — nenhum conjunto de sugestões cobre todo
 * ramo —, mas fica em segundo plano, para ser a exceção.
 */

const SUGESTOES: { grupo: string; opcoes: string[] }[] = [
  { grupo: "Pizza", opcoes: ["Brotinho", "Média", "Grande", "Gigante"] },
  { grupo: "Letras", opcoes: ["P", "M", "G", "GG"] },
  { grupo: "Por extenso", opcoes: ["Pequeno", "Médio", "Grande"] },
  { grupo: "Volume", opcoes: ["300ml", "400ml", "500ml", "700ml", "1L"] },
  { grupo: "Porção", opcoes: ["Individual", "Para dois", "Família"] },
];

export function SizePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (sizes: string[]) => void;
}) {
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

      <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
        {SUGESTOES.map(({ grupo, opcoes }) => (
          <div key={grupo} className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 shrink-0 text-xs text-neutral-500">{grupo}</span>
            {opcoes.map((label) => {
              const escolhido = value.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => alterna(label)}
                  className={
                    escolhido
                      ? "rounded-full bg-[#E11D2E] px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}

        <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
          <span className="w-24 shrink-0 text-xs text-neutral-500">Outro</span>
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
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400"
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
    </div>
  );
}
