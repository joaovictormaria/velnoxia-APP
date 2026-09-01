import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  InventoryGrid,
  MovementForm,
  CompositionBuilder,
  AuditLog,
  StockChart,
  ReportsDashboard,
} from "@/components/admin/inventory";
import { EstoqueProvider } from "@/lib/estoque-store";
import {
  rotaBloqueada,
  TelaDeRecursoPremium,
} from "@/components/admin/planos/rota-premium";
import type { Recurso } from "@/lib/planos/tipos";
import { PreparadosTab } from "@/components/admin/inventory/PreparadosTab";
import { adminGetAllProducts, adminGetProductVersions, adminDeleteCompositionVersion } from "@/server/functions/composition.fn";
import { getProductFormOptionsFn, adminCreateCategoryFn, adminDeleteCategoryFn } from "@/server/functions/products.fn";
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  FlaskConical,
  History,
  LayoutDashboard,
  Lock,
  Package,
  Pencil,
  Plus,
  Soup,
  Trash2,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ajuda,
  botaoPrimario,
  botaoSecundario,
  campo,
  estiloDaSeta,
  marcaObrigatorio,
  rotulo,
  selecao,
} from "@/components/admin/inventory/campos";

/*
  A ROTA É ABERTA; DUAS ABAS DELA NÃO.

  Até 31/08/2026 a tela inteira era paga por ESTOQUE, e uma `rotaPremium` na
  porta bastava. Com ESTOQUE no BASIC isso deixou de valer: cinco das sete
  abas passaram a ser do plano básico, e trancar a porta trancaria o estoque
  junto com a produção.

  A proteção desceu para a ABA. Cada uma declara o recurso a que pertence, e
  a pergunta é a mesma `recursoNoEstado` de sempre — a que a guarda de rota, o
  cadeado do menu e as server functions usam. Não há segunda matriz aqui: só a
  lista de qual aba é o quê, que é o mesmo papel de `RECURSO_DA_ROTA`.

  ⚠️ ABRIR ESTA TELA NÃO ABRE PREPARADOS NEM RECEITAS. Quem recusa de verdade
  continua sendo o servidor: `preparado.fn.ts` exige PRODUCAO e
  `composition.fn.ts` exige RECEITAS, e recusariam ainda que estas linhas não
  existissem. O que a aba faz é explicar em vez de mostrar um painel de erros.
*/
export const Route = createFileRoute("/admin/estoque/")({
  component: EstoquePage,
});

type TabId = "dashboard" | "items" | "movements" | "preparados" | "compositions" | "audit" | "charts";

