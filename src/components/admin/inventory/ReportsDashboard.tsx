import { useEffect, useState } from "react";
import { adminGetInventoryValue, adminGetLowStockAlerts } from "@/server/functions/inventory.fn";

export interface ReportsDashboardProps {
  storeId: string;
}

export function ReportsDashboard(props: ReportsDashboardProps) {
  const [totalValue, setTotalValue] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("storeId", props.storeId);

      const [inventory, alerts] = await Promise.all([
        adminGetInventoryValue(fd),
        adminGetLowStockAlerts(fd),
      ]);

      if (inventory && typeof inventory === "object") {
        setTotalValue(inventory.totalValue || 0);
      }
      if (Array.isArray(alerts)) {
        setLowStockCount(alerts.length);
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

        <div className="p-4 border rounded bg-neutral-50 space-y-2">
          <p className="text-sm text-neutral-600">Alertas de Estoque Baixo</p>
          <p className="text-3xl font-bold text-amber-600">{lowStockCount}</p>
          <p className="text-xs text-neutral-600">itens abaixo do mínimo</p>
        </div>
      </div>

      <div className="p-4 border rounded bg-blue-50">
        <p className="text-sm text-blue-900">
          ℹ️ Relatórios completos disponíveis nas abas Movimentações, Receitas e Gráficos
        </p>
      </div>
    </div>
  );
}
