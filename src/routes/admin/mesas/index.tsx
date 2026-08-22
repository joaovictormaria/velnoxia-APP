import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Pencil, QrCode, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { listTablesFn, deleteTableFn } from "@/server/functions/tables.fn";
import { StatusBadge } from "@/components/admin/tables/StatusBadge";
import { QrcodeModal } from "@/components/admin/tables/QrcodeModal";
import type { Table, TableStatus } from "@prisma/client";
import { useState } from "react";

export const Route = createFileRoute("/admin/mesas/")({
  component: MesasPage,
});

function MesasPage() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<TableStatus | "ALL">("ALL");
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  const { data: tables = [], isLoading, refetch } = useQuery({
    queryKey: ["tables"],
    queryFn: () => listTablesFn(),
  });

  const deleteTableMutation = useMutation({
    mutationFn: deleteTableFn,
    onSuccess: () => {
      refetch();
    },
  });

  const filteredTables = filterStatus === "ALL"
    ? tables
    : tables.filter(t => t.status === filterStatus);

  const stats = {
    total: tables.length,
    available: tables.filter(t => t.status === "AVAILABLE").length,
    occupied: tables.filter(t => t.status === "OCCUPIED").length,
    reserved: tables.filter(t => t.status === "RESERVED").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mesas</h1>
          <p className="text-sm text-neutral-400">
            {stats.total} mesas • {stats.available} disponíveis • {stats.occupied} ocupadas
          </p>
        </div>
        <Button
          onClick={() => navigate({ to: "/admin/mesas/nova" })}
          className="gap-2"
        >
          <Plus className="size-4" />
          Nova Mesa
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, color: "text-blue-400" },
          { label: "Disponíveis", value: stats.available, color: "text-green-400" },
          { label: "Ocupadas", value: stats.occupied, color: "text-red-400" },
          { label: "Reservadas", value: stats.reserved, color: "text-yellow-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filtro de status */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(["ALL", "AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"] as const).map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filterStatus === status
                  ? "bg-[#E11D2E] text-white"
                  : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              {status === "ALL" ? "Todas" : status}
            </button>
          )
        )}
      </div>

      {/* Grid de mesas */}
      {isLoading ? (
        <div className="text-center text-neutral-400">Carregando mesas...</div>
      ) : filteredTables.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center">
          <p className="text-neutral-400">Nenhuma mesa encontrada</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onDelete={() => {
                if (confirm(`Deletar mesa #${table.number}?`)) {
                  deleteTableMutation.mutate({ tableId: table.id });
                }
              }}
              onEdit={() => navigate({ to: `/admin/mesas/${table.id}` })}
              onShowQr={() => {
                setSelectedTable(table);
                setShowQrModal(true);
              }}
            />
          ))}
        </div>
      )}

      {selectedTable && (
        <QrcodeModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          tableNumber={selectedTable.number}
          qrcodeUrl={selectedTable.qrcodeUrl}
          qrcodeData={selectedTable.qrcodeData}
        />
      )}
    </div>
  );
}

function TableCard({
  table,
  onDelete,
  onEdit,
  onShowQr,
}: {
  table: Table;
  onDelete: () => void;
  onEdit: () => void;
  onShowQr: () => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:bg-neutral-800/50 transition-colors">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Mesa #{table.number}</h3>
          <p className="text-sm text-neutral-400">{table.capacity} lugares</p>
        </div>
        <StatusBadge status={table.status} size="sm" />
      </div>

      <div className="mb-4 h-px bg-neutral-800" />

      <div className="space-y-2">
        <button
          onClick={onShowQr}
          className="flex w-full items-center gap-2 rounded-lg bg-neutral-800/50 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          <QrCode className="size-4" />
          Ver QRCode
        </button>

        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <Pencil className="size-4" />
            Editar
          </button>
          <button
            onClick={onDelete}
            className="flex-1 rounded-lg bg-red-900/20 px-3 py-2 text-sm text-red-400 hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="size-4" />
            Deletar
          </button>
        </div>
      </div>
    </div>
  );
}
