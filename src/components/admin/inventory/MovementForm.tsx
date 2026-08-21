import { useEffect, useState } from "react";
import { adminRecordMovement, adminGetStockReport } from "@/server/functions/inventory.fn";

export interface MovementFormProps {
  storeId: string;
  onSuccess?: () => void;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  baseUnit: { id: string; code: string };
  quantityOnHand: number;
  quantityReserved: number;
}

type MovementType = "PURCHASE" | "LOSS" | "ADJUSTMENT";

export function MovementForm(props: MovementFormProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    itemId: "",
    type: "PURCHASE" as MovementType,
    quantity: "",
    unitId: "",
    reference: "",
    note: "",
  });
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("storeId", props.storeId);
      const data = await adminGetStockReport(fd);
      if (Array.isArray(data)) {
        setItems(data.filter((i: any) => i.isActive));
      }
    } catch (error) {
      console.error("Failed to fetch items:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [props.storeId]);

  useEffect(() => {
    if (formData.itemId) {
      const item = items.find((i) => i.id === formData.itemId);
      setSelectedItem(item || null);
      if (item && !formData.unitId) {
        setFormData((prev) => ({ ...prev, unitId: item.baseUnit.id }));
      }
    }
  }, [formData.itemId, items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemId || !formData.quantity) {
      alert("Preencha os campos obrigatórios");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("storeId", props.storeId);
      fd.append("itemId", formData.itemId);
      fd.append("type", formData.type);
      fd.append("quantity", formData.quantity);
      if (formData.unitId) fd.append("unitId", formData.unitId);
      if (formData.reference) fd.append("reference", formData.reference);
      if (formData.note) fd.append("note", formData.note);

      await adminRecordMovement(fd);
      props.onSuccess?.();

      setFormData({
        itemId: "",
        type: "PURCHASE",
        quantity: "",
        unitId: "",
        reference: "",
        note: "",
      });
      setSelectedItem(null);
    } catch (error) {
      console.error("Movement creation failed:", error);
      alert("Erro ao registrar movimentação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailableQuantity = () => {
    if (!selectedItem) return 0;
    return selectedItem.quantityOnHand - selectedItem.quantityReserved;
  };

  return (
    <div className="movement-form space-y-4 p-4 border rounded bg-white">
      <h3 className="text-lg font-bold">Registrar Movimentação</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Item Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Item *</label>
          <select
            value={formData.itemId}
            onChange={(e) =>
              setFormData({ ...formData, itemId: e.target.value })
            }
            disabled={loading || submitting}
            required
            className="w-full px-3 py-2 border rounded bg-white text-foreground"
          >
            <option value="">
              {loading ? "Carregando..." : "Selecione um item..."}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.sku}) - {item.quantityOnHand}
                {item.baseUnit.code}
              </option>
            ))}
          </select>
        </div>

        {/* Show Selected Item Info */}
        {selectedItem && (
          <div className="p-3 bg-neutral-50 rounded text-sm space-y-2">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-neutral-600">Em estoque:</span>
                <p className="font-semibold">
                  {selectedItem.quantityOnHand} {selectedItem.baseUnit.code}
                </p>
              </div>
              <div>
                <span className="text-neutral-600">Reservado:</span>
                <p className="font-semibold text-amber-600">
                  {selectedItem.quantityReserved} {selectedItem.baseUnit.code}
                </p>
              </div>
              <div>
                <span className="text-neutral-600">Disponível:</span>
                <p className="font-semibold text-green-600">
                  {getAvailableQuantity()} {selectedItem.baseUnit.code}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Movement Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Tipo de Movimento *</label>
          <select
            value={formData.type}
            onChange={(e) =>
              setFormData({
                ...formData,
                type: e.target.value as MovementType,
              })
            }
            disabled={submitting}
            className="w-full px-3 py-2 border rounded bg-white text-foreground"
          >
            <option value="PURCHASE">Compra (+)</option>
            <option value="LOSS">Perda (-)</option>
            <option value="ADJUSTMENT">Ajuste (±)</option>
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium mb-2">Quantidade *</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.quantity}
            onChange={(e) =>
              setFormData({ ...formData, quantity: e.target.value })
            }
            disabled={submitting}
            required
            className="w-full px-3 py-2 border rounded bg-white text-foreground"
          />
          {selectedItem && (
            <p className="text-xs text-neutral-600 mt-1">
              Unidade: {selectedItem.baseUnit.code}
            </p>
          )}
        </div>

        {/* Reference */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Referência (opcional)
          </label>
          <input
            type="text"
            placeholder="ex: order-123, lote-456"
            value={formData.reference}
            onChange={(e) =>
              setFormData({ ...formData, reference: e.target.value })
            }
            disabled={submitting}
            className="w-full px-3 py-2 border rounded bg-white text-foreground"
          />
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Notas (opcional)
          </label>
          <textarea
            placeholder="Motivo, observações, etc."
            value={formData.note}
            onChange={(e) =>
              setFormData({ ...formData, note: e.target.value })
            }
            disabled={submitting}
            rows={3}
            className="w-full px-3 py-2 border rounded bg-white text-foreground"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || loading || !formData.itemId}
          className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Registrando..." : "Registrar Movimentação"}
        </button>
      </form>
    </div>
  );
}
