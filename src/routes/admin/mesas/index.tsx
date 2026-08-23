import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, Copy, Download, Trash2, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateUUID } from "@/lib/uuid";
import { generateQRCodeDataUrl, generateQRCodePNG } from "@/lib/qrcode-generator";
import { getTableOrderCountsFn, getNextTableNumberFn, listTablesFn, deleteTableFn } from "@/server/functions/orders.fn";
import { createTableFn } from "@/routes/api/tables/create";

const CORES = [
  "bg-red-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-yellow-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function getCorPorMesa(tableId: string): string {
  const hash = tableId.charCodeAt(0) + tableId.charCodeAt(tableId.length - 1);
  return CORES[hash % CORES.length];
}


export const Route = createFileRoute("/admin/mesas/")({
  component: MesasPage,
});

interface GeneratedQRCode {
  id: string;
  number: number;
  url: string;
  qrImage: string;
  createdAt: Date;
  ordersCount: number;
}

function MesasPage() {
  const context = Route.useRouteContext() as any;
  const admin = context?.admin;
  const queryClient = useQueryClient();
  const [qrcodes, setQrcodes] = useState<GeneratedQRCode[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Carregar mesas do banco de dados
  const { data: tables = [] } = useQuery({
    queryKey: ["tables"],
    queryFn: () => listTablesFn({}),
    refetchInterval: 5_000,
  });

  // Carregar contagem de pedidos abertos por mesa
  const { data: tableOrderCounts = {} } = useQuery({
    queryKey: ["tableOrderCounts"],
    queryFn: () => getTableOrderCountsFn({}),
    refetchInterval: 5_000,
  });

  // Atualizar QRCodes quando as mesas forem carregadas
  useEffect(() => {
    if (!admin?.store?.slug || !tables.length) return;

    const generatedQRCodes: GeneratedQRCode[] = tables.map(table => ({
      id: table.id,
      number: table.number,
      url: `${window.location.origin}/qr/${admin.store.slug}/${table.id}`,
      qrImage: table.qrcodeData || "",
      createdAt: new Date(),
      ordersCount: (tableOrderCounts[table.number] ?? 0) as number,
    }));

    setQrcodes(generatedQRCodes);
  }, [tables, tableOrderCounts, admin?.store?.slug]);

  const generateQRCode = async () => {
    setGenerating(true);
    try {
      if (!admin?.store?.slug || !admin?.store?.id) {
        alert("Erro: Não foi possível obter informações da loja");
        setGenerating(false);
        return;
      }

      const newId = generateUUID();
      // Get next table number from database
      const tableNumber = await getNextTableNumberFn({});

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://velnoxia.app";
      const storeSlug = admin.store.slug;
      const qrUrl = `${baseUrl}/qr/${storeSlug}/${newId}`;
      const qrImage = await generateQRCodeDataUrl(qrUrl);

      // Criar Table no banco de dados
      const result = await createTableFn({
        data: {
          id: newId,
          storeId: admin.store.id,
          number: tableNumber,
          capacity: 4,
          qrcodeUrl: qrUrl,
          qrcodeData: qrImage,
        },
      });

      if (!result.ok) {
        throw new Error(result.error || "Falha ao criar mesa no banco de dados");
      }

      // Recarregar as mesas do banco de dados
      await queryClient.invalidateQueries({ queryKey: ["tables"] });
    } catch (error) {
      console.error("Erro ao gerar QRCode:", error);
      alert("Erro ao gerar QRCode. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadQR = async (qr: GeneratedQRCode) => {
    try {
      const blob = await generateQRCodePNG(qr.url);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${qr.id}-qrcode.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao baixar QRCode:", error);
      alert("Erro ao baixar QRCode. Tente novamente.");
    }
  };

  const deleteQRCode = async (id: string) => {
    if (confirm(`Deletar QRCode Mesa?`)) {
      try {
        const result = await deleteTableFn({ data: { id } });
        if (!result.ok) {
          alert(`Erro ao deletar: ${result.error}`);
          return;
        }

        // Recarregar as mesas do banco de dados
        await queryClient.invalidateQueries({ queryKey: ["tables"] });
      } catch (error) {
        console.error("Erro ao deletar mesa:", error);
        alert("Erro ao deletar mesa. Tente novamente.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mesas (QRCode)</h1>
          <p className="text-sm text-neutral-400">
            {qrcodes.length} QRCodes gerados • {qrcodes.reduce((sum, q) => sum + q.ordersCount, 0)} pedidos abertos
          </p>
        </div>
        <Button onClick={generateQRCode} disabled={generating} className="gap-2">
          {generating ? (
            <>
              <Loader className="size-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <QrCode className="size-4" />
              Gerar Novo QRCode
            </>
          )}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm text-neutral-600">Total de QRCodes</p>
          <p className="text-2xl font-bold text-blue-600">{qrcodes.length}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm text-neutral-600">Mesas Abertas</p>
          <p className="text-2xl font-bold text-red-600">{qrcodes.filter(q => q.ordersCount > 0).length}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm text-neutral-600">Pedidos Abertos</p>
          <p className="text-2xl font-bold text-yellow-600">{qrcodes.reduce((sum, q) => sum + q.ordersCount, 0)}</p>
        </div>
      </div>

      {/* QRCodes Grid */}
      {qrcodes.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center">
          <QrCode className="mx-auto mb-4 size-12 text-neutral-600" />
          <p className="text-neutral-400">Nenhum QRCode gerado ainda</p>
          <Button onClick={generateQRCode} className="mt-4">Gerar Primeiro QRCode</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {qrcodes.map((qr) => (
            <div key={qr.id} className="rounded-lg border border-neutral-200 bg-neutral-50 w-48 flex flex-col justify-between overflow-hidden">
              <div className={`h-2 ${getCorPorMesa(qr.id)}`} />
              <div className="p-4 space-y-2 text-center text-sm flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-neutral-600">Mesa</p>
                  <p className="text-xl font-bold text-neutral-900">Mesa {qr.number}</p>
                </div>
                <div>
                  <p className="text-neutral-600">Pedidos Abertos</p>
                  <p className={`font-bold ${qr.ordersCount > 0 ? "text-red-600" : "text-green-600"}`}>
                    {qr.ordersCount}
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-2">
                <Button
                  onClick={() => downloadQR(qr)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Download className="mr-1 size-4" />
                  Baixar PNG
                </Button>

                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(qr.url);
                    alert("Link copiado: " + qr.url);
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Ver Link
                </Button>

                <Button
                  onClick={() => deleteQRCode(qr.id)}
                  variant="outline"
                  size="sm"
                  className="w-full text-red-400 hover:bg-red-900/20"
                >
                  <Trash2 className="mr-1 size-4" />
                  Deletar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
