import { X } from "lucide-react";
import type { MesaCardData } from "./MesaCard";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function MesaModal({
  mesa,
  onClose,
}: {
  mesa: MesaCardData;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-neutral-900">
            Mesa {mesa.tableNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="size-6 text-neutral-400" />
          </button>
        </div>

        <div className="space-y-4">
          {mesa.pedidos.map((pedido, idx) => (
            <div key={pedido.id} className="border border-neutral-200 rounded-lg p-4">
              <div className="flex items-baseline justify-between mb-3">
                <span className="font-bold text-neutral-900">
                  Pedido #{pedido.number}
                </span>
                <span className="text-sm text-neutral-500">
                  {new Date(pedido.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="space-y-2 mb-3">
                {pedido.items.map((item: any, itemIdx: number) => (
                  <div key={itemIdx} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-700">
                      {item.quantity}x {item.productNameSnapshot}
                      {item.sizeLabel && ` (${item.sizeLabel})`}
                    </span>
                    <span className="text-neutral-600">
                      {currency.format(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-sm font-bold border-t border-neutral-200 pt-2">
                <span>Subtotal:</span>
                <span>{currency.format(pedido.total)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-200 mt-6 pt-4">
          <div className="flex items-center justify-between text-lg font-bold text-neutral-900">
            <span>Total da Mesa:</span>
            <span className="text-purple-600">{currency.format(mesa.totalValor)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-6 px-4 py-2 rounded-lg border border-neutral-200 font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
