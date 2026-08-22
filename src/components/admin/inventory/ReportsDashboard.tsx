import { useEffect, useState } from "react";
import { adminGetInventoryValue, adminGetLowStockAlerts } from "@/server/functions/inventory.fn";

export interface ReportsDashboardProps {
  storeId: string;
}

export function ReportsDashboard(props: ReportsDashboardProps) {
  const [totalValue, setTotalValue] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [inventory, alerts] = await Promise.all([
        adminGetInventoryValue(),
        adminGetLowStockAlerts(),
      ]);

      if (inventory && typeof inventory === "object") {
        setTotalValue(inventory.totalValue || 0);
      }
      if (Array.isArray(alerts)) {
        setLowStockCount(alerts.length);
        // Calcular quanto está faltando para cada item
        const itemsWithMissing = alerts.map((item: any) => ({
          ...item,
          missingQuantity: (Number(item.maximumQuantity ?? 0) * 0.3) - Number(item.quantityOnHand ?? 0),
        }));
        setLowStockItems(itemsWithMissing);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [props.storeId]);

  return (
    <div className="reports-dashboard space-y-6 p-4 border rounded bg-white">
      <h2 className="text-2xl font-bold">Dashboard de Relatórios</h2>

      {loading && <p className="text-neutral-600">Carregando relatórios...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded bg-neutral-50 space-y-2">
          <p className="text-sm text-neutral-600">Valor Total em Estoque</p>
          <p className="text-3xl font-bold text-green-600">
            R$ {totalValue.toFixed(2)}
          </p>
        </div>

        <div className="p-4 border rounded bg-red-50 space-y-3">
          <p className="text-sm text-neutral-600">Alertas de Estoque Baixo (≤30%)</p>
          <p className="text-3xl font-bold text-red-600">{lowStockCount}</p>
          <p className="text-xs text-neutral-600">itens abaixo de 30% do máximo</p>
          {lowStockItems.length > 0 && (
            <div className="mt-3 space-y-1 border-t pt-2">
              {lowStockItems.map((item: any) => (
                <div key={item.id} className="text-xs text-red-700">
                  <span className="font-medium">{item.name}:</span> Faltam{" "}
                  <span className="font-bold">{item.missingQuantity.toFixed(2)} {item.baseUnit?.code}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border rounded bg-blue-50">
        <p className="text-sm text-blue-900">
          ℹ️ Relatórios completos disponíveis nas abas Movimentações, Receitas e Gráficos
        </p>
      </div>

      <div className="p-4 border rounded bg-green-50 space-y-2">
        <p className="text-sm text-green-900 font-medium">✅ Proteção Automática</p>
        <p className="text-xs text-green-800">
          O sistema agora bloqueia qualquer movimento que deixaria as quantidades negativas.
          Nenhum campo pode ir abaixo de 0.
        </p>
      </div>
    </div>
  );
}
