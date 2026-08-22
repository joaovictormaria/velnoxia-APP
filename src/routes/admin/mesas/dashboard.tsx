import { createFileRoute } from "@tanstack/react-router";
import { StatusBadge } from "@/components/admin/tables/StatusBadge";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Users, Clock } from "lucide-react";
import type { Table } from "@prisma/client";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/admin/mesas/dashboard")({
  component: MesasDashboard,
});

// Mock data
const mockTables: Table[] = [
  { id: "1", storeId: "store-1", number: 1, capacity: 4, status: "AVAILABLE", qrcodeUrl: "https://velnox.app.br/mesa/1", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
  { id: "2", storeId: "store-1", number: 2, capacity: 6, status: "OCCUPIED", qrcodeUrl: "https://velnox.app.br/mesa/2", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
  { id: "3", storeId: "store-1", number: 3, capacity: 2, status: "AVAILABLE", qrcodeUrl: "https://velnox.app.br/mesa/3", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
  { id: "4", storeId: "store-1", number: 4, capacity: 8, status: "OCCUPIED", qrcodeUrl: "https://velnox.app.br/mesa/4", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
  { id: "5", storeId: "store-1", number: 5, capacity: 4, status: "RESERVED", qrcodeUrl: "https://velnox.app.br/mesa/5", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
  { id: "6", storeId: "store-1", number: 6, capacity: 2, status: "AVAILABLE", qrcodeUrl: "https://velnox.app.br/mesa/6", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
  { id: "7", storeId: "store-1", number: 7, capacity: 4, status: "MAINTENANCE", qrcodeUrl: "https://velnox.app.br/mesa/7", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
  { id: "8", storeId: "store-1", number: 8, capacity: 6, status: "AVAILABLE", qrcodeUrl: "https://velnox.app.br/mesa/8", qrcodeData: "", createdAt: new Date(), updatedAt: new Date() },
];

function MesasDashboard() {
  const navigate = useNavigate();
  const [tables] = useState<Table[]>(mockTables);

  // Agrupar por status
  const grouped = {
    AVAILABLE: tables.filter(t => t.status === "AVAILABLE"),
    OCCUPIED: tables.filter(t => t.status === "OCCUPIED"),
    RESERVED: tables.filter(t => t.status === "RESERVED"),
    MAINTENANCE: tables.filter(t => t.status === "MAINTENANCE"),
  };

  // Calcular estatísticas
  const totalMesas = tables.length;
  const mesasOcupadas = grouped.OCCUPIED.length;
  const mesasDisponiveis = grouped.AVAILABLE.length;
  const taxaOcupacao = totalMesas > 0 ? Math.round((mesasOcupadas / totalMesas) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard de Mesas</h1>
        <p className="text-sm text-neutral-400">Visualização em tempo real</p>
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Total de Mesas"
          value={totalMesas}
          color="text-blue-400"
          icon="🪑"
        />
        <StatCard
          label="Ocupadas"
          value={mesasOcupadas}
          color="text-red-400"
          icon="👥"
        />
        <StatCard
          label="Disponíveis"
          value={mesasDisponiveis}
          color="text-green-400"
          icon="✓"
        />
        <StatCard
          label="Taxa de Ocupação"
          value={`${taxaOcupacao}%`}
          color="text-purple-400"
          icon="📊"
        />
      </div>

      {/* Legenda */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <p className="mb-3 text-sm font-medium text-white">Legenda:</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="flex items-center gap-2 text-sm">
            <div className="size-3 rounded-full bg-green-500" />
            <span className="text-neutral-300">Disponível</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="size-3 rounded-full bg-red-500" />
            <span className="text-neutral-300">Ocupada</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="size-3 rounded-full bg-yellow-500" />
            <span className="text-neutral-300">Reservada</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="size-3 rounded-full bg-gray-500" />
            <span className="text-neutral-300">Manutenção</span>
          </div>
        </div>
      </div>

      {/* Grid de mesas visual */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="mb-6 text-lg font-bold text-white">Plano de Ocupação</h2>

        <div className="grid gap-3 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {tables.length === 0 ? (
            <p className="col-span-full text-center text-neutral-400">Nenhuma mesa cadastrada</p>
          ) : (
            tables.map((table) => (
              <TableTile
                key={table.id}
                table={table}
                onClick={() => {
                  navigate({ to: `/admin/mesas/${table.id}` });
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Resumo por status */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(grouped).map(([status, mesas]) => (
          <div key={status} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <h3 className="mb-3 font-semibold text-white">
              {status === "AVAILABLE"
                ? "Disponíveis"
                : status === "OCCUPIED"
                  ? "Ocupadas"
                  : status === "RESERVED"
                    ? "Reservadas"
                    : "Em Manutenção"}{" "}
              ({mesas.length})
            </h3>

            {mesas.length === 0 ? (
              <p className="text-sm text-neutral-400">Nenhuma mesa</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mesas.map((mesa) => (
                  <button
                    key={mesa.id}
                    onClick={() => navigate({ to: `/admin/mesas/${mesa.id}` })}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 transition-colors text-white"
                  >
                    Mesa #{mesa.number}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-neutral-400">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

function TableTile({ table, onClick }: { table: Table; onClick: () => void }) {
  const statusColors = {
    AVAILABLE: "bg-green-500/20 border-green-500/50 hover:bg-green-500/30",
    OCCUPIED: "bg-red-500/20 border-red-500/50 hover:bg-red-500/30",
    RESERVED: "bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30",
    MAINTENANCE: "bg-gray-500/20 border-gray-500/50 hover:bg-gray-500/30",
  };

  const statusDot = {
    AVAILABLE: "bg-green-500",
    OCCUPIED: "bg-red-500",
    RESERVED: "bg-yellow-500",
    MAINTENANCE: "bg-gray-500",
  };

  return (
    <button
      onClick={onClick}
      className={`aspect-square rounded-lg border p-3 transition-colors cursor-pointer flex flex-col items-center justify-center ${
        statusColors[table.status]
      }`}
    >
      <div className={`size-2 rounded-full mb-2 ${statusDot[table.status]}`} />
      <p className="text-sm font-bold text-white">#{table.number}</p>
      <p className="text-xs text-neutral-300">{table.capacity} pessoas</p>
    </button>
  );
}
