import { useQuery } from "@tanstack/react-query";
import { getInventoryAlertsSummary, getCriticalItems, getStockRunoutForecast } from "@/server/functions/inventory-alerts.fn";
import { AlertCircle, AlertTriangle, TrendingDown } from "lucide-react";

/**
 * Widget de Alertas de Estoque
 * Exibe resumo crítico e items em risco
 */
export function AlertsWidget() {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["inventory-alerts-summary"],
    queryFn: () => getInventoryAlertsSummary(),
    refetchInterval: 60000, // 1 minuto
  });

  const { data: criticalItems, isLoading: criticalLoading } = useQuery({
    queryKey: ["critical-items"],
    queryFn: () => getCriticalItems(),
    refetchInterval: 60000,
  });

  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ["stock-runout-forecast"],
    queryFn: () => getStockRunoutForecast(),
    refetchInterval: 60000,
  });

  if (summaryLoading || criticalLoading || forecastLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-gray-200 rounded"></div>
        <div className="h-48 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Critical */}
        <div className={`p-4 rounded-lg border-2 ${
          summary.criticalAlerts > 0
            ? "bg-red-50 border-red-300"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className={summary.criticalAlerts > 0 ? "text-red-600" : "text-gray-600"} />
            <span className="text-sm font-semibold">Crítico</span>
          </div>
          <div className={`text-2xl font-bold ${
            summary.criticalAlerts > 0 ? "text-red-600" : "text-gray-600"
          }`}>
            {summary.criticalAlerts}
          </div>
          <p className="text-xs text-gray-600 mt-1">alertas críticos</p>
        </div>

        {/* Warnings */}
        <div className={`p-4 rounded-lg border-2 ${
          summary.warningAlerts > 0
            ? "bg-yellow-50 border-yellow-300"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={summary.warningAlerts > 0 ? "text-yellow-600" : "text-gray-600"} />
            <span className="text-sm font-semibold">Avisos</span>
          </div>
          <div className={`text-2xl font-bold ${
            summary.warningAlerts > 0 ? "text-yellow-600" : "text-gray-600"
          }`}>
            {summary.warningAlerts}
          </div>
          <p className="text-xs text-gray-600 mt-1">avisos de estoque baixo</p>
        </div>

        {/* Critical Items */}
        <div className="p-4 rounded-lg border-2 border-orange-300 bg-orange-50">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="text-orange-600" />
            <span className="text-sm font-semibold">Items Críticos</span>
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {summary.totalCriticalItems}
          </div>
          <p className="text-xs text-gray-600 mt-1">abaixo do mínimo</p>
        </div>

        {/* Runout Soon */}
        <div className={`p-4 rounded-lg border-2 ${
          (forecast?.filter(i => i.daysUntilRunout !== null && i.daysUntilRunout < 3).length || 0) > 0
            ? "bg-red-50 border-red-300"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className={
              (forecast?.filter(i => i.daysUntilRunout !== null && i.daysUntilRunout < 3).length || 0) > 0
                ? "text-red-600"
                : "text-gray-600"
            } />
            <span className="text-sm font-semibold">Vai Acabar</span>
          </div>
          <div className={`text-2xl font-bold ${
            (forecast?.filter(i => i.daysUntilRunout !== null && i.daysUntilRunout < 3).length || 0) > 0
              ? "text-red-600"
              : "text-gray-600"
          }`}>
            {forecast?.filter(i => i.daysUntilRunout !== null && i.daysUntilRunout < 3).length || 0}
          </div>
          <p className="text-xs text-gray-600 mt-1">em 3 dias</p>
        </div>
      </div>

      {/* Critical Items List */}
      {summary.totalCriticalItems > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 mb-3">⚠️ Items Críticos</h3>
          <div className="space-y-2">
            {criticalItems?.slice(0, 5).map((item) => (
              <div key={item.id} className="flex justify-between items-center p-2 bg-white rounded border border-red-200">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-gray-600">
                    {item.available.toString()} disponível
                    {item.minimumThreshold && ` (mínimo: ${item.minimumThreshold.toString()})`}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                  item.status === "out_of_stock"
                    ? "bg-red-200 text-red-800"
                    : "bg-yellow-200 text-yellow-800"
                }`}>
                  {item.status === "out_of_stock" ? "SEM ESTOQUE" : "BAIXO"}
                </span>
              </div>
            ))}
            {summary.totalCriticalItems > 5 && (
              <p className="text-xs text-red-700 font-semibold mt-2">
                +{summary.totalCriticalItems - 5} items críticos não listados
              </p>
            )}
          </div>
        </div>
      )}

      {/* Runout Forecast */}
      {forecast && forecast.length > 0 && (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
          <h3 className="font-semibold text-orange-900 mb-3">📉 Previsão: Vai Acabar</h3>
          <div className="space-y-2">
            {forecast.slice(0, 5).map((item) => (
              <div key={item.itemId} className="flex justify-between items-center p-2 bg-white rounded border border-orange-200">
                <div>
                  <p className="font-medium text-sm">{item.itemName}</p>
                  <p className="text-xs text-gray-600">
                    Consumo: {item.dailyConsumption.toString()}/dia
                    {item.daysUntilRunout !== null && (
                      <span className="ml-2">
                        ({Math.round(item.daysUntilRunout)} dias)
                      </span>
                    )}
                  </p>
                </div>
                {item.estimatedRunoutDate && (
                  <span className="text-xs font-semibold px-2 py-1 rounded bg-orange-200 text-orange-800">
                    {new Date(item.estimatedRunoutDate).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Good */}
      {summary.totalAlerts === 0 && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 text-center">
          <p className="font-semibold text-green-900">✅ Tudo em ordem!</p>
          <p className="text-sm text-green-700">Nenhum alerta de estoque no momento.</p>
        </div>
      )}
    </div>
  );
}
