import { useQuery } from "@tanstack/react-query";
import {
  getFinancialKPIs,
  getProductProfitability,
} from "@/server/functions/inventory-costs.fn";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Package,
} from "lucide-react";

/**
 * Componente de Análise de Custos e Lucratividade
 */
export function CostAnalysis() {
  const [days, setDays] = [30, 30]; // Estado: últimos 30 dias

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["financial-kpis", days],
    queryFn: () => getFinancialKPIs({ days } as any),
    refetchInterval: 5 * 60 * 1000, // 5 minutos
  });

  const { data: profitability, isLoading: profitabilityLoading } = useQuery({
    queryKey: ["product-profitability", days],
    queryFn: () => getProductProfitability({ days } as any),
    refetchInterval: 5 * 60 * 1000,
  });

  if (kpisLoading || profitabilityLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded"></div>
          ))}
        </div>
        <div className="h-48 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Total Sales */}
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-blue-600" size={20} />
            <span className="text-sm font-semibold">Faturamento</span>
          </div>
          <div className="text-2xl font-bold text-blue-600">
            R$ {kpis.totalSalesValue.toFixed(2)}
          </div>
          <p className="text-xs text-gray-600 mt-1">últimos {kpis.period.split(" ")[2]} dias</p>
        </div>

        {/* Total Cost */}
        <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-orange-600" size={20} />
            <span className="text-sm font-semibold">Custo</span>
          </div>
          <div className="text-2xl font-bold text-orange-600">
            R$ {kpis.totalCost.toFixed(2)}
          </div>
          <p className="text-xs text-gray-600 mt-1">matéria prima</p>
        </div>

        {/* Total Profit */}
        <div className={`rounded-lg p-4 border-2 ${
          kpis.totalProfit > 0
            ? "bg-green-50 border-green-300"
            : "bg-red-50 border-red-300"
        }`}>
          <div className={`flex items-center gap-2 mb-2 ${
            kpis.totalProfit > 0
              ? "text-green-600"
              : "text-red-600"
          }`}>
            <TrendingUp size={20} />
            <span className="text-sm font-semibold">Lucro</span>
          </div>
          <div className={`text-2xl font-bold ${
            kpis.totalProfit > 0
              ? "text-green-600"
              : "text-red-600"
          }`}>
            R$ {kpis.totalProfit.toFixed(2)}
          </div>
          <p className="text-xs text-gray-600 mt-1">bruto</p>
        </div>

        {/* Profit Margin */}
        <div className={`rounded-lg p-4 border-2 ${
          kpis.profitMargin > 30
            ? "bg-green-50 border-green-300"
            : kpis.profitMargin > 20
              ? "bg-yellow-50 border-yellow-300"
              : "bg-red-50 border-red-300"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Percent className={
              kpis.profitMargin > 30
                ? "text-green-600"
                : kpis.profitMargin > 20
                  ? "text-yellow-600"
                  : "text-red-600"
            } size={20} />
            <span className="text-sm font-semibold">Margem</span>
          </div>
          <div className={`text-2xl font-bold ${
            kpis.profitMargin > 30
              ? "text-green-600"
              : kpis.profitMargin > 20
                ? "text-yellow-600"
                : "text-red-600"
          }`}>
            {kpis.profitMargin.toFixed(1)}%
          </div>
          <p className="text-xs text-gray-600 mt-1">do faturamento</p>
        </div>

        {/* Total Orders */}
        <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="text-purple-600" size={20} />
            <span className="text-sm font-semibold">Pedidos</span>
          </div>
          <div className="text-2xl font-bold text-purple-600">
            {kpis.totalOrders}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Médio: R$ {kpis.averageOrderValue.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Most/Least Profitable */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kpis.mostProfitableProduct && (
          <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-3">✨ Produto Estrela</h3>
            <p className="font-medium text-green-700">{kpis.mostProfitableProduct.productName}</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="text-gray-700">
                <span className="font-semibold">Margem:</span> {kpis.mostProfitableProduct.profitPercent.toFixed(1)}%
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">Lucro/Pedido:</span> R$ {kpis.mostProfitableProduct.averageProfit.toFixed(2)}
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">Pedidos:</span> {kpis.mostProfitableProduct.totalOrders}
              </p>
            </div>
          </div>
        )}

        {kpis.leastProfitableProduct && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <h3 className="font-semibold text-red-900 mb-3">⚠️ Atenção</h3>
            <p className="font-medium text-red-700">{kpis.leastProfitableProduct.productName}</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="text-gray-700">
                <span className="font-semibold">Margem:</span> {kpis.leastProfitableProduct.profitPercent.toFixed(1)}%
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">Lucro/Pedido:</span> R$ {kpis.leastProfitableProduct.averageProfit.toFixed(2)}
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">Considere revisar preço</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Profitability by Product */}
      {profitability && profitability.length > 0 && (
        <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-4">📊 Lucratividade por Produto</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-gray-300">
                <tr className="text-left">
                  <th className="font-semibold text-gray-700 pb-2">Produto</th>
                  <th className="font-semibold text-gray-700 pb-2 text-right">Pedidos</th>
                  <th className="font-semibold text-gray-700 pb-2 text-right">Faturamento</th>
                  <th className="font-semibold text-gray-700 pb-2 text-right">Custo</th>
                  <th className="font-semibold text-gray-700 pb-2 text-right">Lucro</th>
                  <th className="font-semibold text-gray-700 pb-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody>
                {profitability.slice(0, 10).map((product) => (
                  <tr key={product.productName} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 font-medium">{product.productName}</td>
                    <td className="py-2 text-right text-gray-700">{product.totalOrders}</td>
                    <td className="py-2 text-right text-gray-700">
                      R$ {product.totalSalesValue.toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-gray-700">
                      R$ {product.totalCost.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right font-semibold ${
                      product.totalProfit > 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}>
                      R$ {product.totalProfit.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right font-semibold ${
                      product.profitPercent > 30
                        ? "text-green-600"
                        : product.profitPercent > 20
                          ? "text-yellow-600"
                          : "text-red-600"
                    }`}>
                      {product.profitPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
