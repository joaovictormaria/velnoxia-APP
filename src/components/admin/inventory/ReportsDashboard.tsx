import { useEffect, useState } from "react";
import { quantidade } from "@/lib/formato";
import { statusDoEstoque, faltanteParaOMinimo } from "@/lib/status-do-estoque";
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
        /*
          O FALTANTE VEM DO MINIMO, e nao de 30% de um campo que ninguem grava.

          Era `maximumQuantity * 0,3 - quantityOnHand`, e `maximumQuantity`
          nem vinha neste endpoint: o resultado era `0 - saldo`, um numero
          negativo apresentado como "falta".

          Agora e `minimo - disponivel`, calculado so quando o item esta de
          fato em LOW_STOCK. Item sem minimo, ou sem disponivel, nao tem
          faltante — tem falta, que e outra coisa e ja aparece no rotulo.
        */
        const itemsWithMissing = alerts.map((item: any) => {
          const estado = statusDoEstoque(item);
          return {
            ...item,
            status: estado.status,
            disponivel: estado.disponivel,
            missingQuantity: faltanteParaOMinimo(estado),
          };
        });
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
          {/*
            O TEXTO PASSOU A DESCREVER A REGRA QUE ALIMENTA O NÚMERO.

            Dizia "(≤30%)" e "itens abaixo de 30% do máximo", mas o número
            sempre veio de `minimumThreshold` — o endpoint nunca calculou
            percentual de máximo nenhum. Duas frases descrevendo uma regra que
            não era a executada.
          */}
          <p className="text-sm text-neutral-600">Alertas de Estoque</p>
          <p className="text-3xl font-bold text-red-600">{lowStockCount}</p>
          <p className="text-xs text-neutral-600">
            itens sem estoque ou abaixo do mínimo
          </p>
          {lowStockItems.length > 0 && (
            <div className="mt-3 space-y-1 border-t pt-2">
              {lowStockItems.map((item: any) => (
                <div key={item.id} className="text-xs text-red-700">
                  <span className="font-medium">{item.name}:</span>{" "}
                  {/*
                    "Faltam X" só para quem está abaixo do mínimo. Quem está sem
                    disponível não tem faltante — tem falta, e a frase certa é
                    outra. Antes o cálculo devolvia negativo e a tela o exibia.
                  */}
                  {item.missingQuantity != null ? (
                    <>
                      Faltam{" "}
                      <span className="font-bold">
                        {quantidade(item.missingQuantity)} {item.baseUnit?.code}
                      </span>{" "}
                      para o mínimo
                    </>
                  ) : (
                    <span className="font-bold">Sem estoque disponível</span>
                  )}
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
