import { useEffect, useState } from "react";
import { adminGetMovementHistory } from "@/server/functions/report.fn";

export interface AuditLogProps {
  storeId: string;
  itemId?: string;
  referenceId?: string;
}

export function AuditLog(props: AuditLogProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMovements = async () => {
      setLoading(true);
      try {
        const params: any = { limit: "50" };
        if (props.itemId) params.itemId = props.itemId;

        const data = await adminGetMovementHistory(params);
        console.log("✅ adminGetMovementHistory returned:", data);
        console.log("   Type:", typeof data);
        console.log("   Is Array?", Array.isArray(data));
        if (data) {
          console.log("   Keys:", Object.keys(data));
        }

        if (Array.isArray(data)) {
          console.log(`   Setting ${data.length} movements`);
          setMovements(data);
        } else {
          console.log("   Data is NOT an array!");
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
                <th className="px-4 py-2 text-left">Ref</th>
                <th className="px-4 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((mov: any) => (
                <tr key={mov.id}>
                  <td className="px-4 py-2 text-sm">{mov.createdAt?.toString().split("T")[0] || "—"}</td>
                  <td className="px-4 py-2">{mov.item?.name || "—"}</td>
                  <td className="px-4 py-2">{getTypeLabel(mov.type)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{mov.quantity > 0 ? "+" : ""}{mov.quantity}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{mov.reference || "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{mov.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
