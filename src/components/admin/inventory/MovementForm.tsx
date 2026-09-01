import { useEffect, useState } from "react";
import { adminRecordMovement } from "@/server/functions/inventory.fn";
import { adminGetStockReport } from "@/server/functions/report.fn";
import { useEstoque } from "@/lib/estoque-store";
import {
  calcularMovimentoDeCompra,
  conteudoDaEmbalagem,
} from "@/lib/embalagem-de-compra";
import {
  ajuda,
  campo,
  estiloDaSeta,
  marcaObrigatorio,
  rotulo,
  selecao,
} from "./campos";

export interface MovementFormProps {
  storeId: string;
  onSuccess?: () => void;
  onItemSelected?: (itemId: string) => void;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  baseUnit: { id: string; code: string };
  quantityOnHand: number;
  quantityReserved: number;
  /** Custo unitário atual, para mostrar o que a compra vai substituir. */
  cost?: number | null;
  /**
   * EMBALAGEM DE COMPRA: quantas unidades de estoque vêm em uma.
   *
   * Vem do CADASTRO do item, não deste formulário. "30 por caixa" se informa
   * uma vez; redigitar a cada compra é convite a errar em uma delas.
   */
  purchasePackSize?: number | null;
  purchasePackLabel?: string | null;
}

type MovementType = "PURCHASE" | "LOSS" | "ADJUSTMENT";

