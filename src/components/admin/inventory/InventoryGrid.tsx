import { useEffect, useState } from "react";
import { statusDoEstoque, rotuloDoStatus } from "@/lib/status-do-estoque";
import { adminCreateInventoryItem, adminUpdateInventoryItem, adminListarUnidades } from "@/server/functions/inventory.fn";
import {
  calcularCompra,
  conteudoDaEmbalagem,
} from "@/lib/embalagem-de-compra";
import { deveMostrarConteudo } from "@/lib/embalagem-vs-conteudo";
import { quantidade, moeda, custoPorUnidade } from "@/lib/formato";
import {
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  PackageOpen,
  Plus,
  Archive,
} from "lucide-react";
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
  /** O piso que dispara o alerta, na unidade base. Nulo = sem alerta. */
  minimumThreshold?: number | null;
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
  const [busca, setBusca] = useState("");
  /** Qual linha está com o menu ⋯ aberto. Uma por vez. */
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "name",
    order: "asc",
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInactiveModal, setShowInactiveModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  /*
   * O conteúdo GRAVADO no item que está sendo editado, separado do que está no
   * formulário. É ele que mantém o campo na tela depois de esvaziado — sem
   * isso, apagar o valor escondia o campo e a limpeza nunca chegava a ser
   * enviada.
   */
  const [conteudoGravado, setConteudoGravado] = useState(false);
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
    minimumThreshold: "",
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
  const mostrarConteudo = deveMostrarConteudo({
    contaPorUnidades,
    temConteudoGravado: conteudoGravado,
    conteudoDigitado: newItem.contentSize,
  });
  /** O aviso vermelho: só quando o que está gravado é de fato incoerente. */
  const conteudoHerdadoInvalido = !contaPorUnidades && conteudoGravado;

  /*
   * O resumo só aparece quando há o que resumir. Um bloco com "Sem nome" e
   * nada mais atrapalharia em vez de ajudar.
   */
  const resumoPreenchido =
    newItem.name.trim() !== "" ||
    newItem.baseUnitId !== "" ||
    newItem.cost.trim() !== "";

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

  /*
   * OS QUATRO TIPOS, com rótulo em português e cor discreta.
   *
   * O tipo existia no banco e não aparecia em lugar nenhum da tabela: um
   * preparado e um ingrediente tinham exatamente a mesma cara. Cores fracas
   * de propósito — servem para separar de relance, não para chamar atenção.
   */
  const TIPOS: Record<string, { rotulo: string; cor: string }> = {
    PREPARED: {
      rotulo: "Preparado",
      cor: "border-violet-200 bg-violet-50 text-violet-700",
    },
    RESALE: {
      rotulo: "Revenda",
      cor: "border-sky-200 bg-sky-50 text-sky-700",
    },
    INGREDIENT: {
      rotulo: "Ingrediente",
      cor: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    PACKAGING: {
      rotulo: "Embalagem",
      cor: "border-amber-200 bg-amber-50 text-amber-700",
    },
  };

  /*
   * A explicação de cada tipo, com exemplos do próprio ramo.
   *
   * Antes as quatro apareciam numa caixa verde embaixo do select. Mostrar as
   * três que não foram escolhidas é ruído: quem marcou "Ingrediente" não
   * precisa ler o que é "Embalagem".
   */
  const EXPLICACAO_DO_TIPO: Record<string, string> = {
    INGREDIENT:
      "Entra direto nas receitas — farinha, ovos, leite, chocolate.",
    RESALE:
      "Comprado pronto e vendido como veio — refrigerante, cerveja, água.",
    PREPARED:
      "A cozinha produz a partir de outros itens — molho, massa, recheio.",
    PACKAGING:
      "Acompanha o pedido sem ser comida — embalagem, guardanapo, sacola.",
  };

  /** A setinha de ordenação, para o cabeçalho não repetir o mesmo ternário. */
  const seta = (campo: SortConfig["field"]) =>
    sortConfig.field === campo ? (sortConfig.order === "asc" ? "↑" : "↓") : "↕";

  const temFiltro = busca.trim() !== "" || filterType !== "";

  /*
   * PREPARADOS NÃO APARECEM AQUI — eles têm aba própria.
   *
   * Um Bolo de Chocolate É um item de estoque por dentro: tem saldo, tem custo,
   * e é para onde o produto de cardápio aponta. Mas quem cuida dele é a aba
   * Preparados, que sabe de receita, rendimento e corrida de produção. Listá-lo
   * também aqui não dá informação nova; dá a impressão de dois cadastros.
   *
   * O FILTRO É SÓ DESTA TELA, e de propósito. `adminGetStockReport` serve
   * outros três lugares que PRECISAM enxergar preparado: o CompositionBuilder
   * (uma receita pode levar um preparado), o MovementForm (registrar perda de
   * um bolo) e o seletor "Controla estoque por" do cardápio — esse último por
   * outra função, `adminListarItensParaVinculo`, que continua vendo tudo.
   *
   * Filtrar no servidor cegaria os três de uma vez.
   */
  const inactiveItems = items.filter((item) => !item.isActive);
  const activeItems = items.filter(
    (item) => item.isActive && item.itemType !== "PREPARED",
  );

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

    /*
     * Busca por nome ou SKU, sem acento e sem caixa: quem procura "acucar"
     * quer achar "Açúcar", e quem cola um SKU quer achar o item.
     */
    const termo = busca.trim().toLowerCase();
    if (termo) {
      const semAcento = (t: string) =>
        t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const alvo = semAcento(termo);
      filtered = filtered.filter(
        (item) =>
          semAcento(item.name).includes(alvo) ||
          (item.sku ?? "").toLowerCase().includes(termo),
      );
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

  /** A lista já filtrada e ordenada, calculada uma vez por render. */
  const visiveis = getSortedAndFilteredItems();

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
      minimumThreshold:
        item.minimumThreshold != null ? String(item.minimumThreshold) : "",
    });
    setConteudoGravado(item.contentSize != null);
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
            /*
             * VAZIO SIGNIFICA "SEM ALERTA", e não zero.
             *
             * Nulo e zero são estados diferentes: nulo é "não configurei
             * alerta"; zero é um mínimo legítimo. Mandar `0` quando o campo
             * está em branco transformaria todo item nunca configurado num
             * alerta permanente — que é justamente o que a regra evita.
             */
            minimumThreshold:
              newItem.minimumThreshold?.trim() === ""
                ? null
                : Number(newItem.minimumThreshold),
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
            // Em branco não vai: o item nasce sem alerta configurado.
            ...(newItem.minimumThreshold?.trim()
              ? { minimumThreshold: Number(newItem.minimumThreshold) }
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
      setConteudoGravado(false);
      setNewItem({
        name: "",
        baseUnitId: "",
        cost: "",
        itemType: "INGREDIENT",
        minimumThreshold: "",
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
      {/*
        CABEÇALHO: um título, uma frase, uma ação principal.

        "Novo Item" é sólido porque é o que se faz aqui todo dia; "Inativos" é
        fantasma porque é consulta ocasional, e disputar atenção com o CTA só
        atrasaria as duas coisas.
      */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Itens de Estoque</h2>
          <p className="text-sm text-neutral-600 mt-0.5">
            O que a cozinha compra, produz e revende — com saldo e custo por
            unidade.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveItems.length > 0 && (
            <button
              onClick={() => setShowInactiveModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Archive className="size-4" />
              Inativos
              <span className="rounded-full bg-neutral-100 px-1.5 text-xs tabular-nums">
                {inactiveItems.length}
              </span>
            </button>
          )}
          <button
            onClick={() => {
              // Comeca limpo: sem isto, abrir "Novo Item" logo depois de
              // editar herdaria o estado do item anterior.
              setEditingItemId(null);
              setConteudoGravado(false);
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            <Plus className="size-4" />
            Novo Item
          </button>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            {/* CABEÇALHO fixo: o formulário rola, o título fica. */}
            <div className="border-b border-neutral-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                {editingItemId ? "Editar item" : "Novo item de estoque"}
              </h3>
              <p className="mt-0.5 text-sm text-neutral-600">
                {editingItemId
                  ? "A unidade de estoque não muda depois do cadastro."
                  : "Cadastre o que a cozinha compra, para o sistema saber o custo."}
              </p>
            </div>

            <div className="max-h-[65vh] space-y-6 overflow-y-auto px-6 py-5">
              {/* ───── 1. INFORMAÇÕES BÁSICAS ───── */}
              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">
                    1. O que é este item
                  </h4>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Nome *
                  </label>
                  <input
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="Ex.: Farinha de Trigo"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
                  />
                </div>

                {!editingItemId && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Tipo *
                    </label>
                    <select
                      value={newItem.itemType}
                      onChange={(e) =>
                        setNewItem({ ...newItem, itemType: e.target.value })
                      }
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
                    >
                      <option value="INGREDIENT">Ingrediente</option>
                      <option value="RESALE">Revenda</option>
                      <option value="PREPARED">Preparado</option>
                      <option value="PACKAGING">Embalagem</option>
                    </select>
                    {/* A explicação muda com a escolha, em vez de listar as quatro. */}
                    <p className="mt-1 text-xs text-neutral-600">
                      {EXPLICACAO_DO_TIPO[newItem.itemType]}
                    </p>
                  </div>
                )}

                {!editingItemId && (
                  <p className="text-xs text-neutral-500">
                    O código (SKU) é gerado automaticamente, sem repetir.
                  </p>
                )}
              </section>

              {/* ───── 2. COMO O ESTOQUE É CONTADO ───── */}
              <section className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">
                    2. Como você conta este item no estoque
                  </h4>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    É a unidade em que o saldo e o custo ficam guardados. Não
                    muda depois.
                  </p>
                </div>

                {editingItemId ? (
                  <div>
                    <input
                      value={codigoDaUnidade}
                      disabled
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-700"
                    />
                    <p className="mt-1 text-xs text-neutral-600">
                      O saldo e o histórico estão contados nela.
                    </p>
                  </div>
                ) : (
                  <div>
                    <select
                      value={newItem.baseUnitId}
                      onChange={(e) =>
                        setNewItem({ ...newItem, baseUnitId: e.target.value })
                      }
                      required
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
                    >
                      <option value="">Selecione…</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} — {u.name.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-neutral-600">
                      <strong>kg</strong> para farinha e açúcar ·{" "}
                      <strong>L</strong> para leite e óleo a granel ·{" "}
                      <strong>un</strong> para ovos, garrafas e latas
                    </p>
                    {/*
                      A TRANQUILIZAÇÃO QUE FALTAVA, e que só agora é verdade.

                      Escolher kg parecia condenar toda receita a ser escrita em
                      kg — e era isso mesmo, enquanto a ficha técnica copiava a
                      unidade do estoque sem deixar trocar. Quem cadastrava
                      açúcar escolhia "un" para poder escrever "1" na receita.
                      Dizer aqui que a receita aceita a subunidade tira o motivo
                      de errar o cadastro.
                    */}
                    <p className="mt-1 text-xs text-neutral-500">
                      A receita pode usar a subunidade: estoque em{" "}
                      <strong>kg</strong> aceita ingrediente em <strong>g</strong>,
                      e <strong>L</strong> aceita <strong>ml</strong>. O sistema
                      converte sozinho.
                    </p>

                    {/*
                      O MÍNIMO FICA JUNTO DA UNIDADE, e não numa seção própria.

                      Ele é lido NA MESMA unidade escolhida logo acima, e essa é
                      a única armadilha do campo: quem estoca em kg e digita
                      "300" pensando em gramas define um mínimo de 300 quilos. O
                      código da unidade ao lado do campo existe para isso — não
                      há conversão aqui, e não deve haver.

                      Vazio significa "sem alerta", que é diferente de zero.
                    */}
                    <div className="mt-3 border-t border-neutral-200 pt-3">
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Estoque mínimo (opcional)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newItem.minimumThreshold}
                          onChange={(e) =>
                            setNewItem({ ...newItem, minimumThreshold: e.target.value })
                          }
                          placeholder="3"
                          step="0.0001"
                          min="0"
                          className="w-32 rounded-lg border border-neutral-200 px-3 py-2 text-right text-sm text-neutral-900 placeholder:text-neutral-400"
                        />
                        <span className="text-sm font-medium text-neutral-700">
                          {codigoDaUnidade || "—"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-600">
                        {newItem.minimumThreshold.trim() && codigoDaUnidade ? (
                          <>
                            Avisa quando sobrarem{" "}
                            <strong>
                              {newItem.minimumThreshold.trim()} {codigoDaUnidade}
                            </strong>{" "}
                            ou menos, já descontando o que está reservado para
                            pedidos.
                          </>
                        ) : (
                          <>
                            Em branco, este item nunca gera alerta de estoque
                            baixo. O valor é sempre na unidade acima.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* ───── 3. COMO VOCÊ COMPRA ───── */}
              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">
                    3. Como você compra
                  </h4>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    Preencha se você compra em embalagem fechada. Em branco,
                    você compra direto em {codigoDaUnidade || "unidade"}.
                  </p>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">
                      Nome da embalagem
                    </label>
                    <input
                      value={newItem.purchasePackLabel}
                      onChange={(e) =>
                        setNewItem({ ...newItem, purchasePackLabel: e.target.value })
                      }
                      placeholder="caixa, saco, fardo…"
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">
                      Quantos {codigoDaUnidade || "un"} vêm nela
                    </label>
                    <input
                      type="number"
                      value={newItem.purchasePackSize}
                      onChange={(e) =>
                        setNewItem({ ...newItem, purchasePackSize: e.target.value })
                      }
                      placeholder="6"
                      step="0.0001"
                      min="0"
                      className="w-32 rounded-lg border border-neutral-200 px-3 py-2 text-right text-sm text-neutral-900 placeholder:text-neutral-400"
                    />
                  </div>
                </div>

                {temEmbalagem && (
                  <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
                    Você compra <strong>1 {rotuloDaEmbalagem}</strong> com{" "}
                    <strong>
                      {quantidade(conteudo)} {codigoDaUnidade}
                    </strong>
                    . O estoque é controlado em{" "}
                    <strong>{codigoDaUnidade}</strong>.
                  </p>
                )}

                {/*
                  CONTEÚDO DA UNIDADE — campo diferente da embalagem acima, e o
                  rótulo precisa deixar isso inconfundível. Ali se diz "quantas
                  unidades vêm na caixa"; aqui, "quanto pesa cada unidade". Foi
                  a confusão entre os dois que gerou óleo a R$ 8,00 o mililitro.
                */}
                {mostrarConteudo && (
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Cada {codigoDaUnidade || "unidade"} contém (opcional)
                    </label>
                    {conteudoHerdadoInvalido && (
                      <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                        <strong>Este cadastro precisa ser corrigido.</strong>{" "}
                        Este item é contado em{" "}
                        <strong>{codigoDaUnidade}</strong>, que é uma medida —
                        então ele não tem “conteúdo dentro de uma unidade”. O que
                        está aqui provavelmente descreve a embalagem: apague este
                        campo e informe o valor acima. Nada foi alterado sozinho.
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
                        className="rounded-lg border border-neutral-200 px-3 py-2 text-right text-sm text-neutral-900 placeholder:text-neutral-400"
                      />
                      <select
                        value={newItem.contentUnit}
                        onChange={(e) =>
                          setNewItem({ ...newItem, contentUnit: e.target.value })
                        }
                        className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
                      >
                        <option value="">unidade…</option>
                        {unidades.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">
                      {conteudoDaFicha ? (
                        <>
                          <strong>
                            1 {codigoDaUnidade} = {conteudoDaFicha}
                          </strong>
                          . Uma receita que pedir em {codigoDoConteudo} passa a
                          ser convertida sozinha.
                        </>
                      ) : (
                        <>
                          Preencha só se a receita usar peso ou volume. Ex.:
                          estoque em <strong>un</strong> (pacotes) e receita em{" "}
                          <strong>g</strong> — informe 1000 e g.
                        </>
                      )}
                    </p>
                  </div>
                )}
              </section>

              {/* ───── 4. CUSTO E ESTOQUE INICIAL ───── */}
              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">
                    4. Quanto custa e quanto você tem
                  </h4>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    {temEmbalagem
                      ? "Preço de 1 " + rotuloDaEmbalagem + " (opcional)"
                      : "Preço por " + (codigoDaUnidade || "unidade") + " (opcional)"}
                  </label>
                  <input
                    type="number"
                    value={newItem.cost}
                    onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })}
                    placeholder="25,00"
                    step="0.01"
                    min="0"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
                  />
                  {compra.custoPorUnidade != null ? (
                    <p className="mt-1.5 text-xs text-neutral-700">
                      {temEmbalagem ? (
                        <>
                          Você paga{" "}
                          <strong>{moeda(parseFloat(newItem.cost))}</strong> por
                          esta {rotuloDaEmbalagem} de {quantidade(conteudo)}{" "}
                          {codigoDaUnidade}. Custo:{" "}
                          <strong>
                            {custoPorUnidade(compra.custoPorUnidade, codigoDaUnidade)}
                          </strong>
                        </>
                      ) : (
                        <>
                          Você paga{" "}
                          <strong>
                            {custoPorUnidade(compra.custoPorUnidade, codigoDaUnidade)}
                          </strong>{" "}
                          por cada {codigoDaUnidade || "unidade"} no estoque.
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-neutral-600">
                      {temEmbalagem
                        ? "O preço da embalagem inteira — o sistema divide pelo conteúdo."
                        : "O preço de uma " + (codigoDaUnidade || "unidade") + "."}
                    </p>
                  )}
                </div>

                {!editingItemId && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      {temEmbalagem
                        ? "Quantas " + rotuloDaEmbalagem + "s você tem hoje? (opcional)"
                        : "Quanto você tem hoje? (opcional)"}
                    </label>
                    <input
                      type="number"
                      value={newItem.initialQuantity}
                      onChange={(e) =>
                        setNewItem({ ...newItem, initialQuantity: e.target.value })
                      }
                      placeholder="10"
                      step="0.01"
                      min="0"
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
                    />
                    <p className="mt-1 text-xs text-neutral-600">
                      Entra no estoque como uma compra. Pode deixar em branco e
                      registrar depois.
                    </p>
                  </div>
                )}
              </section>

              {/*
                RESUMO: a frase inteira, montada com o que já foi digitado.
                Ler "1 saco com 25 kg, R$ 6,00 / kg" antes de salvar pega o
                erro que nenhum campo isolado denuncia.
              */}
              {resumoPreenchido && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Resumo
                  </p>
                  <p className="font-medium text-neutral-900">
                    {newItem.name || "Sem nome"}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    {EXPLICACAO_DO_TIPO[newItem.itemType]
                      ? (TIPOS[newItem.itemType]?.rotulo ?? newItem.itemType)
                      : newItem.itemType}
                    {codigoDaUnidade ? " · " + codigoDaUnidade : ""}
                  </p>
                  <dl className="mt-3 space-y-1 text-sm">
                    {temEmbalagem && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-neutral-600">Compra</dt>
                        <dd className="text-right text-neutral-900">
                          {rotuloDaEmbalagem} com {quantidade(conteudo)}{" "}
                          {codigoDaUnidade}
                        </dd>
                      </div>
                    )}
                    {conteudoDaFicha && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-neutral-600">Cada {codigoDaUnidade}</dt>
                        <dd className="text-right text-neutral-900">
                          {conteudoDaFicha}
                        </dd>
                      </div>
                    )}
                    {compra.custoPorUnidade != null && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-neutral-600">Custo</dt>
                        <dd className="text-right font-medium text-neutral-900">
                          {custoPorUnidade(compra.custoPorUnidade, codigoDaUnidade)}
                        </dd>
                      </div>
                    )}
                    {!editingItemId && compra.quantidadeEmEstoque > 0 && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-neutral-600">Estoque inicial</dt>
                        <dd className="text-right text-neutral-900">
                          {quantidade(compra.quantidadeEmEstoque)} {codigoDaUnidade}
                          {temEmbalagem ? " (" + newItem.initialQuantity + " " + rotuloDaEmbalagem + ")" : ""}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>

            {/* RODAPÉ fixo: as ações não somem quando o formulário rola. */}
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-6 py-4">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingItemId(null);
                  setConteudoGravado(false);
                  setNewItem({
                    name: "",
                    baseUnitId: "",
                    cost: "",
                    itemType: "INGREDIENT",
                    minimumThreshold: "",
                    initialQuantity: "",
                    purchasePackLabel: "",
                    purchasePackSize: "",
                    contentSize: "",
                    contentUnit: "",
                  });
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateItem}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                {editingItemId ? "Salvar alterações" : "Criar item"}
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

      {/*
        FILTROS EM UMA BARRA SÓ.

        Antes o select de tipo flutuava solto acima da tabela, sem busca. Com
        dez itens dava para varrer com o olho; com cem, não. E "Preparado" nem
        estava na lista — o tipo existia no banco e não no filtro.
      */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou SKU…"
              className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 sm:w-52"
          >
            <option value="">Todos os tipos</option>
            <option value="RESALE">Revenda</option>
            <option value="INGREDIENT">Ingrediente</option>
            <option value="PACKAGING">Embalagem</option>
          </select>
          {temFiltro && (
            <button
              onClick={() => {
                setBusca("");
                setFilterType("");
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Limpar
            </button>
          )}
        </div>
        {temFiltro && (
          <p className="mt-2 text-xs text-neutral-600">
            {visiveis.length}{" "}
            {visiveis.length === 1 ? "item encontrado" : "itens encontrados"} de{" "}
            {activeItems.length}
          </p>
        )}
      </div>

      {/* CARREGANDO: esqueleto no lugar do texto, para a página não pular. */}
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50"
            />
          ))}
        </div>
      )}

      {/*
        VAZIO: dois estados diferentes, e a diferença importa. "Nenhum item
        cadastrado" pede um cadastro; "nada encontrado" pede outra busca.
      */}
      {!loading && visiveis.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
          <PackageOpen className="mx-auto size-8 text-neutral-300" />
          {temFiltro ? (
            <>
              <p className="mt-3 text-sm font-medium text-neutral-900">
                Nenhum item encontrado
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Tente outro termo ou limpe os filtros.
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm font-medium text-neutral-900">
                Nenhum item no estoque ainda
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Cadastre o primeiro insumo para começar a controlar custo.
              </p>
            </>
          )}
        </div>
      )}

      {!loading && visiveis.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {/*
            CABEÇALHO SÓ EM TELA GRANDE. Abaixo de md cada item vira um card, e
            um cabeçalho de tabela sem tabela embaixo não significa nada.
          */}
          <div className="hidden border-b border-neutral-200 bg-neutral-50 md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_auto] md:gap-4 md:px-4 md:py-2.5">
            <button
              onClick={() => handleSort("name")}
              className="flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600 hover:text-neutral-900"
            >
              Item {seta("name")}
            </button>
            <button
              onClick={() => handleSort("quantityOnHand")}
              className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 hover:text-neutral-900"
            >
              Estoque {seta("quantityOnHand")}
            </button>
            <button
              onClick={() => handleSort("cost")}
              className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 hover:text-neutral-900"
            >
              Custo {seta("cost")}
            </button>
            <span className="w-9" />
          </div>

          <div>
            {visiveis.map((item) => {
              /*
                O CÁLCULO DO ESTOQUE BAIXO É O MESMO DE ANTES, linha por linha.
                Só a apresentação mudou: o ponto colorido de 6px ao lado do
                número saiu e a linha INTEIRA voltou a receber borda vermelha.
                Um ponto de 6px depende de o olho já estar naquela coluna; a
                borda é vista ao correr a lista, que é quando o alerta serve.

                A borda mora aqui e não no `divide-y` do contêiner: uma regra
                `.divide-neutral-100 > * ~ *` tem especificidade maior que a
                classe da linha e repintaria a borda vermelha de cinza. Por
                isso o separador virou `border-t` por linha.
              */
              /*
                A REGRA DOS 30% SAIU DAQUI.

                Era `onHand <= maximumQuantity * 0,3` — um limiar tirado do
                maior saldo ja alcancado. So que `maximumQuantity` nunca
                recebeu valor: o unico escritor, `updateMaximumQuantityIfNeeded`,
                nao tem chamador, e nao ha campo na tela. O limiar era sempre
                zero, a guarda `threshold > 0` nunca passava, e o ponto ambar
                nunca acendeu.

                Agora o estado vem de `statusDoEstoque`, a mesma funcao que o
                painel e os relatorios usam — e considera o RESERVADO, que esta
                regra ignorava.
              */
              const estado = statusDoEstoque(item as any);
              /*
                UM SÓ PREDICADO PARA AS DUAS SITUAÇÕES DE ALERTA. `NORMAL` é o
                único estado sem alerta — escrever `LOW_STOCK || OUT_OF_STOCK`
                cria uma lista que alguém precisa lembrar de atualizar se a
                fonte única ganhar um terceiro estado de alerta um dia.
              */
              const emAlerta = estado.status !== "NORMAL";
              const usado = Number((item as any).quantityUsedInRecipes ?? 0);
              const tipo = TIPOS[item.itemType] ?? TIPOS.INGREDIENT;

              return (
                <div
                  key={item.id}
                  data-alerta={emAlerta ? estado.status : undefined}
                  title={rotuloDoStatus(estado.status) ?? undefined}
                  className={`px-4 py-3 hover:bg-neutral-50/60 md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_auto] md:items-center md:gap-4 ${
                    emAlerta
                      ? "my-1 rounded-lg border-2 border-red-500 bg-red-50/40"
                      : "border-t border-neutral-100 first:border-t-0"
                  } ${item.isActive ? "" : "opacity-60"}`}
                >
                  {/* ITEM */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-neutral-900">
                        {item.name}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tipo.cor}`}
                      >
                        {tipo.rotulo}
                      </span>
                      {!item.isActive && (
                        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {item.sku || item.barcode || "sem SKU"}
                    </p>
                  </div>

                  {/* ESTOQUE */}
                  <div className="mt-2 flex items-baseline gap-2 md:mt-0 md:flex-col md:items-end md:gap-0">
                    <span className="text-xs text-neutral-500 md:hidden">
                      Estoque
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold tabular-nums text-neutral-900">
                        {quantidade(item.quantityOnHand)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {item.baseUnit.code}
                      </span>
                    </span>
                    {usado > 0 && (
                      <span className="text-xs text-neutral-500 md:mt-0.5">
                        {quantidade(usado)} {item.baseUnit.code} nas fichas
                      </span>
                    )}
                  </div>

                  {/* CUSTO */}
                  <div className="mt-1 flex items-baseline gap-2 md:mt-0 md:justify-end">
                    <span className="text-xs text-neutral-500 md:hidden">Custo</span>
                    <span className="tabular-nums text-neutral-900">
                      {custoPorUnidade(item.cost, item.baseUnit.code)}
                    </span>
                  </div>

                  {/* AÇÕES */}
                  <div className="relative mt-2 flex justify-end md:mt-0">
                    <button
                      onClick={() =>
                        setMenuAberto(menuAberto === item.id ? null : item.id)
                      }
                      aria-label={`Ações de ${item.name}`}
                      className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                    {menuAberto === item.id && (
                      <>
                        {/*
                          Camada que fecha ao clicar fora. Deletar é destrutivo,
                          e deixá-lo a um clique num menu que não fecha convida
                          ao acidente.
                        */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuAberto(null)}
                        />
                        <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                          <button
                            onClick={() => {
                              setMenuAberto(null);
                              handleEditItem(item);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                          >
                            <Pencil className="size-3.5" />
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              setMenuAberto(null);
                              // Mesma função de antes: a confirmação e as
                              // validações do servidor seguem onde estavam.
                              handleDeleteItem(item.id);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="size-3.5" />
                            Deletar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
