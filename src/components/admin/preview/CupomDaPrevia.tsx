import { CampoDeCupom } from "@/components/site/pizzaria2/CampoDeCupom";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import {
  cupomNoExemplo,
  pedidoDeExemplo,
  type RascunhoDeCupom,
} from "@/lib/previa/cupom-de-exemplo";

/**
 * O cupom visto do lado do cliente, num pedido de exemplo.
 *
 * Cupom é a única coisa do sistema que não aparece na loja: o cliente precisa
 * saber o código e digitá-lo no checkout. A pergunta que sobra não é "onde
 * isso aparece", e sim "quanto isso tira" — que é o que ninguém calcula de
 * cabeça ao escolher entre 15% e R$ 12.
 */
export function CupomDaPrevia({ cupom }: { cupom: RascunhoDeCupom }) {
  const subtotal = pedidoDeExemplo(cupom.minOrderValue);
  const resposta = cupomNoExemplo(cupom, subtotal);
  const total = resposta.ok ? subtotal - resposta.discount : subtotal;

  return (
    <div className="bg-cream p-8">
      <div className="mx-auto max-w-md rounded-2xl border border-charcoal/8 bg-mozzarella p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-charcoal/40">
          No fechamento do pedido
        </p>
        <p className="mt-3 text-sm font-semibold text-charcoal/70">Cupom (opcional)</p>
        <div className="mt-1.5">
          <CampoDeCupom
            codigo={cupom.code.toUpperCase()}
            onDigitar={() => {}}
            onAplicar={() => {}}
            conferindo={false}
            resposta={resposta}
          />
        </div>

        {/* O exemplo é dito com todas as letras: sem isso a lojista poderia ler
            o desconto como valor fixo do cupom, e ele muda com o pedido. */}
        <div className="mt-5 border-t border-charcoal/8 pt-4 text-sm">
          <div className="flex justify-between text-charcoal/60">
            <span>Pedido de exemplo</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {resposta.ok && resposta.discount > 0 && (
            <div className="mt-1 flex justify-between text-olive">
              <span>Desconto</span>
              <span>−{formatCurrency(resposta.discount)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between font-display text-base font-bold text-charcoal">
            <span>O cliente paga</span>
            <span data-previa="desconto-do-cupom">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
