import { ICONES_DE_CATEGORIA, iconesDoRamo } from "@/lib/category-icons";

/**
 * Escolher o ícone da categoria clicando, não digitando.
 *
 * Antes era um campo de texto pedindo o nome interno da biblioteca: quem
 * escrevia "Hambúrguer" não via nada aparecer, porque o nome válido era
 * "Sandwich" — e a tela não tinha como avisar. Aqui só existe o que funciona,
 * e o que aparece primeiro é o do ramo da loja: uma churrascaria abre em
 * fogo e carne, não em pizza.
 */
export function IconPicker({
  value,
  onChange,
  businessType,
}: {
  value: string;
  onChange: (icone: string) => void;
  businessType: string;
}) {
  // Um ícone escolhido antes de o ramo mudar continua na lista, senão a
  // categoria pareceria ter perdido o ícone que ainda está salvo nela.
  const nomes = [...new Set([...iconesDoRamo(businessType), ...(value ? [value] : [])])];

  return (
    <div className="flex flex-wrap gap-1.5">
      {nomes.map((nome) => {
        const Icone = ICONES_DE_CATEGORIA[nome];
        if (!Icone) return null;
        const escolhido = nome === value;
        return (
          <button
            key={nome}
            type="button"
            onClick={() => onChange(escolhido ? "" : nome)}
            title={nome}
            aria-label={nome}
            aria-pressed={escolhido}
            className={
              "flex size-9 items-center justify-center rounded-lg border transition " +
              (escolhido
                ? "border-[#E11D2E] bg-[#E11D2E]/10 text-[#E11D2E]"
                : "border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-800")
            }
          >
            <Icone className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
