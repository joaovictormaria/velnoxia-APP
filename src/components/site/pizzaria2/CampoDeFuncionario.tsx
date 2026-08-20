import { BadgePercent } from "lucide-react";
import { formatCurrency } from "@/lib/pizzaria2/menu";

/** O que o servidor respondeu sobre o telefone e o PIN digitados. */
export type RespostaDoFuncionario =
  | {
      ok: true;
      nome: string;
      desconto: number;
      foraDaCota: number;
      cota: string | null;
      permiteFolha: boolean;
    }
  | { ok: false; error: string }
  | null;

/**
 * O benefício de funcionário, no checkout.
 *
 * Fica escondido atrás de um botão em vez de aparecer sozinho quando o telefone
 * digitado é de um funcionário. A diferença importa: um campo que surge sozinho
 * conta a qualquer pessoa que aquele número trabalha na loja, e quem quisesse
 * saber bastaria testar números até o campo aparecer.
 */
export function CampoDeFuncionario({
  aberto,
  onAbrir,
  pin,
  onDigitar,
  onConferir,
  conferindo,
  resposta,
}: {
  aberto: boolean;
  onAbrir: () => void;
  pin: string;
  onDigitar: (v: string) => void;
  onConferir: () => void;
  conferindo: boolean;
  resposta: RespostaDoFuncionario;
}) {
  if (!aberto) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className="flex items-center gap-1.5 text-xs font-medium text-charcoal/50 hover:text-charcoal"
      >
        <BadgePercent className="size-3.5" />
        Tenho benefício de funcionário
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-charcoal/15 bg-white/60 p-3">
      <div className="flex items-end gap-2">
        <label className="block flex-1 space-y-1.5">
          <span className="text-sm font-medium text-charcoal">PIN de funcionário</span>
          <input
            value={pin}
            onChange={(e) => onDigitar(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={onConferir}
            // Teclado numérico no celular, sem virar um campo de número com
            // setinhas de incremento no computador.
            inputMode="numeric"
            autoComplete="off"
            placeholder="0000"
            className="w-full rounded-xl border border-charcoal/15 px-3 py-2.5 text-base tracking-[0.4em] text-charcoal placeholder:tracking-[0.4em] placeholder:text-charcoal/25 md:text-sm"
          />
        </label>
        <button
          type="button"
          onClick={onConferir}
          disabled={conferindo || pin.length < 4}
          className="h-[42px] shrink-0 rounded-xl border border-charcoal/15 px-4 text-sm font-medium text-charcoal disabled:opacity-50"
        >
          {conferindo ? "..." : "Conferir"}
        </button>
      </div>

      {resposta?.ok === true && (
        <div className="mt-2 space-y-0.5">
          <p className="text-xs font-medium text-olive">
            {resposta.nome}: -{formatCurrency(resposta.desconto)} no pedido
          </p>
          {resposta.cota && <p className="text-xs text-charcoal/50">{resposta.cota}</p>}
          {resposta.foraDaCota > 0 && (
            /*
             * Dito na hora, e não depois: a cota acabou, o excedente vai por
             * preço cheio, e o pedido continua de pé. Descobrir isso só no
             * total final é o que faria a pessoa achar que o desconto falhou.
             */
            <p className="text-xs text-charcoal/60">
              {resposta.foraDaCota === 1
                ? "1 item passou da cota de hoje e vai por preço cheio."
                : `${resposta.foraDaCota} itens passaram da cota de hoje e vão por preço cheio.`}
            </p>
          )}
        </div>
      )}
      {resposta?.ok === false && <p className="mt-2 text-xs text-tomato">{resposta.error}</p>}
    </div>
  );
}
