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
import { adminGetAllProducts } from "@/server/functions/composition.fn";

export const Route = createFileRoute("/admin/estoque/")({
  component: EstoquePage,
});

type TabId = "dashboard" | "items" | "movements" | "compositions" | "audit" | "charts";

function EstoquePage() {
  const { admin } = Route.useRouteContext();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedMovementItemId, setSelectedMovementItemId] = useState<string>("");
  const [newProductId, setNewProductId] = useState<string>("");
  const [isCreatingComposition, setIsCreatingComposition] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        // Buscar todos os produtos da store
        const allProducts = await adminGetAllProducts({} as any);
        setProducts(allProducts as any[]);
      } catch (error) {
        console.error("Erro ao buscar produtos:", error);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "items", label: "Itens", icon: "📦" },
    { id: "movements", label: "Movimentações", icon: "↔️" },
    { id: "compositions", label: "Receitas", icon: "🧪" },
    { id: "audit", label: "Auditoria", icon: "📋" },
    { id: "charts", label: "Gráficos", icon: "📈" },
  ];

  return (
    <EstoqueProvider>
      <div className="space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-neutral-900">Estoque & Produção</h1>
          <p className="text-sm text-neutral-600">
            Gerencie inventário, receitas, movimentações e relatórios
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
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === "dashboard" && (
            <ReportsDashboard storeId={admin.storeId} />
          )}

          {activeTab === "items" && (
            <InventoryGrid storeId={admin.storeId} />
          )}

          {activeTab === "movements" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <MovementForm
                  storeId={admin.storeId}
                  onItemSelected={setSelectedMovementItemId}
                />
              </div>
              <div className="lg:col-span-2">
                {selectedMovementItemId ? (
                  <AuditLog storeId={admin.storeId} itemId={selectedMovementItemId} />
                ) : (
                  <div className="p-8 text-center border-2 border-dashed rounded bg-neutral-50 text-neutral-600">
                    <p className="text-sm">Selecione um item para ver o histórico de movimentações</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "compositions" && (
            <div className="space-y-6">
              {/* Modo Criação */}
              {isCreatingComposition && (
                <div className="space-y-4 p-4 border rounded bg-white">
                  <h3 className="text-lg font-bold">Criar Nova Receita</h3>
                  <div>
                    <label className="block text-sm font-medium mb-2">ID do Produto *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="ex: bolo-chocolate"
                        value={newProductId}
                        onChange={(e) => setNewProductId(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded bg-background text-foreground"
                      />
                      <button
                        onClick={() => {
                          if (!newProductId.trim()) {
                            alert("Digite o ID do produto");
                            return;
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                      >
                        Próximo
                      </button>
                      <button
                        onClick={() => {
                          setIsCreatingComposition(false);
                          setNewProductId("");
                        }}
                        className="px-4 py-2 bg-neutral-300 text-neutral-900 rounded hover:bg-neutral-400 font-medium"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                  {newProductId && newProductId.trim() && (
                    <CompositionBuilder
                      storeId={admin.storeId}
                      productId={newProductId}
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
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {selectedProductId && (
                  <CompositionBuilder
                    storeId={admin.storeId}
                    productId={selectedProductId}
                    mode="view"
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
            <AuditLog storeId={admin.storeId} />
          )}

          {activeTab === "charts" && (
            <StockChart storeId={admin.storeId} period="month" />
          )}
        </div>
      </div>
    </EstoqueProvider>
  );
}
