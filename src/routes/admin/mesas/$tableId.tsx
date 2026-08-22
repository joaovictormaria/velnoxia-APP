import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, RotateCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Table, TableStatus } from "@prisma/client";

export const Route = createFileRoute("/admin/mesas/$tableId")({
  component: MesaDetailPage,
});

// Mock table
const mockTable: Table = {
  id: "1",
  storeId: "store-1",
  number: 1,
  capacity: 4,
  status: "AVAILABLE",
  qrcodeUrl: "https://velnox.app.br/mesa/1",
  qrcodeData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function MesaDetailPage() {
  const { tableId } = Route.useParams();
  const navigate = useNavigate();
  const [table, setTable] = useState<Table>(mockTable);

  if (!table) {
    return <div className="text-red-400">Mesa não encontrada</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate({ to: "/admin/mesas" })}
          className="rounded-lg p-2 hover:bg-neutral-900"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">Mesa #{table.number}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Informações e QRCode */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="mb-4 text-lg font-bold text-white">QRCode</h2>

          {table.qrcodeData && (
            <div className="mb-4 flex justify-center rounded-lg bg-white p-4">
              <img src={table.qrcodeData} alt="QRCode" className="size-64" />
            </div>
          )}

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-neutral-400">URL</p>
              <p className="break-all font-mono text-neutral-200">{table.qrcodeUrl}</p>
            </div>

            <div>
              <p className="text-neutral-400">Capacidade</p>
              <p className="text-white">{table.capacity} lugares</p>
            </div>

            <div>
              <p className="text-neutral-400">Status</p>
              <select
                value={table.status}
                onChange={(e) =>
                  setTable({...table, status: e.target.value as TableStatus})
                }
                className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2 text-white"
              >
                <option value="AVAILABLE">Disponível</option>
                <option value="OCCUPIED">Ocupada</option>
                <option value="RESERVED">Reservada</option>
                <option value="MAINTENANCE">Manutenção</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => alert("QRCode regenerado!")}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <RotateCw className="mr-2 size-4" />
                Regenerar QR
              </Button>

              <Button
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = table.qrcodeData;
                  link.download = `mesa-${table.number}-qrcode.png`;
                  link.click();
                }}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <Download className="mr-2 size-4" />
                Baixar
              </Button>
            </div>
          </div>
        </div>

        {/* Pedidos recentes */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="mb-4 text-lg font-bold text-white">Pedidos Recentes</h2>

          {false ? (
            <div className="space-y-2">
              {table.orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        Pedido #{order.number}
                      </p>
                      <p className="text-sm text-neutral-400">{order.customerName}</p>
                    </div>
                    <span className="rounded px-2 py-1 text-xs font-medium bg-blue-900/30 text-blue-400">
                      {order.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-neutral-400">R$ {order.total.toFixed(2)}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-400">Nenhum pedido registrado</p>
          )}
        </div>
      </div>
    </div>
  );
}
