import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Pencil, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { listTablesFn, deleteTableFn } from "@/server/functions/tables.fn";
import type { Table, TableStatus } from "@prisma/client";
import { useState } from "react";

export const Route = createFileRoute("/admin/mesas/")({
  component: MesasPage,
});

function MesasPage() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<TableStatus | "ALL">("ALL");

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Mesas</h1>
        <Button
          onClick={() => navigate({ to: "/admin/mesas/nova" })}
          className="gap-2"
        >
          <Plus className="size-4" />
          Nova Mesa
        </Button>
      </div>

      {/* Filtro de status */}
      <div className="flex gap-2">
        {(["ALL", "AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"] as const).map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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
        <div className="text-center text-neutral-400">Nenhuma mesa encontrada</div>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TableCard({
  table,
  onDelete,
  onEdit,
}: {
  table: Table;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const statusColors = {
    AVAILABLE: "bg-green-900/30 text-green-400 border-green-700",
    OCCUPIED: "bg-red-900/30 text-red-400 border-red-700",
    RESERVED: "bg-yellow-900/30 text-yellow-400 border-yellow-700",
    MAINTENANCE: "bg-gray-900/30 text-gray-400 border-gray-700",
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Mesa #{table.number}</h3>
          <p className="text-sm text-neutral-400">{table.capacity} lugares</p>
        </div>
        <span
          className={`rounded px-2 py-1 text-xs font-medium border ${
            statusColors[table.status]
          }`}
        >
          {table.status}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
        >
          <Pencil className="mr-1 inline size-4" />
          Editar
        </button>
        <button
          onClick={onDelete}
          className="flex-1 rounded-lg bg-red-900/20 px-3 py-2 text-sm text-red-400 hover:bg-red-900/40 transition-colors"
        >
          <Trash2 className="mr-1 inline size-4" />
          Deletar
        </button>
      </div>
    </div>
  );
}