export function MovementForm(props: MovementFormProps) {
  const { invalidate } = useEstoque();
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
    totalPaid: "",
    emEmbalagens: true,
  });
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await adminGetStockReport({
        data: {
          sortBy: "name",
          limit: "100",
          includeInactive: false,
        }
      } as any);
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
      const payload = {
        data: {
          itemId: formData.itemId,
          type: formData.type,
          quantity: formData.quantity,
          unitId: formData.unitId,
          reference: formData.reference || undefined,
          referenceType: undefined,
          note: formData.note || undefined,
          totalPaid: formData.totalPaid || undefined,
          emEmbalagens: emEmbalagens,
        }
      };

      const result = await adminRecordMovement(payload as any);

      props.onSuccess?.();
      invalidate();

      setFormData({
        itemId: "",
        type: "PURCHASE",
        quantity: "",
        unitId: "",
        reference: "",
        note: "",
        totalPaid: "",
        emEmbalagens: true,
      });
      setSelectedItem(null);
    } catch (error) {
      console.error("Movement creation failed:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      alert("Erro ao registrar movimentação: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailableQuantity = () => {
    if (!selectedItem) return 0;
    return selectedItem.quantityOnHand - selectedItem.quantityReserved;
  };

  /*
   * O unitário que a compra vai gravar, mostrado ao vivo.
   *
   * A conta é refeita no servidor — este número é conferência, não fonte. O
   * operador digita o que está na nota e vê na hora se o resultado faz sentido;
   * um "R$ 800,00 por kg" na tela pega o zero a mais antes de virar dado.
   */
  /*
   * EMBALAGEM DE COMPRA × UNIDADE DE CONTROLE.
   *
   * O item traz "caixa com 30". Com a caixa marcada, o número digitado conta
   * CAIXAS: 5 viram 150 ovos no saldo. O servidor refaz esta mesma conversão —
   * aqui ela existe para o operador VER o que vai entrar antes de confirmar.
   */
  const conteudo = conteudoDaEmbalagem(selectedItem?.purchasePackSize);
  const rotuloDaEmbalagem =
    selectedItem?.purchasePackLabel?.trim() || "embalagem";
  const podeComprarEmEmbalagens =
    formData.type === "PURCHASE" && conteudo > 1;
  const emEmbalagens = podeComprarEmEmbalagens && formData.emEmbalagens;

  const digitado = parseFloat(formData.quantity);
  const previa = calcularMovimentoDeCompra({
    digitado,
    conteudoDoItem: selectedItem?.purchasePackSize,
    emEmbalagens,
    totalPago:
      formData.type === "PURCHASE" ? parseFloat(formData.totalPaid) : null,
  });
  /** O que realmente entra no saldo, na unidade de controle. */
  const quantidadeEmEstoque = previa.quantity;

  /*
   * O unitário que a compra vai gravar, mostrado ao vivo.
   *
   * A conta é refeita no servidor — este número é conferência, não fonte. O
   * operador digita o que está na nota e vê na hora se o resultado faz sentido;
   * um "R$ 800,00 por kg" na tela pega o zero a mais antes de virar dado.
   *
   * O divisor é a quantidade em UNIDADE DE ESTOQUE — 150, e não 5. Dividir
   * pelas caixas daria R$ 15,00 "por ovo": o erro que este campo existe para
   * não cometer.
   */
  const custoUnitario = previa.custoUnitario;

  /*
    O RÓTULO DE CADA ITEM NA LISTA.

    Era `Queijo muçarela (QUEIJO-MUC) - 8.99kg`: três informações grudadas, com
    o código no meio empurrando o saldo para fora da caixa. O SKU é interno —
    quem registra a compra procura pelo nome, não pelo código.

    Mas ele não some de vez: quando dois itens têm o MESMO nome, o SKU é a única
    coisa que os separa, e aí ele volta. Some quando é ruído, aparece quando é a
    resposta.
  */
  const nomesRepetidos = new Set(
    items
      .map((i) => i.name.trim().toLowerCase())
      .filter((nome, i, todos) => todos.indexOf(nome) !== i),
  );

  const rotuloDoItem = (item: InventoryItem) => {
    const saldo = `${item.quantityOnHand.toLocaleString("pt-BR", {
      maximumFractionDigits: 3,
    })} ${item.baseUnit.code}`;
    const desempate = nomesRepetidos.has(item.name.trim().toLowerCase())
      ? ` [${item.sku}]`
      : "";
    return `${item.name}${desempate} · ${saldo}`;
  };

  return (
    <div className="movement-form rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="font-display text-base font-bold text-neutral-900">
        Registrar movimentação
      </h3>
      <p className="mt-0.5 text-xs text-neutral-500">
        Entrada de compra ou baixa por perda. O saldo muda na hora.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* ─────────────────────────── ITEM ─────────────────────────── */}
        <div>
          <label className={rotulo}>
            Item <span className={marcaObrigatorio}>*</span>
          </label>
          <select
            value={formData.itemId}
            onChange={(e) => {
              setFormData({ ...formData, itemId: e.target.value });
              props.onItemSelected?.(e.target.value);
            }}
            disabled={loading || submitting}
            required
            className={selecao}
            style={estiloDaSeta}
          >
            <option value="">
              {loading ? "Carregando..." : "Selecione um item..."}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {rotuloDoItem(item)}
              </option>
            ))}
          </select>
        </div>

        {/*
          O SALDO DO ITEM ESCOLHIDO, em três números que se explicam juntos:
          o que existe, o que já está prometido a um pedido e o que sobra.
          Ver só "em estoque" faria alguém dar baixa de algo que já foi vendido.
        */}
        {selectedItem && (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-50 p-3 text-center">
            {[
              { r: "Em estoque", v: selectedItem.quantityOnHand, cor: "text-neutral-900" },
              { r: "Reservado", v: selectedItem.quantityReserved, cor: "text-amber-600" },
              { r: "Disponível", v: getAvailableQuantity(), cor: "text-emerald-600" },
            ].map(({ r, v, cor }) => (
              <div key={r}>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">{r}</p>
                <p className={`mt-0.5 text-sm font-bold tabular-nums ${cor}`}>
                  {v}
                  <span className="ml-0.5 text-xs font-medium text-neutral-400">
                    {selectedItem.baseUnit.code}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}

        {/*
          TIPO E QUANTIDADE LADO A LADO. São a mesma frase — "entrou 30" ou
          "perdi 2" —, e empilhá-los espichava o formulário sem necessidade
          num espaço que já era estreito demais.
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={rotulo}>
              Tipo de movimento <span className={marcaObrigatorio}>*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as MovementType,
                })
              }
              disabled={submitting}
              className={selecao}
              style={estiloDaSeta}
            >
              <option value="PURCHASE">Compra — entrada</option>
              <option value="LOSS">Perda — baixa</option>
            </select>
          </div>

          <div>
            <label className={rotulo}>
              {emEmbalagens ? `Quantidade (${rotuloDaEmbalagem}s)` : "Quantidade"}{" "}
              <span className={marcaObrigatorio}>*</span>
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: e.target.value })
              }
              disabled={submitting}
              required
              className={campo}
            />
          </div>
        </div>

        {/*
          O item diz que vem em caixa de 30. A escolha aqui é só se ESTA
          compra veio em caixa fechada ou avulsa — comprar 12 ovos soltos
          acontece, e travar em múltiplos de 30 obrigaria a mentir no número.
        */}
        {podeComprarEmEmbalagens && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-700 hover:bg-neutral-50">
            <input
              type="checkbox"
              checked={formData.emEmbalagens}
              onChange={(e) =>
                setFormData({ ...formData, emEmbalagens: e.target.checked })
              }
              disabled={submitting}
              className="mt-0.5"
            />
            <span>
              Comprei em {rotuloDaEmbalagem} de{" "}
              <strong>
                {conteudo.toLocaleString("pt-BR")} {selectedItem?.baseUnit.code}
              </strong>
            </span>
          </label>
        )}

        {selectedItem && (
          <p className={ajuda}>
            {emEmbalagens &&
            Number.isFinite(quantidadeEmEstoque) &&
            quantidadeEmEstoque > 0 ? (
              <>
                <strong>
                  {digitado.toLocaleString("pt-BR")} {rotuloDaEmbalagem}
                  {digitado > 1 ? "s" : ""}
                </strong>{" "}
                ={" "}
                <strong>
                  {quantidadeEmEstoque.toLocaleString("pt-BR")}{" "}
                  {selectedItem.baseUnit.code}
                </strong>{" "}
                no estoque
              </>
            ) : (
              <>Unidade: {selectedItem.baseUnit.code}</>
            )}
          </p>
        )}

        {/*
          Valor pago — só na compra.
          Perda e ajuste não têm preço, e mostrar o campo neles convidaria a
          preencher algo que seria ignorado.
        */}
        {formData.type === "PURCHASE" && (
          <div>
            <label className={rotulo}>
              Valor total pago{" "}
              <span className="font-normal text-neutral-400">(opcional)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={formData.totalPaid}
              onChange={(e) =>
                setFormData({ ...formData, totalPaid: e.target.value })
              }
              disabled={submitting}
              className={campo}
            />
            {custoUnitario !== null ? (
              <p className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs leading-snug text-emerald-800">
                = <strong>R$ {custoUnitario.toFixed(2)}</strong> por{" "}
                {selectedItem?.baseUnit.code ?? "unidade"} — passa a ser o custo
                deste item
              </p>
            ) : (
              <p className={ajuda}>
                O que está na nota. Em branco, a entrada não altera o custo
                {selectedItem?.cost != null
                  ? ` (hoje R$ ${Number(selectedItem.cost).toFixed(2)})`
                  : ""}
                .
              </p>
            )}
          </div>
        )}

        {/* Os dois campos livres, lado a lado: nenhum precisa da linha inteira. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={rotulo}>
              Referência{" "}
              <span className="font-normal text-neutral-400">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="ex: order-123, lote-456"
              value={formData.reference}
              onChange={(e) =>
                setFormData({ ...formData, reference: e.target.value })
              }
              disabled={submitting}
              className={campo}
            />
          </div>

          <div>
            <label className={rotulo}>
              Notas{" "}
              <span className="font-normal text-neutral-400">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Motivo, observações..."
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              disabled={submitting}
              className={campo}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || loading || !formData.itemId}
          className="w-full rounded-xl bg-[#E11D2E] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c4172a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D2E] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          {submitting ? "Registrando..." : "Registrar movimentação"}
        </button>
      </form>
    </div>
  );
}
