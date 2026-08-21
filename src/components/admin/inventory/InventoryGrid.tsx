import { useEffect, useState } from "react";
import { adminCreateInventoryItem, adminUpdateInventoryItem } from "@/server/functions/inventory.fn";
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    baseUnitId: "kg", // Default to kg
    cost: "",
    itemType: "INGREDIENT",
  });
  const [generatedSku, setGeneratedSku] = useState<string>("");

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

  const handleCreateItem = async () => {
    try {
      const payload = {
        name: newItem.name || "",
        baseUnitId: newItem.baseUnitId || "kg",
        itemType: newItem.itemType || "INGREDIENT",
        cost: newItem.cost && newItem.cost.trim() ? newItem.cost : "",
      };

      const createdItem = await adminCreateInventoryItem(payload as any);

      setShowCreateModal(false);
      setNewItem({
        name: "",
        baseUnitId: "kg",
        cost: "",
        itemType: "INGREDIENT",
      });
      setGeneratedSku("");
      fetchItems();

      // Mostrar SKU gerado
      const sku = (createdItem as any)?.sku || "gerado";
      alert(`✅ Item "${newItem.name}" criado com sucesso!\n\nSKU: ${sku}\n\nProxima etapa: Ir para "Movimentações" para registrar a quantidade inicial.`);
    } catch (error) {
      console.error("Failed to create item:", error);
      alert("Erro ao criar item: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  return (
    <div className="inventory-grid space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Itens de Estoque</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
        >
          + Novo Item
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold">Criar Novo Item</h3>

            <div>
              <label className="block text-sm font-medium mb-1">Nome *</label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="Ex: Farinha de Trigo"
                className="w-full px-3 py-2 border rounded bg-background text-foreground"
              />
            </div>

            <div className="bg-blue-50 p-3 rounded">
              <p className="text-sm text-blue-900">
                ℹ️ <strong>SKU gerado automaticamente</strong> pelo sistema (sem duplicação)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Unidade *</label>
              <select
                value={newItem.baseUnitId}
                onChange={(e) => setNewItem({ ...newItem, baseUnitId: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-background text-foreground"
              >
                <option value="kg">kg (quilograma)</option>
                <option value="g">g (grama)</option>
                <option value="L">L (litro)</option>
                <option value="ml">ml (mililitro)</option>
                <option value="un">un (unidade)</option>
                <option value="m">m (metro)</option>
                <option value="cm">cm (centímetro)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Custo (R$) (Opcional)</label>
              <input
                type="number"
                value={newItem.cost}
                onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })}
                placeholder="Ex: 5.50"
                step="0.01"
                className="w-full px-3 py-2 border rounded bg-background text-foreground"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tipo *</label>
              <select
                value={newItem.itemType}
                onChange={(e) => setNewItem({ ...newItem, itemType: e.target.value })}
                className="w-full px-3 py-2 border rounded bg-background text-foreground"
              >
                <option value="INGREDIENT">🧪 Ingrediente</option>
                <option value="RESALE">🛒 Revenda</option>
                <option value="PRODUCED">🍕 Produzido</option>
                <option value="PACKAGING">📦 Embalagem</option>
              </select>

              {/* Descrição dinâmica do tipo selecionado */}
              <div className="mt-2 p-3 bg-gray-50 rounded text-xs text-gray-700 border border-gray-200">
                {newItem.itemType === "INGREDIENT" && (
                  <>
                    <strong>🧪 Ingrediente:</strong> Produtos que ENTRAM NA RECEITA.
                    <br />
                    Exemplos: Farinha de Trigo, Queijo, Molho, Calabresa
                  </>
                )}
                {newItem.itemType === "RESALE" && (
                  <>
                    <strong>🛒 Revenda:</strong> Produtos PRONTOS que você compra e revende sem mudança.
                    <br />
                    Exemplos: Refrigerante, Cerveja, Suco, Água mineral
                  </>
                )}
                {newItem.itemType === "PRODUCED" && (
                  <>
                    <strong>🍕 Produzido:</strong> Produtos que VOCÊ FABRICA internamente.
                    <br />
                    Exemplos: Massa fresca, Molho caseiro, Pão caseiro
                  </>
                )}
                {newItem.itemType === "PACKAGING" && (
                  <>
                    <strong>📦 Embalagem:</strong> Caixas, sacolas e embalagens.
                    <br />
                    Exemplos: Caixa de pizza, Sacola plástica, Guardanapo
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateItem}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

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
                <td className="px-4 py-2 text-right">R$ {(item.cost ?? 0).toFixed(2)}</td>
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
