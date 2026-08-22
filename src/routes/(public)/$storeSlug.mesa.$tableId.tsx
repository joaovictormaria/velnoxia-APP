import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getTableInfoFn } from "@/server/functions/table-orders.fn";
import { useTable } from "@/lib/table-context";
import { useEffect } from "react";
import { ChefHat, Users, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/(public)/$storeSlug/mesa/$tableId")({
  component: MesaEntryPage,
});

function MesaEntryPage() {
  const { storeSlug, tableId } = Route.useParams();
  const navigate = useNavigate();
  const { setTableId } = useTable();

  const { data, isLoading, error } = useQuery({
    queryKey: ["table-info", storeSlug, tableId],
    queryFn: () => getTableInfoFn({ data: { storeSlug, tableId } }),
  });

  useEffect(() => {
    if (data?.table) {
      setTableId(tableId, data.table.number);
    }
  }, [data, tableId, setTableId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-900 to-black">
        <div className="text-center">
          <div className="mb-4 inline-block animate-spin">
            <QrCode className="size-8 text-[#E11D2E]" />
          </div>
          <p className="text-neutral-400">Carregando mesa...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-900 to-black">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center max-w-md">
          <h1 className="mb-2 text-2xl font-bold text-white">Mesa não encontrada</h1>
          <p className="mb-6 text-neutral-400">
            {(error as Error)?.message || "A mesa que você está procurando não existe."}
          </p>
          <Button
            onClick={() => navigate({ to: "/" })}
            className="w-full"
          >
            Voltar para Home
          </Button>
        </div>
      </div>
    );
  }

  const handleStartOrder = () => {
    navigate({ to: `/${storeSlug}/cardapio` });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-black">
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          {/* Header com logo */}
          <div className="text-center">
            <div className="mb-4 inline-flex rounded-full bg-[#E11D2E]/10 p-4">
              <ChefHat className="size-8 text-[#E11D2E]" />
            </div>
            <h1 className="text-3xl font-bold text-white">{data.store.name}</h1>
            <p className="mt-1 text-sm text-neutral-400">Bem-vindo!</p>
          </div>

          {/* Card da mesa */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur p-6">
            <div className="mb-4 text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">
                Sua Mesa
              </p>
              <h2 className="mt-2 text-5xl font-bold text-[#E11D2E]">
                #{data.table.number}
              </h2>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-4 py-3">
                <span className="text-neutral-400">Capacidade</span>
                <div className="flex items-center gap-1">
                  <Users className="size-4 text-neutral-400" />
                  <span className="font-medium text-white">{data.table.capacity} lugares</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-4 py-3">
                <span className="text-neutral-400">Status</span>
                <span className={`font-medium ${
                  data.table.status === "AVAILABLE"
                    ? "text-green-400"
                    : data.table.status === "OCCUPIED"
                      ? "text-red-400"
                      : "text-yellow-400"
                }`}>
                  {data.table.status}
                </span>
              </div>
            </div>
          </div>

          {/* Informações */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-center">
            <p className="text-xs text-neutral-400">
              ✓ QRCode validado com sucesso<br />
              ✓ Mesa {data.table.number} reservada para você<br />
              ✓ Toque em "Começar Pedido" para ver o cardápio
            </p>
          </div>

          {/* Ação principal */}
          <Button
            onClick={handleStartOrder}
            size="lg"
            className="w-full text-base font-semibold"
          >
            Começar Pedido
          </Button>

          {/* Botão secundário */}
          <Button
            onClick={() => navigate({ to: `/${storeSlug}/acompanhar-mesa/${tableId}` })}
            variant="outline"
            className="w-full"
          >
            Acompanhar Pedidos
          </Button>

          {/* Info footer */}
          <div className="text-center text-xs text-neutral-500">
            <p>Sessão preservada enquanto você estiver aqui</p>
          </div>
        </div>
      </div>
    </div>
  );
}
