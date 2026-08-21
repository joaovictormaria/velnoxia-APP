import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  InventoryGrid,
  MovementForm,
  CompositionBuilder,
  AuditLog,
  StockChart,
  ReportsDashboard,
} from "@/components/admin/inventory";
import { EstoqueProvider } from "@/lib/estoque-store";

export const Route = createFileRoute("/admin/estoque/")({
  component: EstoquePage,
});

type TabId = "dashboard" | "items" | "movements" | "compositions" | "audit" | "charts";

function EstoquePage() {
  const { admin } = Route.useRouteContext();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedMovementItemId, setSelectedMovementItemId] = useState<string>("");

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
            <div className="space-y-4">
              <div className="p-4 border rounded bg-muted">
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione um produto para gerenciar suas receitas:
                </p>
                <input
                  type="text"
                  placeholder="ID do produto (ou deixe em branco para ver todas)"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 border rounded bg-background text-foreground"
                />
              </div>
              {selectedProductId && (
                <CompositionBuilder
                  storeId={admin.storeId}
                  productId={selectedProductId}
                />
              )}
              {!selectedProductId && (
                <div className="p-8 text-center border-2 border-dashed rounded text-muted-foreground">
                  Digite um ID de produto acima para gerenciar suas receitas
                </div>
              )}
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
