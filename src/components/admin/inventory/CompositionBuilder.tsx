import { useEffect, useState } from "react";
import { adminGetStockReport } from "@/server/functions/report.fn";
import { adminCreateComposition, adminGetProductVersions, adminUpdateComposition } from "@/server/functions/composition.fn";
import {
  adminListarConversoesDeUnidade,
  adminListarUnidades,
} from "@/server/functions/inventory.fn";
/*
  A MESMA conversao do servidor, e nao uma parecida.

  Enquanto esta tela multiplicava quantidade por custo, 100 g de acucar a
  R$ 5,00/kg apareciam como R$ 500,00 — e a venda gravava R$ 0,50. Duas contas
  discordando sobre o mesmo numero. Agora e uma so, importada.
*/
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
  type MapaDeConversoes,
} from "@/lib/conversao-de-unidade";
import { unidadesCompativeis, type UnidadeConhecida } from "@/lib/unidades-compativeis";

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
  baseUnitId: string;
  /** `system` decide quais unidades a receita pode oferecer para este insumo. */
  baseUnit: { id: string; code: string; system: string };
  /** Quanto cabe em UMA unidade de estoque, e em que unidade isso esta escrito. */
  contentSize?: number | null;
  contentUnit?: string | null;
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
  const [unidades, setUnidades] = useState<UnidadeConhecida[]>([]);
  const [conversoes, setConversoes] = useState<MapaDeConversoes>(new Map());

  useEffect(() => {
    fetchData();
  }, [props.productId, props.compositionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch inventory items
      const [itemsData, unidadesData, conversoesData] = await Promise.all([
        adminGetStockReport({
          data: { sortBy: "name", limit: "100", includeInactive: false },
        } as any),
        adminListarUnidades({} as any),
        adminListarConversoesDeUnidade({} as any),
      ]);
      if (Array.isArray(itemsData)) {
        setItems(itemsData.filter((i: any) => i.isActive));
      }
      if (Array.isArray(unidadesData)) setUnidades(unidadesData as UnidadeConhecida[]);
      if (Array.isArray(conversoesData)) {
        setConversoes(montarMapaDeConversoes(conversoesData as any));
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

  /**
   * A pessoa escolheu outra unidade para esta linha.
   *
   * Nao mexe no insumo nem no estoque: `InventoryItem.baseUnitId` continua
   * sendo onde o saldo e o custo sao contados. O que muda e como a RECEITA
   * escreve a quantidade.
   */
  const updateItemUnit = (index: number, unitId: string) => {
    const updated = [...compositionItems];
    updated[index].unitId = unitId;
    setCompositionItems(updated);
  };

  const updateItemId = (index: number, inventoryItemId: string) => {
    const updated = [...compositionItems];
    const selectedItem = items.find((i) => i.id === inventoryItemId);
    updated[index].inventoryItemId = inventoryItemId;
    /*
      Trocar de insumo derruba a unidade para a base do NOVO insumo.

      Manter a anterior deixaria "250 ml" apontando para um insumo controlado
      em kg — combinacao que o servidor recusa, descoberta so no salvar.
    */
    if (selectedItem) {
      updated[index].unitId = selectedItem.baseUnit?.id ?? selectedItem.baseUnitId;
    }
    setCompositionItems(updated);
  };

  /**
   * Unidades que esta linha pode usar. Vazio quando o insumo ainda nao carregou.
   */
  const unidadesDaLinha = (inventoryItemId: string): UnidadeConhecida[] => {
    const item = items.find((i) => i.id === inventoryItemId);
    if (!item) return [];
    /*
      O ITEM INTEIRO, e nao so a unidade base.

      E o que abre a segunda porta: um oleo contado em "un" que declara
      "cada garrafa tem 900 ml" passa a oferecer ml na receita. Enquanto so o
      id da base atravessava, a lista de um item "un" era sempre ["un"] — e
      quem cadastrou o conteudo nao entendia por que ele nao servia para nada.
    */
    return unidadesCompativeis(
      {
        baseUnitId: item.baseUnit?.id ?? item.baseUnitId,
        contentSize: item.contentSize ?? null,
        contentUnit: item.contentUnit ?? null,
      },
      unidades,
    );
  };

  /**
   * O custo de uma linha, na unidade que a pessoa escreveu.
   *
   * `cost` do insumo e R$ por unidade BASE. A quantidade da ficha pode estar em
   * outra unidade da mesma grandeza, entao ela vem para a base antes de
   * multiplicar — exatamente o que `InventoryCostService` fara na venda.
   *
   * Devolve `null`, e nao zero, quando a conversao nao existe: zero seria um
   * numero, e um numero errado na coluna de custo e pior que um traco.
   */
  const custoDaLinha = (comp: CompositionItem): number | null => {
    const item = items.find((i) => i.id === comp.inventoryItemId);
    if (!item || item.cost == null) return null;
    try {
      const naBase = converterParaUnidadeBase(
        comp.quantity,
        comp.unitId,
        {
          baseUnitId: item.baseUnit?.id ?? item.baseUnitId,
          contentSize: item.contentSize ?? null,
          contentUnit: item.contentUnit ?? null,
        },
        conversoes,
      );
      return naBase * item.cost;
    } catch {
      return null;
    }
  };

  const calculateTotalCost = () =>
    compositionItems.reduce((soma, comp) => soma + (custoDaLinha(comp) ?? 0), 0);

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
        const criada: any = await adminCreateComposition({
          data: {
            productId: props.productId,
            categoryId: props.categoryId,
            items: compositionItems,
            isActive: true,
          }
        } as any);
        /*
         * Digitar um nome novo aqui CRIA o produto, e com o controle de estoque
         * ligado ele nasce inativo e sem preço. Quem estava montando uma receita
         * saía achando que terminou, e o produto não aparecia no cardápio.
         */
        alert(
          criada?.produtoCriadoInativo
            ? `✅ Receita criada com sucesso!\n\nO produto "${criada.produtoCriadoNome}" foi criado como INATIVO e sem preço. Vá em Cardápio para cadastrar o preço e ativá-lo.`
            : "✅ Receita criada com sucesso!",
        );
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
                  /*
                    A LINHA QUEBRA NO CELULAR EM VEZ DE ESPREMER.

                    Eram quatro campos numa `flex` sem wrap: a 360px o nome do
                    insumo espremia a quantidade e a unidade contra o custo. Em
                    duas faixas — insumo em cima, numeros embaixo — cada campo
                    fica com largura de dedo, e a partir de `sm` tudo volta para
                    uma linha so.
                  */
                  <div
                    key={idx}
                    className="flex min-w-0 flex-col gap-2 rounded bg-neutral-50 p-3 sm:flex-row sm:items-center"
                  >
                    <select
                      value={comp.inventoryItemId}
                      onChange={(e) => updateItemId(idx, e.target.value)}
                      aria-label="Ingrediente"
                      className="min-w-0 flex-1 rounded border bg-white px-3 py-2 text-sm"
                    >
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.sku})
                        </option>
                      ))}
                    </select>

                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={comp.quantity}
                        onChange={(e) => updateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                        placeholder="Qtd"
                        aria-label="Quantidade"
                        className="w-20 shrink-0 rounded border px-3 py-2 text-sm"
                      />
                      {/*
                        A UNIDADE DA RECEITA, e nao a do estoque.

                        Era um `<span>` mostrando `baseUnit.code`: quem estoca
                        acucar em kg era obrigado a escrever a receita em kg.
                        A lista vem de `unidadesCompativeis`, a mesma regra que
                        o servidor usa para recusar — entao o que da para
                        escolher aqui e exatamente o que da para gravar la.

                        Com uma opcao so (un), continua um select, desabilitado:
                        o valor segue sendo enviado e o layout nao muda de forma.
                      */}
                      <select
                        value={comp.unitId}
                        onChange={(e) => updateItemUnit(idx, e.target.value)}
                        disabled={unidadesDaLinha(comp.inventoryItemId).length <= 1}
                        aria-label="Unidade"
                        className="w-24 shrink-0 rounded border bg-white px-2 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-600"
                      >
                        {unidadesDaLinha(comp.inventoryItemId).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code}
                          </option>
                        ))}
                      </select>

                      <span className="ml-auto w-24 shrink-0 text-right text-sm font-medium sm:ml-0">
                        {custoDaLinha(comp) === null
                          ? "—"
                          : `R$ ${(custoDaLinha(comp) as number).toFixed(2)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="shrink-0 text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
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
              type="button"
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
                    type="button"
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
