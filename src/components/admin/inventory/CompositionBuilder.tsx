import { useEffect, useState } from "react";
import { adminGetStockReport } from "@/server/functions/report.fn";
import { adminCreateComposition, adminGetProductVersions, adminUpdateComposition } from "@/server/functions/composition.fn";

export interface CompositionBuilderProps {
  storeId: string;
  productId: string;
  mode?: "create" | "edit" | "view";
  compositionId?: string;
  categoryId?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  cost: number;
  baseUnit: { id: string; code: string };
}

interface CompositionItem {
  inventoryItemId: string;
  quantity: number;
  unitId: string;
  sortOrder: number;
}

export function CompositionBuilder(props: CompositionBuilderProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [compositionItems, setCompositionItems] = useState<CompositionItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [props.productId, props.compositionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch inventory items
      const itemsData = await adminGetStockReport({ sortBy: "name", limit: "100" });
      if (Array.isArray(itemsData)) {
        setItems(itemsData.filter((i: any) => i.isActive));
      }

      // Fetch existing versions
      try {
        const versionsData = await adminGetProductVersions({
          data: { productId: props.productId }
        } as any);
        if (Array.isArray(versionsData)) {
          setVersions(versionsData);

          // Se está em modo edit e tem compositionId, carregar essa versão
          if (props.mode === "edit" && props.compositionId) {
            const versionToEdit = versionsData.find((v: any) => v.id === props.compositionId);
            if (versionToEdit) {
              loadVersionForEditing(versionToEdit);
            }
          }
          // Se houver uma versão ativa e estamos em modo view, carregar os itens
          else if (props.mode === "view" && versionsData.length > 0) {
            const activeVersion = versionsData.find((v: any) => v.isActive) || versionsData[0];
            loadVersionForEditing(activeVersion);
          }
        }
      } catch (error) {
        console.log("No versions found yet");
      }
    } catch (error) {
      console.error("Failed to fetch composition data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVersionForEditing = (version: any) => {
    setEditingVersionId(version.id);
    if (version.items && Array.isArray(version.items)) {
      setCompositionItems(
        version.items.map((item: any) => ({
          inventoryItemId: item.inventoryItemId,
          quantity: Number(item.quantity),
          unitId: item.unitId,
          sortOrder: item.sortOrder || 0,
        }))
      );
    }
  };

  const addItem = () => {
    if (items.length === 0) return;
    const firstItem = items[0];
    setCompositionItems([
      ...compositionItems,
      {
        inventoryItemId: firstItem.id,
        quantity: 1,
        unitId: firstItem.baseUnit.id,
        sortOrder: compositionItems.length
      },
    ]);
  };

  const removeItem = (index: number) => {
    setCompositionItems(compositionItems.filter((_, i) => i !== index));
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const updated = [...compositionItems];
    updated[index].quantity = quantity;
    setCompositionItems(updated);
  };

  const updateItemId = (index: number, inventoryItemId: string) => {
    const updated = [...compositionItems];
    const selectedItem = items.find((i) => i.id === inventoryItemId);
    updated[index].inventoryItemId = inventoryItemId;
    if (selectedItem) {
      updated[index].unitId = selectedItem.baseUnit.id;
    }
    setCompositionItems(updated);
  };

  const calculateTotalCost = () => {
    return compositionItems.reduce((sum, comp) => {
      const item = items.find((i) => i.id === comp.inventoryItemId);
      return sum + (item?.cost || 0) * comp.quantity;
    }, 0);
  };

  const handleSaveComposition = async () => {
    if (compositionItems.length === 0) {
      alert("Adicione pelo menos um item à receita");
      return;
    }

    setSaving(true);
    try {
      if (editingVersionId) {
        // Atualizar receita existente
        await adminUpdateComposition({
          data: {
            compositionId: editingVersionId,
            items: compositionItems,
          }
        } as any);
        alert("✅ Receita atualizada com sucesso!");
      } else {
        // Criar nova receita
        await adminCreateComposition({
          data: {
            productId: props.productId,
            categoryId: props.categoryId,
            items: compositionItems,
            isActive: true,
          }
        } as any);
        alert("✅ Receita criada com sucesso!");
      }
      setCompositionItems([]);
      setEditingVersionId(null);
      fetchData();
    } catch (error) {
      console.error("Failed to save composition:", error);
      alert("Erro ao salvar receita: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const totalCost = calculateTotalCost();

  return (
    <div className="composition-builder space-y-4">
      {/* Nova Receita */}
      <div className="p-4 border rounded bg-white space-y-4">
        <h3 className="text-lg font-bold">Criar Nova Receita</h3>

        <div>
          <label className="block text-sm font-medium mb-2">Itens da Receita *</label>
          {compositionItems.length === 0 ? (
            <p className="text-sm text-neutral-600 mb-2">Nenhum item adicionado ainda</p>
          ) : (
            <div className="space-y-2 mb-4">
              {compositionItems.map((comp, idx) => {
                const item = items.find((i) => i.id === comp.inventoryItemId);
                return (
                  <div key={idx} className="flex gap-2 items-center bg-neutral-50 p-3 rounded">
                    <select
                      value={comp.inventoryItemId}
                      onChange={(e) => updateItemId(idx, e.target.value)}
                      className="flex-1 px-3 py-2 border rounded bg-white text-sm"
                    >
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.sku})
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-1 items-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={comp.quantity}
                        onChange={(e) => updateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                        placeholder="Qtd"
                        className="w-20 px-3 py-2 border rounded text-sm"
                      />
                      <span className="text-sm font-medium text-neutral-700 min-w-fit bg-blue-100 px-2 py-1 rounded">
                        {item?.baseUnit.code || "un"}
                      </span>
                    </div>
                    <span className="text-sm font-medium w-24 text-right">
                      R$ {((item?.cost || 0) * comp.quantity).toFixed(2)}
                    </span>
                    <button
                      onClick={() => removeItem(idx)}
                      className="text-red-600 hover:text-red-700 font-medium text-sm"
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={addItem}
            disabled={loading || items.length === 0}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            + Adicionar Item
          </button>
        </div>

        {/* Resumo de Custo */}
        {compositionItems.length > 0 && (
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">Custo Total:</span>
              <span className="text-xl font-bold text-green-600">R$ {totalCost.toFixed(2)}</span>
            </div>
            <button
              onClick={handleSaveComposition}
              disabled={saving}
              className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              {saving ? "Salvando..." : "Salvar Receita"}
            </button>
          </div>
        )}
      </div>

      {/* Versões Existentes */}
      {versions.length > 0 && (
        <div className="p-4 border rounded bg-white space-y-4">
          <h3 className="text-lg font-bold">Versões da Receita</h3>
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version.id} className={`flex items-center justify-between p-3 rounded transition ${
                editingVersionId === version.id ? "bg-blue-50 border-2 border-blue-200" : "bg-neutral-50"
              }`}>
                <div>
                  <p className="font-medium text-sm">{version.name || "Versão " + version.version}</p>
                  <p className="text-xs text-neutral-600">
                    {version.items?.length || 0} itens • R$ {version.totalCost?.toFixed(2) || "0.00"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {version.isActive && (
                    <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                      Ativa
                    </span>
                  )}
                  <button
                    onClick={() => loadVersionForEditing(version)}
                    className="text-sm text-blue-600 hover:underline font-medium"
                  >
                    {editingVersionId === version.id ? "✓ Editando" : "Editar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-neutral-600">Carregando...</p>}
    </div>
  );
}
