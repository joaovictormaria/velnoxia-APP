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
  const tabs: Array<{ id: TabId; label: string; icon: string; recurso: Recurso }> = [
    { id: "dashboard", label: "Dashboard", icon: "📊", recurso: "ESTOQUE" },
    { id: "items", label: "Itens", icon: "📦", recurso: "ESTOQUE" },
    { id: "movements", label: "Movimentações", icon: "↔️", recurso: "ESTOQUE" },
    { id: "preparados", label: "Preparados", icon: "🍲", recurso: "PRODUCAO" },
    { id: "compositions", label: "Receitas", icon: "🧪", recurso: "RECEITAS" },
    { id: "audit", label: "Auditoria", icon: "📋", recurso: "ESTOQUE" },
    { id: "charts", label: "Gráficos", icon: "📈", recurso: "ESTOQUE" },
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

        {/* Tabs */}
        <div className="border-b border-neutral-200 overflow-x-auto">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {/*
                  A aba paga continua VISÍVEL e clicável, com cadeado. Escondê-la
                  faria o BASIC nunca descobrir que Preparados e Receitas
                  existem — e é o convite que vende o Premium.
                */}
                {bloqueada(tab.recurso) ? "🔒" : tab.icon} {tab.label}
              </button>
            ))}
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
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
              <div className="lg:col-span-2">
                {selectedMovementItemId ? (
                  <AuditLog key={selectedMovementItemId} storeId={adminContext.storeId} itemId={selectedMovementItemId} />
                ) : (
                  <div className="p-8 text-center border-2 border-dashed rounded bg-neutral-50 text-neutral-600">
                    <p className="text-sm">Selecione um item para ver o histórico de movimentações</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!recursoBloqueadoDaAba && activeTab === "preparados" && <PreparadosTab />}

          {!recursoBloqueadoDaAba && activeTab === "compositions" && (
            <div className="space-y-6">
              {/* Modo Criação */}
              {isCreatingComposition && (
                <div className="space-y-4 p-4 border rounded bg-white">
                  <h3 className="text-lg font-bold">Criar Nova Receita</h3>
                  <div>
                    <label className="block text-sm font-medium mb-2">Produto *</label>
                    <div className="flex gap-2">
                      {loadingProducts ? (
                        <p className="text-sm text-neutral-600">Carregando produtos...</p>
                      ) : (
                        <>
                          <select
                            value={newProductId}
                            onChange={(e) => setNewProductId(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded bg-background text-foreground"
                          >
                            <option value="">-- Selecione um produto ou digite um novo --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.name}>
                                {p.name}
                                {p.isActive === false ? ' (inativo)' : ''}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Ou digite um novo nome"
                            value={newProductId}
                            onChange={(e) => setNewProductId(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded bg-background text-foreground"
                          />
                          <button
                            onClick={() => {
                              if (!newProductId.trim()) {
                                alert("Selecione ou digite um produto");
                                return;
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                          >
                            Próximo
                          </button>
                          <button
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
                            className="px-4 py-2 bg-neutral-300 text-neutral-900 rounded hover:bg-neutral-400 font-medium"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {newProductId && newProductId.trim() && !isCreatingNewCategory && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Categoria do Produto *</label>
                      <div className="flex gap-2">
                        <select
                          value={selectedCategoryId}
                          onChange={(e) => {
                            if (e.target.value === "create") {
                              setIsCreatingNewCategory(true);
                            } else {
                              setSelectedCategoryId(e.target.value);
                            }
                          }}
                          className="flex-1 px-3 py-2 border rounded bg-background text-foreground"
                        >
                          <option value="">-- Selecione uma categoria --</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value="create">+ Criar Nova Categoria</option>
                        </select>
                      </div>
                      {selectedCategoryId && (
                        <p className="text-xs text-neutral-600 mt-2">
                          Categoria selecionada: {categories.find((c) => c.id === selectedCategoryId)?.name}
                        </p>
                      )}
                    </div>
                  )}

                  {isCreatingNewCategory && newProductId && newProductId.trim() && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Nome da Nova Categoria *</label>
                      <p className="text-xs text-neutral-600 mb-2">Exemplos: Bebidas, Doces, Bolos...</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="ex: Bebidas"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          className="flex-1 px-3 py-2 border rounded bg-background text-foreground"
                        />
                        <button
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
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                        >
                          ✓ Criar
                        </button>
                        <button
                          onClick={() => {
                            setIsCreatingNewCategory(false);
                            setNewCategoryName("");
                          }}
                          className="px-4 py-2 bg-neutral-300 text-neutral-900 rounded hover:bg-neutral-400 font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {newProductId && newProductId.trim() && selectedCategoryId && (
                    <CompositionBuilder
                      storeId={adminContext.storeId}
                      productId={newProductId}
                      categoryId={selectedCategoryId}
                      mode="create"
                    />
                  )}
                </div>
              )}

              {/* Botão para iniciar criação */}
              {!isCreatingComposition && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setIsCreatingComposition(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                  >
                    + Criar Nova Receita
                  </button>
                </div>
              )}

              {/* Seção Visualizar Receitas Existentes */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold">Gerenciar Receitas Existentes</h3>
                <div className="p-4 border rounded bg-muted">
                  <p className="text-sm text-muted-foreground mb-3">
                    Selecione um produto para gerenciar suas receitas:
                  </p>
                  {loadingProducts ? (
                    <p className="text-sm text-muted-foreground">Carregando produtos...</p>
                  ) : products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum produto com receitas encontrado. Crie uma receita primeiro!</p>
                  ) : (
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full px-3 py-2 border rounded bg-background text-foreground"
                    >
                      <option value="">-- Selecione um produto --</option>
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
                  <div className="space-y-4">
                    {productVersions.map((version) => (
                      <div key={version.id} className="p-4 border rounded bg-white space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-lg">Versão {version.version}</h4>
                            <p className="text-sm text-neutral-600">
                              {version.items?.length || 0} ingredientes • Custo: R$ {version.totalCost?.toFixed(2) || "0.00"}
                            </p>
                          </div>
                          {version.isActive && (
                            <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                              Ativa
                            </span>
                          )}
                        </div>

                        {version.items && version.items.length > 0 && (
                          <div className="bg-neutral-50 p-3 rounded space-y-1">
                            {version.items.map((item: any, idx: number) => (
                              <div key={idx} className="text-sm text-neutral-700">
                                • {item.inventoryItem?.name} - {item.quantity} {item.unit?.code}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 pt-2 border-t">
                          <button
                            onClick={() => setEditingCompositionId(version.id)}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                          >
                            ✏️ Editar
                          </button>
                          <button
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
                            className="flex-1 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
                          >
                            🗑️ Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedProductId && editingCompositionId && (
                  <CompositionBuilder
                    storeId={adminContext.storeId}
                    productId={selectedProductId}
                    mode="edit"
                    compositionId={editingCompositionId}
                  />
                )}

                {!selectedProductId && (
                  <div className="p-8 text-center border-2 border-dashed rounded text-muted-foreground">
                    Selecione um produto acima para gerenciar suas receitas
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
