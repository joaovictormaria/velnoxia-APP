import { useEffect, useState } from "react";
import { adminCreateInventoryItem, adminUpdateInventoryItem, adminListarUnidades } from "@/server/functions/inventory.fn";
import {
  calcularCompra,
  conteudoDaEmbalagem,
} from "@/lib/embalagem-de-compra";
import { adminGetStockReport } from "@/server/functions/report.fn";
import { useEstoque } from "@/lib/estoque-store";

export interface InventoryGridProps {
  storeId: string;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  itemType: string;
  /** O ID da unidade — e o codigo, so para exibir. */
  baseUnitId: string;
  baseUnit: { code: string };
  quantityOnHand: number;
  quantityReserved: number;
  cost: number;
  isActive: boolean;
  /** Embalagem de compra, para poder editá-la depois do cadastro. */
  purchasePackSize?: number | null;
  purchasePackLabel?: string | null;
  /** Conteúdo de UMA unidade de estoque: 1 un = 1000 g. */
  contentSize?: number | null;
  contentUnit?: string | null;
}

interface SortConfig {
  field: "name" | "quantityOnHand" | "quantityReserved" | "available" | "cost";
  order: "asc" | "desc";
}

export function InventoryGrid(props: InventoryGridProps) {
  const { refreshTrigger } = useEstoque();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "name",
    order: "asc",
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInactiveModal, setShowInactiveModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    name: "",
    baseUnitId: "",
    cost: "",
    itemType: "INGREDIENT",
    initialQuantity: "",
    purchasePackLabel: "",
    purchasePackSize: "",
    contentSize: "",
    contentUnit: "",
  });
  /*
   * As unidades vêm do BANCO, e o select guarda o ID.
   *
   * Antes eram sete opções fixas no código guardando o CÓDIGO ("kg") — e duas
   * delas, "m" e "cm", nem existem no banco. O servidor tentava adivinhar se
   * recebeu código ou id por uma heurística de hífen, e errava nos dois casos.
   */
  const [unidades, setUnidades] = useState<
    Array<{ id: string; code: string; name: string; system: string }>
  >([]);
  const [generatedSku, setGeneratedSku] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: "", show: false });
  /*
   * EMBALAGEM DE COMPRA × UNIDADE DE CONTROLE.
   *
   * O fornecedor vende CAIXA; a receita pede OVO. Sem separar os dois, o
   * cadastro "Ovos, custo 15, quantidade 1" gravava UM ovo custando QUINZE
   * REAIS. A conta mora no servidor; aqui só se mostra o resultado, com a
   * MESMA função — duas fórmulas divergem, uma só não.
   */
  const codigoDaUnidade =
    unidades.find((u) => u.id === newItem.baseUnitId)?.code ?? "";
  const rotuloDaEmbalagem = newItem.purchasePackLabel.trim() || "embalagem";
  const conteudo = conteudoDaEmbalagem(parseFloat(newItem.purchasePackSize));
  const temEmbalagem = conteudo > 1;

  /* O conteúdo de uma unidade de estoque, para a tela repetir de volta o que
     foi digitado: "1 un = 1000 g". */
  const codigoDoConteudo =
    unidades.find((u) => u.id === newItem.contentUnit)?.code ?? "";
  const conteudoDaFicha =
    newItem.contentSize.trim() && codigoDoConteudo
      ? `${newItem.contentSize.trim()} ${codigoDoConteudo}`
      : "";

  /*
   * O CAMPO DE CONTEÚDO SÓ FAZ SENTIDO SOBRE ALGO CONTADO INTEIRO.
   *
   * "1 ml contém 900 ml" não é uma frase com significado — e foi exatamente ela
   * que produziu o óleo a R$ 8,00 o mililitro, e um bolo de R$ 1.046,47. Quem
   * conta o estoque em ml, g, kg ou L já está contando o conteúdo; o que vem na
   * embalagem é COMPRA.
   */
  const unidadeDeEstoque = unidades.find((u) => u.id === newItem.baseUnitId);
  const contaPorUnidades = unidadeDeEstoque?.system === "COUNT";

  /*
   * Cadastro herdado com a combinação errada.
   *
   * NÃO se apaga sozinho. O campo aparece — com o aviso — para que a pessoa
   * veja o que está gravado e decida. Esconder e limpar em silêncio destruiria
   * dado que talvez esteja certo em algum caso que eu não previ.
   */
  const conteudoHerdadoInvalido =
    !contaPorUnidades && newItem.contentSize.trim() !== "";
  const mostrarConteudo = contaPorUnidades || conteudoHerdadoInvalido;

  const compra = calcularCompra({
    embalagens: parseFloat(newItem.initialQuantity),
    conteudoPorEmbalagem: conteudo,
    precoDaEmbalagem: parseFloat(newItem.cost),
  });

  const resumoDaCompra =
    compra.quantidadeEmEstoque > 0 || compra.custoPorUnidade != null ? (
      <>
        {compra.quantidadeEmEstoque > 0 && (
          <div>
            {temEmbalagem ? (
              <>
                <strong>
                  {newItem.initialQuantity} {rotuloDaEmbalagem}
                  {parseFloat(newItem.initialQuantity) > 1 ? "s" : ""}
                </strong>{" "}
                ={" "}
                <strong>
                  {compra.quantidadeEmEstoque.toLocaleString("pt-BR")}{" "}
                  {codigoDaUnidade}
                </strong>{" "}
                no estoque
              </>
            ) : (
              <>
                Entra <strong>
                  {compra.quantidadeEmEstoque.toLocaleString("pt-BR")}{" "}
                  {codigoDaUnidade}
                </strong> no estoque
              </>
            )}
          </div>
        )}
        {compra.custoTotal != null && compra.quantidadeEmEstoque > 0 && (
          <div className="text-neutral-700">
            Custo total:{" "}
            <strong>
              {compra.custoTotal.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </strong>
          </div>
        )}
        {compra.custoPorUnidade != null && (
          <div className="text-neutral-700">
            Custo por {codigoDaUnidade || "unidade"}:{" "}
            <strong>
              {compra.custoPorUnidade.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                minimumFractionDigits: 2,
                // Duas casas, como toda moeda na tela. O valor GRAVADO tem mais
                // casas que isto — R$ 17,00 / 30 = 0,566667 — entao o custo por
                // unidade mostrado x quantidade nao fecha exatamente com o
                // total. Quem manda no calculo e o gravado, nao este texto.
                maximumFractionDigits: 2,
              })}
            </strong>
          </div>
        )}
      </>
    ) : null;

  const inactiveItems = items.filter((item) => !item.isActive);
  const activeItems = items.filter((item) => item.isActive);

  const showToast = (message: string) => {
    setToast({ message, show: true });
    setTimeout(() => setToast({ message: "", show: false }), 3000);
  };

  const fetchUnidades = async () => {
    try {
      const lista = await adminListarUnidades({} as any);
      if (Array.isArray(lista)) setUnidades(lista as any);
    } catch (error) {
      console.error("Falha ao carregar unidades:", error);
    }
  };

  useEffect(() => {
    fetchUnidades();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await adminGetStockReport({
        data: {
          sortBy: sortConfig.field === "quantityOnHand" ? "quantity" : sortConfig.field,
          limit: "100",
          includeInactive: true,
        }
      } as any);
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
  }, [props.storeId, refreshTrigger]);

  const handleSort = (field: SortConfig["field"]) => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === "asc" ? "desc" : "asc",
    }));
  };

  const getSortedAndFilteredItems = () => {
    let filtered = [...activeItems];

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

  const handleEditItem = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name,
      baseUnitId: item.baseUnitId,
      /*
       * O campo de preço pergunta o preço da EMBALAGEM, igual ao cadastro. O
       * que está gravado é o unitário, então multiplica de volta: R$ 0,50 o ovo
       * em caixa de 30 aparece como R$ 15,00 a caixa. Assim reabrir e salvar
       * sem mexer devolve exatamente o mesmo custo — sem isso, cada abertura
       * dividiria o custo por 30 de novo.
       */
      cost:
        item.cost != null
          ? String(item.cost * conteudoDaEmbalagem(item.purchasePackSize))
          : "",
      itemType: item.itemType,
      initialQuantity: "",
      purchasePackLabel: item.purchasePackLabel ?? "",
      purchasePackSize:
        item.purchasePackSize != null ? String(item.purchasePackSize) : "",
      contentSize: item.contentSize != null ? String(item.contentSize) : "",
      contentUnit: item.contentUnit ?? "",
    });
    setShowCreateModal(true);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Tem certeza que deseja deletar este item?")) return;

    try {
      await adminUpdateInventoryItem({
        data: {
          itemId,
          isActive: "false",
        }
      } as any);
      fetchItems();
      showToast("✅ Item deletado com sucesso!");
    } catch (error) {
      console.error("Failed to delete item:", error);
      alert("Erro ao deletar item: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleActivateItem = async (itemId: string) => {
    try {
      await adminUpdateInventoryItem({
        data: {
          itemId,
          isActive: "true",
        }
      } as any);
      fetchItems();
      showToast("✅ Item reativado com sucesso!");
    } catch (error) {
      console.error("Failed to activate item:", error);
      alert("Erro ao reativar item: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleCreateItem = async () => {
    try {
      if (editingItemId) {
        // Modo edição
        await adminUpdateInventoryItem({
          data: {
            itemId: editingItemId,
            name: newItem.name || "",
            /*
             * `precoDaEmbalagem`, e não `cost`: quem divide pelo conteúdo é o
             * serviço. Mandar isto como `cost` gravaria R$ 15,00 como preço do
             * OVO — o erro que a embalagem existe para não cometer.
             */
            precoDaEmbalagem:
              newItem.cost && newItem.cost.trim() ? newItem.cost : undefined,
            purchasePackSize: newItem.purchasePackSize?.trim() ?? "",
            purchasePackLabel: newItem.purchasePackLabel?.trim() ?? "",
            /*
             * Só vai quando o campo está VISÍVEL. Oculto, o payload omite, e
             * omitido significa "não mexa" no servidor — um campo que sumiu da
             * tela não pode apagar dado que ninguém pediu para apagar.
             */
            ...(mostrarConteudo
              ? {
                  contentSize: newItem.contentSize?.trim() ?? "",
                  contentUnit: newItem.contentUnit?.trim() ?? "",
                }
              : {}),
          }
        } as any);
        showToast(`✅ Item "${newItem.name}" atualizado com sucesso!`);
      } else {
        // Modo criação
        const payload = {
          data: {
            name: newItem.name || "",
            baseUnitId: newItem.baseUnitId,
            itemType: newItem.itemType || "INGREDIENT",
            cost: newItem.cost && newItem.cost.trim() ? newItem.cost : "",
            // Vai junto: o servidor cria item e entrada numa operação só, e
            // desfaz o item se a entrada falhar.
            initialQuantity: newItem.initialQuantity?.trim() || undefined,
            purchasePackSize: newItem.purchasePackSize?.trim() || undefined,
            purchasePackLabel: newItem.purchasePackLabel?.trim() || undefined,
            ...(mostrarConteudo
              ? {
                  contentSize: newItem.contentSize?.trim() || undefined,
                  contentUnit: newItem.contentUnit?.trim() || undefined,
                }
              : {}),
          }
        };

        const createdItem = await adminCreateInventoryItem(payload as any);
        const sku = (createdItem as any)?.sku || "gerado";

        const inicial = newItem.initialQuantity?.trim();
        const qtyMsg = inicial ? ` (${inicial})` : "";
        showToast(`✅ Item "${newItem.name}" criado com sucesso! SKU: ${sku}${qtyMsg}`);
      }

      setShowCreateModal(false);
      setEditingItemId(null);
      setNewItem({
        name: "",
        baseUnitId: "",
        cost: "",
        itemType: "INGREDIENT",
        initialQuantity: "",
        purchasePackLabel: "",
        purchasePackSize: "",
        contentSize: "",
        contentUnit: "",
      });
      setGeneratedSku("");
      fetchItems();
    } catch (error) {
      console.error("Failed to create/update item:", error);
      alert("Erro: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  return (
    <div className="inventory-grid space-y-4">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Itens de Estoque</h2>
        <div className="flex gap-2">
          {inactiveItems.length > 0 && (
            <button
              onClick={() => setShowInactiveModal(true)}
              className="px-3 py-2 text-xs bg-neutral-200 text-neutral-900 rounded hover:bg-neutral-300 font-medium"
            >
              🔒 Inativos ({inactiveItems.length})
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
          >
            + Novo Item
          </button>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold">{editingItemId ? "Editar Item" : "Criar Novo Item"}</h3>

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

            {!editingItemId && (
              <div className="bg-blue-50 p-3 rounded">
                <p className="text-sm text-blue-900">
                  ℹ️ <strong>SKU gerado automaticamente</strong> pelo sistema (sem duplicação)
                </p>
              </div>
            )}

            {editingItemId && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Unidade de estoque
                </label>
                {/*
                  Só leitura, e não por preguiça: trocar a unidade
                  reinterpretaria em silêncio o saldo, o custo e todo movimento
                  já gravado. O servidor descarta o campo mesmo se ele vier.
                */}
                <input
                  value={codigoDaUnidade}
                  disabled
                  className="w-full px-3 py-2 border rounded bg-neutral-100 text-neutral-700"
                />
                <p className="text-xs text-neutral-600 mt-1">
                  A unidade não muda depois do cadastro — o saldo e o histórico
                  estão contados nela.
                </p>
              </div>
            )}

            {!editingItemId && (
              <div>
                <label className="block text-sm font-medium mb-1">Unidade *</label>
                <select
                  value={newItem.baseUnitId}
                  onChange={(e) => setNewItem({ ...newItem, baseUnitId: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded bg-background text-foreground"
                >
                  <option value="">Selecione…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} ({u.name.toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Também na edição: o item já existe e só agora se soube que vem
                em caixa de 30. */}
            {(
              <div>
                <label className="block text-sm font-medium mb-1">
                  Compra em embalagem? (Opcional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newItem.purchasePackLabel}
                    onChange={(e) =>
                      setNewItem({ ...newItem, purchasePackLabel: e.target.value })
                    }
                    placeholder="caixa"
                    className="px-3 py-2 border rounded bg-background text-foreground"
                  />
                  <input
                    type="number"
                    value={newItem.purchasePackSize}
                    onChange={(e) =>
                      setNewItem({ ...newItem, purchasePackSize: e.target.value })
                    }
                    placeholder="30"
                    step="0.0001"
                    min="0"
                    className="px-3 py-2 border rounded bg-background text-foreground text-right"
                  />
                </div>
                {/*
                  Este par separa "o que o fornecedor vende" de "como eu conto no
                  estoque". Sem ele, "Ovos, custo 15, quantidade 1" virava UM ovo
                  custando QUINZE REAIS.
                */}
                <p className="text-xs text-neutral-600 mt-1">
                  Nome da embalagem e quantas {codigoDaUnidade || "unidades"} vêm
                  dentro. Ex.: <strong>caixa</strong> com <strong>30</strong>. Em
                  branco, você compra direto em {codigoDaUnidade || "unidade"}.
                </p>
              </div>
            )}

            {/*
              CONTEÚDO DA EMBALAGEM — o oposto do campo acima.

              Ali se diz "compro em caixa de 30 ovos" e o número MULTIPLICA a
              entrada. Aqui se diz "cada pacote que eu conto tem 1000 g" e o
              número DIVIDE o que a receita pede. É o que deixa o estoque
              continuar em pacotes — como se compra e como se vê na
              prateleira — enquanto a ficha fala em gramas.
            */}
            {mostrarConteudo && (
              <div>
              <label className="block text-sm font-medium mb-1">
                O que vem dentro de 1 {codigoDaUnidade || "unidade"}?
                (Opcional)
              </label>
              {conteudoHerdadoInvalido && (
                <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-2">
                  <strong>Este cadastro precisa ser corrigido.</strong> Este item
                  é contado em <strong>{codigoDaUnidade}</strong>, que é uma
                  medida — então ele não tem “conteúdo dentro de uma unidade”. O
                  que está aqui provavelmente descreve a embalagem que você
                  compra: apague este campo e informe o valor em{" "}
                  <strong>“Compra em embalagem”</strong>, acima. Nada foi
                  alterado sozinho.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={newItem.contentSize}
                  onChange={(e) =>
                    setNewItem({ ...newItem, contentSize: e.target.value })
                  }
                  placeholder="1000"
                  step="0.0001"
                  min="0"
                  className="px-3 py-2 border rounded bg-background text-foreground text-right"
                />
                <select
                  value={newItem.contentUnit}
                  onChange={(e) =>
                    setNewItem({ ...newItem, contentUnit: e.target.value })
                  }
                  className="px-3 py-2 border rounded bg-background text-foreground"
                >
                  <option value="">unidade do conteúdo…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} ({u.name.toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>
              {conteudoDaFicha ? (
                <p className="text-xs text-neutral-700 mt-1">
                  <strong>
                    1 {codigoDaUnidade || "unidade"} = {conteudoDaFicha}
                  </strong>
                  . Uma receita que pedir esse insumo em{" "}
                  {codigoDoConteudo} passa a ser convertida sozinha.
                </p>
              ) : (
                <p className="text-xs text-neutral-600 mt-1">
                  Preencha só se a receita usar uma unidade diferente da do
                  estoque. Ex.: estoque em <strong>un</strong> (pacotes) e
                  receita em <strong>g</strong> — informe{" "}
                  <strong>1000</strong> e <strong>g</strong>.
                </p>
              )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                {temEmbalagem
                  ? `Preço de 1 ${rotuloDaEmbalagem} (Opcional)`
                  : "Preço por unidade (Opcional)"}
              </label>
              <input
                type="number"
                value={newItem.cost}
                onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })}
                placeholder="Ex: 5.50"
                step="0.01"
                className="w-full px-3 py-2 border rounded bg-background text-foreground"
              />
              {/*
                Na edição não há quantidade inicial, então o resumo da compra
                não aparece — mas o número que importa é este, e ele precisa
                estar à vista na hora de digitar: R$ 15,00 a caixa de 30 tem
                que virar R$ 0,50 o ovo, e nunca R$ 15,00 o ovo.
              */}
              {editingItemId && compra.custoPorUnidade != null && (
                <p className="text-sm text-neutral-800 mt-1">
                  Custo por {codigoDaUnidade || "unidade"}:{" "}
                  <strong>
                    {compra.custoPorUnidade.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  {temEmbalagem && (
                    <span className="text-neutral-600">
                      {" "}({rotuloDaEmbalagem} de{" "}
                      {conteudo.toLocaleString("pt-BR")})
                    </span>
                  )}
                </p>
              )}
            </div>

            {!editingItemId && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {temEmbalagem
                    ? `Quantas ${rotuloDaEmbalagem}s você tem hoje? (Opcional)`
                    : "Quantidade Inicial (Opcional)"}
                </label>
                <input
                  type="number"
                  value={newItem.initialQuantity}
                  onChange={(e) => setNewItem({ ...newItem, initialQuantity: e.target.value })}
                  placeholder="Ex: 10"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded bg-background text-foreground"
                />
                <p className="text-xs text-neutral-600 mt-1">
                  Entra no estoque como uma compra.
                </p>
                {resumoDaCompra && (
                  <div className="mt-2 p-2 rounded border border-neutral-300 bg-white text-sm space-y-0.5">
                    {resumoDaCompra}
                  </div>
                )}
              </div>
            )}

            {!editingItemId && (
              <div>
                <label className="block text-sm font-medium mb-1">Tipo *</label>
                <select
                  value={newItem.itemType}
                  onChange={(e) => setNewItem({ ...newItem, itemType: e.target.value })}
                  className="w-full px-3 py-2 border rounded bg-background text-foreground"
                >
                  <option value="INGREDIENT">🧪 Ingrediente</option>
                  <option value="RESALE">🛒 Revenda</option>
                  <option value="PREPARED">🍲 Preparado</option>
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
                {newItem.itemType === "PREPARED" && (
                  <>
                    <strong>🍲 Preparado:</strong> O que a cozinha PRODUZ a partir de outros itens.
                    <br />
                    Exemplos: Molho de tomate, Massa fresca, Recheio. Tem ficha técnica e rendimento, e o custo sai da produção.
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
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingItemId(null);
                  setNewItem({
                    name: "",
                    baseUnitId: "",
                    cost: "",
                    itemType: "INGREDIENT",
                    initialQuantity: "",
                    purchasePackLabel: "",
                    purchasePackSize: "",
                    contentSize: "",
                    contentUnit: "",
                  });
                }}
                className="px-4 py-2 border rounded hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateItem}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                {editingItemId ? "Salvar Alterações" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInactiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full space-y-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Itens Inativos ({inactiveItems.length})</h3>
              <button
                onClick={() => setShowInactiveModal(false)}
                className="text-xl text-neutral-600 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            {inactiveItems.length === 0 ? (
              <p className="text-neutral-600 text-center py-4">Nenhum item inativo</p>
            ) : (
              <div className="space-y-2">
                {inactiveItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded bg-neutral-50 hover:bg-neutral-100">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-neutral-600">{item.sku}</p>
                    </div>
                    <button
                      onClick={() => {
                        handleActivateItem(item.id);
                        setShowInactiveModal(false);
                      }}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Ativar
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              <th className="px-4 py-2 text-right">Qtd sendo Usado em Produtos</th>
              <th className="px-4 py-2 text-right">Custo Unit.</th>
              <th className="px-4 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {getSortedAndFilteredItems().map((item) => {
              const threshold = Number((item as any).maximumQuantity ?? 0) * 0.3;
              const isLowStock = Number(item.quantityOnHand ?? 0) <= threshold && threshold > 0;

              return (
              <tr key={item.id} className={`${item.isActive ? "" : "opacity-50"} ${isLowStock ? "border-2 border-red-500" : ""}`}>
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2 text-sm text-neutral-600">
                  {item.sku || item.barcode || "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {item.quantityOnHand.toFixed(2)} {item.baseUnit.code}
                </td>
                <td className="px-4 py-2 text-right text-amber-600">
                  {((item as any).quantityUsedInRecipes ?? 0).toFixed(2)} {item.baseUnit.code}
                </td>
                <td className="px-4 py-2 text-right">R$ {(item.cost ?? 0).toFixed(2)}</td>
                <td className="px-4 py-2 text-center space-x-3">
                  <button
                    className="text-xs text-black hover:underline"
                    onClick={() => handleEditItem(item)}
                  >
                    Editar
                  </button>
                  <button
                    className="text-xs text-black hover:underline"
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    Deletar
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-neutral-600 mt-4">Carregando...</p>}
    </div>
  );
}
