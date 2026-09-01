import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { adminGetStockReport } from "@/server/functions/report.fn";
import {
  ajuda,
  botaoPrimario,
  campo,
  estiloDaSeta,
  marcaObrigatorio,
  selecao,
} from "./campos";
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

/*
  R$ 9,71 — e não "R$ 9.71".

  `toFixed(2)` devolve ponto decimal, que aqui se lê como separador de milhar:
  um custo de R$ 9,71 escrito "R$ 9.71" é ambíguo na única língua em que esta
  tela é usada. O resto do painel já formata assim.
*/
const brl = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
    <div className="composition-builder space-y-5">
      {/*
        SEM MOLDURA PRÓPRIA.

        Este bloco só aparece dentro de outro card branco — na etapa 3 da
        criação e embaixo da lista de receitas cadastradas. A moldura que ele
        desenhava era um card dentro de um card, com o título "Criar Nova
        Receita" repetindo o que o cabeçalho de cima já dizia.
      */}
      <div>
        <p className="text-sm font-semibold text-neutral-900">
          Itens da receita <span className={marcaObrigatorio}>*</span>
        </p>
        <p className={ajuda}>
          O que sai do estoque a cada unidade produzida.
        </p>

        {compositionItems.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            Nenhum ingrediente ainda.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {compositionItems.map((comp, idx) => {
              const item = items.find((i) => i.id === comp.inventoryItemId);
              const custo = custoDaLinha(comp);
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
                  className="flex min-w-0 flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 sm:flex-row sm:items-center"
                >
                  <select
                    value={comp.inventoryItemId}
                    onChange={(e) => updateItemId(idx, e.target.value)}
                    aria-label="Ingrediente"
                    className={`${selecao} min-w-0 flex-1`}
                    style={estiloDaSeta}
                  >
                    {items.map((i) => (
                      /*
                        O SKU SÓ APARECE SE EXISTIR. Sem essa checagem o item
                        sem código virava "Bolo de Chocolate ()" — um par de
                        parênteses vazios que parece defeito, porque é.
                      */
                      <option key={i.id} value={i.id}>
                        {i.sku ? `${i.name} (${i.sku})` : i.name}
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
                      className={`${campo} w-20 shrink-0 text-right tabular-nums`}
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
                      className={`${selecao} w-24 shrink-0 px-2 pr-8`}
                      style={estiloDaSeta}
                    >
                      {unidadesDaLinha(comp.inventoryItemId).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code}
                        </option>
                      ))}
                    </select>

                    <span className="ml-auto w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-900 sm:ml-0">
                      {custo === null ? "—" : brl(custo)}
                    </span>
                    {/*
                      "Remover" era texto vermelho ao lado do custo, do mesmo
                      tamanho — e ficava mais chamativo que o próprio número.
                      Como ícone ele continua alcançável, com o nome no
                      `aria-label` e na dica.
                    */}
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label={`Remover ${item?.name ?? "ingrediente"}`}
                      title="Remover"
                      className="shrink-0 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 motion-reduce:transition-none"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/*
          ADICIONAR NÃO É A AÇÃO PRINCIPAL. Em azul sólido e largura cheia ele
          pesava mais que "Salvar Receita", que é o que fecha o trabalho.
        */}
        <button
          type="button"
          onClick={addItem}
          disabled={loading || items.length === 0}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          <Plus className="size-4" aria-hidden="true" />
          Adicionar ingrediente
        </button>
      </div>

      {/* Resumo de Custo */}
      {compositionItems.length > 0 && (
        <div className="space-y-3 border-t border-neutral-200 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-neutral-700">Custo total</span>
            <span className="font-display text-2xl font-bold tabular-nums text-neutral-900">
              {brl(totalCost)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveComposition}
            disabled={saving}
            className={`${botaoPrimario} w-full py-3`}
          >
            {saving ? "Salvando..." : "Salvar receita"}
          </button>
        </div>
      )}

      {/* Versões Existentes */}
      {versions.length > 0 && (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="font-display text-sm font-bold text-neutral-900">
            Versões da receita
          </h3>
          <div className="mt-3 space-y-2">
            {versions.map((version) => {
              const editando = editingVersionId === version.id;
              return (
                <div
                  key={version.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors motion-reduce:transition-none ${
                    editando
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {version.name || "Versão " + version.version}
                    </p>
                    <p className="text-xs tabular-nums text-neutral-500">
                      {version.items?.length || 0} itens · {brl(version.totalCost ?? 0)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {version.isActive && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Em uso
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => loadVersionForEditing(version)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none"
                    >
                      {editando ? (
                        <>
                          <Check className="size-3.5" aria-hidden="true" />
                          Editando
                        </>
                      ) : (
                        <>
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Editar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-sm text-neutral-500">Carregando...</p>}
    </div>
  );
}
