import { formatCurrency } from "@/lib/pizzaria2/menu";

/** O que o servidor respondeu sobre o código digitado. */
export type RespostaDoCupom =
  | { ok: true; code: string; discount: number }
  | { ok: false; error: string }
  | null;

/**
 * O campo em que o cliente digita o cupom, e a resposta que ele recebe.
 *
 * Separado do checkout para a prévia do painel poder mostrá-lo: um cupom é a
 * única coisa do sistema que não aparece na loja — o cliente precisa saber o
 * código e digitá-lo. Sem ver a resposta, a lojista cadastra um desconto sem
 * ideia de quanto ele vai tirar de fato.
 */
export function CampoDeCupom({
  codigo,
  onDigitar,
  onAplicar,
  conferindo,
  resposta,
}: {
  codigo: string;
  onDigitar: (v: string) => void;
  onAplicar: () => void;
  conferindo: boolean;
  resposta: RespostaDoCupom;
}) {
  return (
    <>
      <div className="flex gap-2">
        <input
          data-previa="campo-do-cupom"
          value={codigo}
          onChange={(e) => onDigitar(e.target.value.toUpperCase())}
          onBlur={onAplicar}
          placeholder="PIZZA10"
          className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base md:text-sm text-charcoal placeholder:text-charcoal/30"
        />
        <button
          type="button"
          onClick={onAplicar}
          disabled={conferindo || !codigo.trim()}
          className="shrink-0 rounded-xl border border-charcoal/15 px-4 text-sm font-medium text-charcoal disabled:opacity-50"
        >
          {conferindo ? "..." : "Aplicar"}
        </button>
      </div>
      {resposta?.ok === true && (
        <p data-previa="desconto-do-cupom" className="mt-1.5 text-xs font-medium text-olive">
          {resposta.code} aplicado: -{formatCurrency(resposta.discount)}
        </p>
      )}
      {resposta?.ok === false && (
        <p data-previa="desconto-do-cupom" className="mt-1.5 text-xs text-tomato">
          {resposta.error}
        </p>
      )}
    </>
  );
}
