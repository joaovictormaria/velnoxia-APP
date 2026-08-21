import { useEffect, useState } from "react";
import { adminUpdateInventoryItem } from "@/server/functions/inventory.fn";
import { adminGetStockReport } from "@/server/functions/report.fn";

export interface InventoryGridProps {
  storeId: string;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  itemType: string;
  baseUnit: { code: string };
  quantityOnHand: number;
  quantityReserved: number;
  cost: number;
  isActive: boolean;
}

interface SortConfig {
  field: "name" | "quantityOnHand" | "quantityReserved" | "available" | "cost";
  order: "asc" | "desc";
}

export function InventoryGrid(props: InventoryGridProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "name",
    order: "asc",
  });

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await adminGetStockReport({
        sortBy: sortConfig.field === "quantityOnHand" ? "quantity" : sortConfig.field,
        limit: "100",
      });
      if (Array.isArray(data)) {
        setItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch inventory items:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [props.storeId]);

  const handleSort = (field: SortConfig["field"]) => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === "asc" ? "desc" : "asc",
    }));
  };

  const getSortedAndFilteredItems = () => {
    let filtered = [...items];

    if (filterType) {
      filtered = filtered.filter((item) => item.itemType === filterType);
    }

    filtered.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortConfig.field === "name") {
        aVal = a.name;
        bVal = b.name;
      } else if (sortConfig.field === "quantityOnHand") {
        aVal = a.quantityOnHand;
        bVal = b.quantityOnHand;
      } else if (sortConfig.field === "quantityReserved") {
        aVal = a.quantityReserved;
        bVal = b.quantityReserved;
      } else if (sortConfig.field === "available") {
        aVal = a.quantityOnHand - a.quantityReserved;
        bVal = b.quantityOnHand - b.quantityReserved;
      } else if (sortConfig.field === "cost") {
        aVal = a.cost;
        bVal = b.cost;
      }

      if (typeof aVal === "string") {
        return sortConfig.order === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.order === "asc" ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  };

  const handleDeactivate = async (itemId: string) => {
    if (!confirm("Tem certeza que deseja desativar este item?")) return;

    try {
      const fd = new FormData();
      fd.append("itemId", itemId);
      fd.append("storeId", props.storeId);
      fd.append("isActive", "false");

      await adminUpdateInventoryItem(fd);
      fetchItems();
    } catch (error) {
      console.error("Failed to deactivate item:", error);
    }
  };

  return (
    <div className="inventory-grid space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Itens de Estoque</h2>
      </div>

      <div className="flex gap-2">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 border rounded bg-background text-foreground"
        >
          <option value="">Todos os tipos</option>
          <option value="INGREDIENT">Insumo</option>
          <option value="RESALE">Revenda</option>
          <option value="PACKAGING">Embalagem</option>
        </select>
      </div>

      {loading && <p className="text-neutral-600">Carregando...</p>}

      {!loading && getSortedAndFilteredItems().length === 0 && (
        <p className="text-neutral-600">Nenhum item encontrado</p>
      )}

      <div className="overflow-x-auto border rounded bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left">
                <button
                  className="inline-flex items-center gap-1 hover:text-primary cursor-pointer"
                  onClick={() => handleSort("name")}
                >
                  Nome
                  <span className="text-xs">
                    {sortConfig.field === "name"
                      ? sortConfig.order === "asc"
                        ? "↑"
                        : "↓"
                      : "↕"}
                  </span>
                </button>
              </th>
              <th className="px-4 py-2 text-left">SKU</th>
              <th className="px-4 py-2 text-right">
                <button
                  className="inline-flex items-center gap-1 hover:text-primary cursor-pointer float-right"
                  onClick={() => handleSort("quantityOnHand")}
                >
                  Em Estoque
                  <span className="text-xs">
                    {sortConfig.field === "quantityOnHand"
                      ? sortConfig.order === "asc"
                        ? "↑"
                        : "↓"
                      : "↕"}
                  </span>
                </button>
              </th>
              <th className="px-4 py-2 text-right">Reservado</th>
              <th className="px-4 py-2 text-right">Disponível</th>
              <th className="px-4 py-2 text-right">Custo Unit.</th>
              <th className="px-4 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {getSortedAndFilteredItems().map((item) => (
              <tr key={item.id} className={item.isActive ? "" : "opacity-50"}>
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2 text-sm text-neutral-600">
                  {item.sku || item.barcode || "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {item.quantityOnHand.toFixed(2)} {item.baseUnit.code}
                </td>
                <td className="px-4 py-2 text-right text-amber-600">
                  {item.quantityReserved.toFixed(2)} {item.baseUnit.code}
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  {(item.quantityOnHand - item.quantityReserved).toFixed(2)}{" "}
                  {item.baseUnit.code}
                </td>
                <td className="px-4 py-2 text-right">R$ {item.cost.toFixed(2)}</td>
                <td className="px-4 py-2 text-center">
                  {item.isActive ? (
                    <button
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => handleDeactivate(item.id)}
                    >
                      Desativar
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-600">Inativo</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