function EstoquePage() {
  const { admin } = Route.useRouteContext();
  const adminContext = admin!;
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedMovementItemId, setSelectedMovementItemId] = useState<string>("");
  const [newProductId, setNewProductId] = useState<string>("");
  const [isCreatingComposition, setIsCreatingComposition] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productVersions, setProductVersions] = useState<any[]>([]);
  const [editingCompositionId, setEditingCompositionId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState<string>("");
  const [createdCategoryIdTemp, setCreatedCategoryIdTemp] = useState<string | null>(null);

  /*
    SÓ QUEM TEM RECEITAS BUSCA ESTA LISTA.

    `adminGetAllProducts` exige RECEITAS no servidor, e ela só alimenta a aba
    de Receitas. Buscá-la ao abrir a tela — como era quando a página inteira
    era paga — faria toda loja BASIC começar a visita com uma recusa no
    console, para preencher uma lista que ela não vai ver.
  */
  const temReceitas = !rotaBloqueada({ admin }, "RECEITAS");

  useEffect(() => {
    if (!temReceitas) return;

    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const allProducts = await adminGetAllProducts({} as any);
        setProducts(allProducts as any[]);

        // Buscar categorias também
        const formOptions = await getProductFormOptionsFn();
        setCategories(formOptions.categories || []);
      } catch (error) {
        console.error("Erro ao buscar produtos:", error);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, [temReceitas]);

  useEffect(() => {
    const loadVersions = async () => {
      if (!selectedProductId) {
        setProductVersions([]);
        setEditingCompositionId(null);
        return;
      }
      try {
        const versionsData = await adminGetProductVersions({
          data: { productId: selectedProductId }
        } as any);
        setProductVersions(Array.isArray(versionsData) ? versionsData : []);
      } catch (error) {
        console.log("No versions found for product");
        setProductVersions([]);
      }
    };
    loadVersions();
  }, [selectedProductId]);

  const reloadCategories = async () => {
    try {
      const formOptions = await getProductFormOptionsFn();
      setCategories(formOptions.categories || []);
    } catch (error) {
      console.error("Erro ao recarregar categorias:", error);
    }
  };

  /*
    O RECURSO DE CADA ABA — classificado pelo CONTEÚDO, não pela pasta.

    "Auditoria" aqui NÃO é o módulo AUDITORIA: ela mostra o histórico de
    movimentação do estoque (`InventoryMovement`), e não o `AuditLog`. O nome
    coincide; o conteúdo não. Por isso é ESTOQUE, e a auditoria de verdade
    mora em `/admin/auditoria`.

    "Gráficos" desenha saldo e movimentação — estoque, não apuração de
    resultado. Margem e rentabilidade continuam em FINANCEIRO, em outra tela.
  */
  const tabs: Array<{ id: TabId; label: string; icon: LucideIcon; recurso: Recurso }> = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, recurso: "ESTOQUE" },
    { id: "items", label: "Itens", icon: Package, recurso: "ESTOQUE" },
    { id: "movements", label: "Movimentações", icon: ArrowLeftRight, recurso: "ESTOQUE" },
    { id: "preparados", label: "Preparados", icon: Soup, recurso: "PRODUCAO" },
    { id: "compositions", label: "Receitas", icon: FlaskConical, recurso: "RECEITAS" },
    { id: "audit", label: "Auditoria", icon: ClipboardList, recurso: "ESTOQUE" },
    { id: "charts", label: "Gráficos", icon: TrendingUp, recurso: "ESTOQUE" },
  ];

  /*
    A MESMA FUNÇÃO DA GUARDA DE ROTA. Ela responde "este recurso está
    bloqueado para esta sessão?" — a pergunta não é sobre rota, é sobre
    recurso, e reusá-la aqui é o que impede uma segunda regra de aparecer.
  */
  const bloqueada = (recurso: Recurso) => rotaBloqueada({ admin }, recurso);
  const abaAtual = tabs.find((t) => t.id === activeTab)!;
  const recursoBloqueadoDaAba = bloqueada(abaAtual.recurso) ? abaAtual.recurso : null;

  return (
    <EstoqueProvider>
      <div className="space-y-6">
        {/*
          Header

          "Estoque", e o subtítulo só com o que o BASIC tem de fato. O título
          antigo — "Estoque & Produção", com receitas no subtítulo — prometia
          na primeira linha da tela dois módulos que ficaram no Premium, e o
          cliente só descobriria ao esbarrar no cadeado de Preparados.

          As duas abas pagas continuam visíveis, com cadeado: quem quiser
          produção e ficha técnica encontra o convite. O que o cabeçalho não
          faz mais é anunciá-las como se já fossem dele.
        */}
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-neutral-900">Estoque</h1>
          <p className="text-sm text-neutral-600">
            Gerencie seu estoque, movimentações, custos e alertas
          </p>
        </header>

        {/*
          Tabs

          SETE ABAS NÃO CABEM NUMA TELA ESTREITA, e rolar de lado é a pior
          saída: não há nada dizendo que há mais coisa à direita, e "Gráficos"
          ficava cortado no meio da palavra.

          Abaixo de `sm` sobram só os ícones — sete deles ocupam ~310px e cabem
          em qualquer celular, sem rolagem nenhuma. O nome continua acessível
          pelo `aria-label` e pela dica do sistema. Daí para cima os rótulos
          voltam, e o `overflow-x-auto` fica como rede para as larguras do meio.
        */}
        <div className="overflow-x-auto border-b border-neutral-200">
          <div className="flex gap-1">
            {tabs.map((tab) => {
              /*
                A aba paga continua VISÍVEL e clicável, com cadeado. Escondê-la
                faria o BASIC nunca descobrir que Preparados e Receitas
                existem — e é o convite que vende o Premium.
              */
              const trancada = bloqueada(tab.recurso);
              const Icone = trancada ? Lock : tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-label={tab.label}
                  title={tab.label}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-colors sm:px-4 motion-reduce:transition-none ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  {/*
                    Ícone de traço, e não emoji. O emoji muda de desenho e de
                    tamanho em cada sistema, e era o único ponto do painel que
                    não usava o mesmo conjunto do resto.
                  */}
                  <Icone
                    className={`size-4 shrink-0 ${trancada ? "text-neutral-400" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {recursoBloqueadoDaAba && (
            <TelaDeRecursoPremium recurso={recursoBloqueadoDaAba} />
          )}

          {!recursoBloqueadoDaAba && activeTab === "dashboard" && (
            <ReportsDashboard storeId={adminContext.storeId} />
          )}

          {activeTab === "items" && (
            <InventoryGrid storeId={adminContext.storeId} />
          )}

          {activeTab === "movements" && (
            /*
              DOIS QUINTOS PARA O FORMULÁRIO, e não um terço.

              Em 1/3 a coluna ficava com ~250px: os campos apertavam, o rótulo
              "Tipo de Movimento" quebrava em duas linhas e o próprio botão de
              enviar virava duas. O formulário tem seis campos e é o trabalho
              da aba; o histórico é a conferência.

              O HISTÓRICO NÃO PASSA DA ALTURA DO FORMULÁRIO.

              Com 50 movimentos ele descia bem além da coluna da esquerda, e a
              aba virava uma lista comprida com um formulário parado no alto.
              O `lg:relative` + `lg:absolute` abaixo é o que resolve isso sem
              número mágico: fora do fluxo, o histórico não empurra a linha do
              grid, então a altura da linha passa a ser a do formulário — e o
              `lg:max-h-full` lê exatamente essa altura.

              E `max-h`, não `h`: uma lista de duas linhas continua um card de
              duas linhas. Só quem passa do limite é cortado, e aí rola por
              dentro.
            */
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <MovementForm
                  storeId={adminContext.storeId}
                  onItemSelected={setSelectedMovementItemId}
                  onSuccess={() => {
                    // Força recarregar o histórico após registrar uma movimentação
                    if (selectedMovementItemId) {
                      setSelectedMovementItemId("");
                      setTimeout(() => setSelectedMovementItemId(selectedMovementItemId), 100);
                    }
                  }}
                />
              </div>
              <div className="lg:relative lg:col-span-3">
                {selectedMovementItemId ? (
                  <div className="lg:absolute lg:inset-x-0 lg:top-0 lg:flex lg:max-h-full">
                    <AuditLog key={selectedMovementItemId} storeId={adminContext.storeId} itemId={selectedMovementItemId} />
                  </div>
                ) : (
                  /*
                    O VAZIO DIZ O QUE FAZER, e não só o que falta. "Selecione
                    um item" descrevia o estado; a segunda linha explica por
                    que vale a pena — é onde se confere o que já entrou e saiu
                    antes de registrar mais um movimento.
                  */
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center">
                    <span className="mx-auto grid size-11 place-items-center rounded-xl bg-neutral-100">
                      <History className="size-5 text-neutral-400" aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-neutral-900">
                      Escolha um item ao lado
                    </p>
                    <p className="mx-auto mt-1 max-w-xs text-xs leading-snug text-neutral-500">
                      O histórico dele aparece aqui — tudo que entrou, saiu e
                      foi ajustado, com data e responsável.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!recursoBloqueadoDaAba && activeTab === "preparados" && <PreparadosTab />}

          {!recursoBloqueadoDaAba && activeTab === "compositions" && (
            <div className="space-y-6">
              {/*
                ─────────────────────────── CRIAR ───────────────────────────

                A criação é uma SEQUÊNCIA de verdade — produto, categoria,
                ingredientes —, e cada etapa só aparece quando a anterior está
                respondida. Por isso os números: eles dizem onde a pessoa está,
                e não decoram a tela.
              */}
              {isCreatingComposition && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-bold text-neutral-900">
                        Nova receita
                      </h3>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        A ficha técnica do produto: o que sai do estoque a cada venda.
                      </p>
                    </div>
                    {/*
                      CANCELAR MORA NO CABEÇALHO, e não colado no primeiro
                      campo. Ele desfaz a criação inteira — inclusive a
                      categoria criada no meio do caminho —, não a etapa em que
                      a pessoa está.
                    */}
                    <button
                      type="button"
                      onClick={async () => {
                        // Deletar categoria criada se não foi usada
                        if (createdCategoryIdTemp) {
                          try {
                            await adminDeleteCategoryFn({ data: { categoryId: createdCategoryIdTemp } } as any);
                            setCreatedCategoryIdTemp(null);
                          } catch (error) {
                            console.error("Erro ao deletar categoria:", error);
                          }
                        }
                        setIsCreatingComposition(false);
                        setNewProductId("");
                        setSelectedCategoryId("");
                        setIsCreatingNewCategory(false);
                        setNewCategoryName("");
                        await reloadCategories();
                      }}
                      className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none"
                      aria-label="Cancelar criação da receita"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-5 space-y-5">
                    {/* ETAPA 1 — o produto */}
                    <div className="flex gap-3">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                        1
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-900">
                          Produto <span className={marcaObrigatorio}>*</span>
                        </p>
                        {loadingProducts ? (
                          <p className="mt-2 text-sm text-neutral-500">Carregando produtos...</p>
                        ) : (
                          <>
                            {/*
                              OS DOIS CAMPOS SÃO O MESMO DADO, e antes estavam
                              lado a lado sem dizer isso — um select e uma
                              caixa de texto grudados, ambos escrevendo em
                              `newProductId`, e quem digitava não entendia por
                              que o select mudava sozinho.
                            */}
                            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className={rotulo}>Escolher um já cadastrado</label>
                                <select
                                  value={newProductId}
                                  onChange={(e) => setNewProductId(e.target.value)}
                                  className={selecao}
                                  style={estiloDaSeta}
                                >
                                  <option value="">Selecione um produto...</option>
                                  {products.map((p) => (
                                    <option key={p.id} value={p.name}>
                                      {p.name}
                                      {p.isActive === false ? ' (inativo)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={rotulo}>Ou escrever um nome novo</label>
                                <input
                                  type="text"
                                  placeholder="ex: Bolo de cenoura"
                                  value={newProductId}
                                  onChange={(e) => setNewProductId(e.target.value)}
                                  className={campo}
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ETAPA 2 — a categoria */}
                    {newProductId && newProductId.trim() && !isCreatingNewCategory && (
                      <div className="flex gap-3">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                          2
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-neutral-900">
                            Categoria do produto <span className={marcaObrigatorio}>*</span>
                          </p>
                          <p className={ajuda}>Onde ele aparece no cardápio.</p>
                          <select
                            value={selectedCategoryId}
                            onChange={(e) => {
                              if (e.target.value === "create") {
                                setIsCreatingNewCategory(true);
                              } else {
                                setSelectedCategoryId(e.target.value);
                              }
                            }}
                            className={`${selecao} mt-2`}
                            style={estiloDaSeta}
                          >
                            <option value="">Selecione uma categoria...</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                            <option value="create">+ Criar nova categoria</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {isCreatingNewCategory && newProductId && newProductId.trim() && (
                      <div className="flex gap-3">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                          2
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-neutral-900">
                            Nome da nova categoria <span className={marcaObrigatorio}>*</span>
                          </p>
                          <p className={ajuda}>Exemplos: Bebidas, Doces, Bolos...</p>
                          {/*
                            Empilha no celular. Antes eram três caixas num
                            `flex` sem quebra: em 360px o campo ficava com
                            espaço para umas quatro letras.
                          */}
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <input
                              type="text"
                              placeholder="ex: Bebidas"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              className={`${campo} sm:flex-1`}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (newCategoryName.trim()) {
                                    try {
                                      const newCategory = await adminCreateCategoryFn({ data: { name: newCategoryName } } as any);
                                      setSelectedCategoryId(newCategory.id);
                                      setCreatedCategoryIdTemp(newCategory.id);
                                      setIsCreatingNewCategory(false);
                                      setNewCategoryName("");
                                      await reloadCategories();
                                    } catch (error) {
                                      alert("Erro ao criar categoria: " + (error instanceof Error ? error.message : "Unknown error"));
                                    }
                                  }
                                }}
                                className={`${botaoPrimario} flex-1 whitespace-nowrap sm:flex-none`}
                              >
                                Criar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingNewCategory(false);
                                  setNewCategoryName("");
                                }}
                                className={`${botaoSecundario} flex-1 whitespace-nowrap sm:flex-none`}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ETAPA 3 — os ingredientes */}
                    {newProductId && newProductId.trim() && selectedCategoryId && (
                      <div className="flex gap-3">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                          3
                        </span>
                        <div className="min-w-0 flex-1">
                          <CompositionBuilder
                            storeId={adminContext.storeId}
                            productId={newProductId}
                            categoryId={selectedCategoryId}
                            mode="create"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ───────────────────── RECEITAS EXISTENTES ───────────────────── */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-neutral-900">
                      Receitas cadastradas
                    </h3>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Escolha um produto para ver e editar as versões da ficha.
                    </p>
                  </div>
                  {!isCreatingComposition && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingComposition(true)}
                      className={`${botaoPrimario} inline-flex items-center gap-1.5`}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Nova receita
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  {loadingProducts ? (
                    <p className="text-sm text-neutral-500">Carregando produtos...</p>
                  ) : products.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      Nenhum produto com receitas ainda. Crie a primeira acima.
                    </p>
                  ) : (
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className={selecao}
                      style={estiloDaSeta}
                    >
                      <option value="">Selecione um produto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.isActive === false ? ' (inativo)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedProductId && productVersions.length > 0 && !editingCompositionId && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {productVersions.map((version) => (
                      <div
                        key={version.id}
                        className="flex flex-col rounded-xl border border-neutral-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-display text-sm font-bold text-neutral-900">
                              Versão {version.version}
                            </h4>
                            <p className="mt-0.5 text-xs text-neutral-500">
                              {version.items?.length || 0} ingredientes
                            </p>
                          </div>
                          {version.isActive && (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              Em uso
                            </span>
                          )}
                        </div>

                        {/*
                          O CUSTO É O NÚMERO QUE IMPORTA nesta ficha — é ele
                          que decide preço. Estava numa frase corrida, do mesmo
                          tamanho da contagem de ingredientes.
                        */}
                        <p className="mt-3 font-display text-xl font-bold tabular-nums text-neutral-900">
                          R$ {version.totalCost?.toFixed(2).replace(".", ",") || "0,00"}
                          <span className="ml-1 text-xs font-medium text-neutral-400">
                            por unidade
                          </span>
                        </p>

                        {version.items && version.items.length > 0 && (
                          <ul className="mt-3 space-y-1 rounded-lg bg-neutral-50 p-3">
                            {version.items.map((item: any, idx: number) => (
                              <li
                                key={idx}
                                className="flex justify-between gap-3 text-xs text-neutral-700"
                              >
                                <span className="truncate">{item.inventoryItem?.name}</span>
                                <span className="shrink-0 tabular-nums text-neutral-500">
                                  {item.quantity} {item.unit?.code}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-auto flex gap-2 pt-4">
                          <button
                            type="button"
                            onClick={() => setEditingCompositionId(version.id)}
                            className={`${botaoSecundario} inline-flex flex-1 items-center justify-center gap-1.5 py-2`}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Editar
                          </button>
                          {/*
                            EXCLUIR NÃO É VERMELHO CHEIO. Em vermelho sólido ao
                            lado de "Editar" ele tem o mesmo peso da ação
                            comum, e é a única aqui que não dá para desfazer.
                          */}
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm("Tem certeza que deseja deletar esta receita?")) {
                                try {
                                  await adminDeleteCompositionVersion({ data: { compositionId: version.id } } as any);
                                  alert("Receita deletada com sucesso!");
                                  setProductVersions(productVersions.filter(v => v.id !== version.id));
                                } catch (error) {
                                  alert("Erro ao deletar: " + (error instanceof Error ? error.message : "Unknown error"));
                                }
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 motion-reduce:transition-none"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedProductId && editingCompositionId && (
                  <div className="mt-4">
                    <CompositionBuilder
                      storeId={adminContext.storeId}
                      productId={selectedProductId}
                      mode="edit"
                      compositionId={editingCompositionId}
                    />
                  </div>
                )}

                {!selectedProductId && products.length > 0 && (
                  <div className="mt-4 rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center">
                    <span className="mx-auto grid size-11 place-items-center rounded-xl bg-neutral-100">
                      <FlaskConical className="size-5 text-neutral-400" aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-neutral-900">
                      Escolha um produto acima
                    </p>
                    <p className="mx-auto mt-1 max-w-xs text-xs leading-snug text-neutral-500">
                      As versões da ficha técnica dele aparecem aqui, com o custo de cada uma.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "audit" && (
            <AuditLog storeId={adminContext.storeId} />
          )}

          {activeTab === "charts" && (
            <StockChart storeId={adminContext.storeId} period="month" />
          )}
        </div>
      </div>
    </EstoqueProvider>
  );
}
