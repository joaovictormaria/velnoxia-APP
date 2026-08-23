import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MesaModal } from "./MesaModal";

const CORES = [
  "bg-red-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-yellow-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function getCorPorMesa(tableId: string): string {
  const hash = tableId.charCodeAt(0) + tableId.charCodeAt(tableId.length - 1);
  return CORES[hash % CORES.length];
}

export interface MesaCardData {
  tableId: string;
  tableNumber: number;
  pedidos: any[];
  totalPedidos: number;
  totalValor: number;
}

export function MesaCard({
  mesa,
  onFinalize,
}: {
  mesa: MesaCardData;
  onFinalize: (tableId: string, pedidoIds: string[]) => void;
}) {
  const [showModal, setShowModal] = useState(false);

  const cor = getCorPorMesa(mesa.tableId);

  return (
    <>
      <div className={`rounded-xl border border-neutral-200 p-4 bg-white hover:border-purple-300 transition-colors cursor-pointer overflow-hidden`}>
        <div className={`-mx-4 -mt-4 mb-4 h-2 ${cor}`} />
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-lg font-bold text-neutral-900">
            Mesa {mesa.tableNumber}
          </span>
          <span className="text-xs text-neutral-500">
            {mesa.totalPedidos} {mesa.totalPedidos === 1 ? "pedido" : "pedidos"}
          </span>
        </div>

        <div className="text-xl font-bold text-purple-600 mb-3">
          {currency.format(mesa.totalValor)}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:border-purple-300 hover:text-purple-700 transition-colors cursor-pointer"
          >
            <span>Ver detalhes</span>
            <ChevronDown className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => onFinalize(mesa.tableId, mesa.pedidos.map(p => p.id))}
            className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
          >
            Finalizar pagamento
          </button>
        </div>
      </div>

      {showModal && (
        <MesaModal
          mesa={mesa}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
