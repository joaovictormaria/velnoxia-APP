import { useEffect, useState } from "react";
import { adminGetMovementHistory } from "@/server/functions/inventory.fn";

export interface AuditLogProps {
  storeId: string;
  itemId?: string;
  referenceId?: string;
}

interface Movement {
  id: string;
  itemId: string;
  type: string;
  quantity: number;
  reference?: string;
  note?: string;
  createdAt: Date;
  item: { name: string };
}

export function AuditLog(props: AuditLogProps) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMovements = async () => {
      setLoading(true);
      try {
        const data = await adminGetMovementHistory({
          itemId: props.itemId,
          limit: "50",
        });
        if (Array.isArray(data)) {
          setMovements(data);
        }
      } catch (error) {
        console.error("Failed to fetch movements:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovements();
  }, [props.itemId]);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      PURCHASE: "🛒 Compra",
      LOSS: "❌ Perda",
      ADJUSTMENT: "🔧 Ajuste",
      CONSUMPTION: "🍽️ Consumo",
      RESERVATION: "📌 Reserva",
      REVERSAL: "↩️ Reversão",
    };
    return labels[type] || type;
  };

  return (
    <div className="audit-log space-y-4 p-4 border rounded bg-white">
      <h3 className="text-lg font-bold">Histórico de Movimentações</h3>

      {loading && <p className="text-neutral-600">Carregando...</p>}

      {!loading && movements.length === 0 && (
        <div className="p-4 text-center border-2 border-dashed rounded bg-neutral-50">
          <p className="text-neutral-600">Nenhuma movimentação registrada.</p>
        </div>
      )}

      {!loading && movements.length > 0 && (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left">Data</th>
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-right">Qtd</th>
                <th className="px-4 py-2 text-left">Referência</th>
                <th className="px-4 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((mov) => (
                <tr key={mov.id}>
                  <td className="px-4 py-2 text-sm">
                    {new Date(mov.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">{mov.item?.name || mov.itemId}</td>
                  <td className="px-4 py-2">{getTypeLabel(mov.type)}</td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {mov.quantity > 0 ? "+" : ""}{mov.quantity}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-600">
                    {mov.reference || "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-600">
                    {mov.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
