import { useEffect, useState } from "react";
import { adminGetStockReport } from "@/server/functions/report.fn";
import { adminCreateComposition, adminGetProductVersions } from "@/server/functions/composition.fn";
import { adminProduceFromComposition, adminGetLowStockItems } from "@/server/functions/production.fn";
import { formatQuantity, getQuantityStep } from "@/lib/quantity-formatter";

export interface CompositionBuilderProps {
  storeId: string;
  productId: string;
  mode?: "create" | "view";
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  cost: number;
  baseUnit: { code: string; id: string };
  contentSize?: number;
  contentUnit?: string;
}

interface CompositionItem {
  itemId: string;
  quantity: number;
  unitCode?: string;
}

export function CompositionBuilder(props: CompositionBuilderProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [compositionItems, setCompositionItems] = useState<CompositionItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<any[]>([]);
  const [producingVersionId, setProducingVersionId] = useState<string | null>(null);
  const [productionQty, setProductionQty] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error"; show: boolean }>({
    message: "",
    type: "success",
    show: false
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type, show: true });
    setTimeout(() => setToast({ message: "", type: "success", show: false }), 4000);
  };

  // Conversões de unidade (cliente)
  const conversions: Record<string, number> = {
    "g→kg": 0.001,
    "kg→g": 1000,
    "ml→l": 0.001,
    "l→ml": 1000,
  };

  useEffect(() => {
    fetchData();
  }, [props.productId]);

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
        console.log("🔍 Buscando versões para productId:", props.productId);
        const versionsData = await adminGetProductVersions({
          data: { productId: props.productId }
        } as any);
        console.log("✅ Versões retornadas:", versionsData);
        if (Array.isArray(versionsData)) {
          setVersions(versionsData);
          console.log("✅ Setadas", versionsData.length, "versões");
        }
      } catch (error) {
        console.log("❌ Erro ao buscar versões:", error);
        console.error("❌ Detalhes:", error instanceof Error ? error.message : error);
      }
    } catch (error) {
      console.error("Failed to fetch composition data:", error);
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    if (items.length === 0) return;
    const firstItem = items[0];
    setCompositionItems([
      ...compositionItems,
      {
        itemId: firstItem.id,
        quantity: 1,
        unitCode: firstItem.baseUnit?.code,
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

  const updateItemId = (index: number, itemId: string) => {
    const updated = [...compositionItems];
    updated[index].itemId = itemId;
    const item = items.find(i => i.id === itemId);
    updated[index].unitCode = item?.baseUnit?.code;
    setCompositionItems(updated);
  };

  const updateItemUnit = (index: number, unitCode: string) => {
    const updated = [...compositionItems];
    updated[index].unitCode = unitCode;
    setCompositionItems(updated);
  };

  const convertToBaseUnit = (quantity: number, fromUnitCode: string, toUnitCode: string, contentSize?: number, contentUnit?: string): number => {
    if (fromUnitCode === toUnitCode) return quantity;

    // Se o item tem contentSize e o fromUnitCode é o contentUnit
    if (contentSize && contentUnit && fromUnitCode === contentUnit) {
      // Exemplo:
      // - Item: Shake com baseUnit="un", contentSize=500, contentUnit="g"
      // - Receita usa: 45g
      // - Cálculo: 45g / 500g = 0.09 un
      const convertedQty = quantity / contentSize;
      console.log(`🔄 Conversão usando contentSize: ${quantity}${fromUnitCode} / ${contentSize}${contentUnit} = ${convertedQty}${toUnitCode}`);
      return convertedQty;
    }

    // Conversões padrão (g↔kg, ml↔L)
    const key = `${fromUnitCode}→${toUnitCode}`;
    const factor = conversions[key];

    if (factor) {
      console.log(`🔄 Conversão padrão: ${quantity}${fromUnitCode} * ${factor} = ${quantity * factor}${toUnitCode}`);
      return quantity * factor;
    }

    console.warn(`⚠️ Sem conversão para ${fromUnitCode}→${toUnitCode}, retornando ${quantity}`);
    return quantity;
  };

  const getItemCost = (comp: CompositionItem): number => {
    const item = items.find((i) => i.id === comp.itemId);
    if (!item) return 0;

    const selectedUnitCode = comp.unitCode || item.baseUnit.code;
    const baseUnitCode = item.baseUnit.code;

    // Converter quantidade para unidade base
    const quantityInBaseUnit = convertToBaseUnit(
      comp.quantity,
      selectedUnitCode,
      baseUnitCode,
      item.contentSize,
      item.contentUnit
    );

    return quantityInBaseUnit * (item.cost || 0);
  };

  const calculateTotalCost = () => {
    return compositionItems.reduce((sum, comp) => {
      return sum + getItemCost(comp);
    }, 0);
  };

  const handleSaveComposition = async () => {
    if (compositionItems.length === 0) {
      showToast("Adicione pelo menos um item à receita", "error");
      return;
    }

    setSaving(true);
    try {
      // Converter para formato esperado pelo backend
      const itemsToSave = compositionItems.map(comp => {
        const item = items.find(i => i.id === comp.itemId);
        const selectedUnitCode = comp.unitCode || item?.baseUnit?.code || "";
        const baseUnitCode = item?.baseUnit?.code || "";
        const unitId = item?.baseUnit?.id || "";

        // Converter quantidade para unidade base usando contentSize se necessário
        const quantityInBaseUnit = convertToBaseUnit(
          comp.quantity,
          selectedUnitCode,
          baseUnitCode,
          item?.contentSize,
          item?.contentUnit
        );

        console.log(`📦 Item: ${item?.name}`);
        console.log(`   Quantidade selecionada: ${comp.quantity} ${selectedUnitCode}`);
        console.log(`   Quantidade em unidade base: ${quantityInBaseUnit} ${baseUnitCode}`);
        if (item?.contentSize && item?.contentUnit) {
          console.log(`   ContentSize: ${item.contentSize} ${item.contentUnit}`);
        }

        return {
          inventoryItemId: comp.itemId,
          quantity: quantityInBaseUnit,
          unitId: unitId,
        };
      });

      const payload = {
        productId: props.productId,
        items: itemsToSave,
        isActive: true,
      };

      console.log("📤 Enviando receita:", JSON.stringify(payload, null, 2));

      await adminCreateComposition({
        data: payload
      } as any);

      showToast("✅ Receita criada com sucesso!", "success");
      setCompositionItems([]);
      fetchData();
    } catch (error) {
      console.error("Failed to save composition:", error);
      const errorMsg = error instanceof Error ? error.message : "Erro ao salvar receita";
      showToast(errorMsg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleProduce = async (versionId: string) => {
    if (!productionQty || parseFloat(productionQty) <= 0) {
      showToast("Digite uma quantidade válida", "error");
      return;
    }

    try {
      await adminProduceFromComposition({
        data: {
          compositionId: versionId,
          quantity: parseFloat(productionQty),
          unitId: "un",
        }
      } as any);

      showToast("✅ Produção realizada com sucesso! Estoque descontado.", "success");
      setProducingVersionId(null);
      setProductionQty("");
      fetchData();
    } catch (error) {
      console.error("Production failed:", error);
      const errorMsg = error instanceof Error ? error.message : "Erro ao produzir";
      showToast(errorMsg, "error");
    }
  };

  const totalCost = calculateTotalCost();
  const mode = props.mode || "create";

  return (
    <div className="composition-builder space-y-4">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300 z-50 ${
          toast.type === "success"
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      )}

      {/* Nova Receita - Apenas no modo create */}
      {mode === "create" && (
      <div className="p-4 border rounded bg-white space-y-4">

        <div>
          <label className="block text-sm font-medium mb-2">Itens da Receita *</label>
          {compositionItems.length === 0 ? (
            <p className="text-sm text-neutral-600 mb-2">Nenhum item adicionado ainda</p>
          ) : (
            <div className="space-y-2 mb-4">
              {compositionItems.map((comp, idx) => {
                const item = items.find((i) => i.id === comp.itemId);
                const selectedUnitCode = comp.unitCode || item?.baseUnit?.code || "";
                const formattedQty = formatQuantity(comp.quantity, selectedUnitCode);
                const itemCost = getItemCost(comp);
                return (
                  <div key={idx} className="border rounded p-4 bg-white space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <select
                          value={comp.itemId}
                          onChange={(e) => updateItemId(idx, e.target.value)}
                          className="w-full px-3 py-2 border rounded bg-white text-sm font-medium"
                        >
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.sku})
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-red-600 hover:text-red-700 font-medium text-sm px-2"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="text-xs text-neutral-600 font-medium block mb-1">Qtd</label>
                        <input
                          type="number"
                          step={getQuantityStep(selectedUnitCode)}
                          min="0"
                          value={comp.quantity || ""}
                          onChange={(e) => updateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-3 py-2 border rounded text-sm text-right font-medium"
                        />
                        <p className="text-xs text-neutral-500 mt-1">{formattedQty} {selectedUnitCode}</p>
                      </div>

                      <div>
                        <label className="text-xs text-neutral-600 font-medium block mb-1">
                          Unidade {item?.contentSize && item?.contentUnit ? `(${item.contentUnit})` : ""}
                        </label>
                        <select
                          value={comp.unitCode || item?.baseUnit?.code || ""}
                          onChange={(e) => updateItemUnit(idx, e.target.value)}
                          className="w-full px-3 py-2 border rounded bg-white text-sm font-medium"
                        >
                          {item?.baseUnit && (
                            <>
                              <option value={item.baseUnit.code}>{item.baseUnit.code} (base)</option>
                              {/* Se tem contentUnit, oferece isso também */}
                              {item.contentUnit && item.contentUnit !== item.baseUnit.code && (
                                <option value={item.contentUnit}>{item.contentUnit}</option>
                              )}
                              {/* Fallback: conversões padrão */}
                              {!item.contentUnit && item.baseUnit.code === "kg" && <option value="g">g</option>}
                              {!item.contentUnit && item.baseUnit.code === "L" && <option value="ml">ml</option>}
                            </>
                          )}
                        </select>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-neutral-600 font-medium mb-1">Custo</p>
                        <p className="text-lg font-bold text-green-600">R$ {itemCost.toFixed(2)}</p>
                      </div>
                    </div>
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
      )}

      {/* Versões Existentes - Apenas no modo view */}
      {mode === "view" && versions.length > 0 && (
        <div className="p-4 border rounded bg-white space-y-4">
          <h3 className="text-lg font-bold">Versões da Receita</h3>
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version.id} className="space-y-2 p-3 bg-neutral-50 rounded">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{(version as any).productName || version.name || "Versão " + version.version}</p>
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
                  </div>
                </div>

                {/* Itens da receita */}
                {version.items && version.items.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs border-t pt-2">
                    {version.items.map((item, idx) => {
                      const invItem = items.find(i => i.id === item.inventoryItemId);
                      return (
                        <div key={idx} className="flex justify-between text-neutral-700">
                          <span>{invItem?.name || "Item"} ({invItem?.sku})</span>
                          <span className="font-medium">{item.quantity} {item.unit?.code}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Produzir */}
                {producingVersionId === version.id ? (
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Quantidade"
                      value={productionQty}
                      onChange={(e) => setProductionQty(e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                    <button
                      onClick={() => handleProduce(version.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-medium"
                    >
                      Produzir
                    </button>
                    <button
                      onClick={() => {
                        setProducingVersionId(null);
                        setProductionQty("");
                      }}
                      className="px-3 py-1 bg-neutral-400 text-neutral-900 rounded hover:bg-neutral-500 text-xs font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setProducingVersionId(version.id)}
                      className="flex-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium"
                    >
                      📦 Produzir usando esta receita
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm("Tem certeza que deseja deletar esta receita?")) return;
                        try {
                          const { adminDeleteCompositionVersion } = await import("@/server/functions/composition.fn");
                          await adminDeleteCompositionVersion({
                            data: { compositionId: version.id }
                          } as any);
                          showToast("✅ Receita deletada com sucesso!", "success");
                          fetchData();
                        } catch (error) {
                          console.error("Erro ao deletar:", error);
                          const errorMsg = error instanceof Error ? error.message : "Erro ao deletar receita";
                          showToast(errorMsg, "error");
                        }
                      }}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs font-medium"
                    >
                      🗑️ Deletar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-neutral-600">Carregando...</p>}
    </div>
  );
}
