import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { QrCode, Copy, Download, Trash2, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateUUID } from "@/lib/uuid";
import { generateQRCodeDataUrl, generateQRCodePNG } from "@/lib/qrcode-generator";
import { getTableOrderCountsFn } from "@/server/functions/orders.fn";

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
  const [qrcodes, setQrcodes] = useState<GeneratedQRCode[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [qrImageCache, setQrImageCache] = useState<Record<string, string>>({});

  // Carregar contagem de pedidos abertos por mesa
  const { data: tableOrderCounts = {} } = useQuery({
    queryKey: ["tableOrderCounts"],
    queryFn: () => getTableOrderCountsFn({}),
    refetchInterval: 5_000,
  });

  // Carregar QRCodes salvos do localStorage ao montar
  useEffect(() => {
    if (!admin?.store?.slug) return;
    const storeSlugKey = `tableNumbers_${admin.store.slug}`;
    const tableNumberMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");

    const generatedQRCodes: GeneratedQRCode[] = Object.entries(tableNumberMap)
      .map(([id, number]) => ({
        id,
        number: number as number,
        url: `${window.location.origin}/qr/${admin.store.slug}/${id}`,
        qrImage: qrImageCache[id] || "", // Usar cache se existir
        createdAt: new Date(),
        ordersCount: (tableOrderCounts[number as any] ?? 0) as number,
      }))
      .filter((qr) => qr.ordersCount > 0 || Object.keys(tableNumberMap).length <= 10); // Mostrar todas se menos de 10

    setQrcodes(generatedQRCodes);
  }, [admin, admin?.store?.slug]);

  const generateQRCode = async () => {
    setGenerating(true);
    try {
      if (!admin?.store?.slug) {
        alert("Erro: Não foi possível obter informações da loja");
        setGenerating(false);
        return;
      }

      const newId = generateUUID();
      const tableNumber = qrcodes.length + 1;

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://velnoxia.app";
      const storeSlug = admin.store.slug;
      const qrUrl = `${baseUrl}/qr/${storeSlug}/${newId}`;
      const qrImage = await generateQRCodeDataUrl(qrUrl);

      const newQRCode: GeneratedQRCode = {
        id: newId,
        number: tableNumber,
        url: qrUrl,
        qrImage,
        createdAt: new Date(),
        ordersCount: 0,
      };

      // Guardar mapeamento tableId -> tableNumber no localStorage para uso na rota QR
      const storeSlugKey = `tableNumbers_${admin.store.slug}`;
      const existingMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");
      existingMap[newId] = tableNumber;
      localStorage.setItem(storeSlugKey, JSON.stringify(existingMap));

      // Armazenar imagem no cache
      setQrImageCache((prev) => ({ ...prev, [newId]: qrImage }));
      setQrcodes([...qrcodes, newQRCode]);
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

  const deleteQRCode = (id: string) => {
    if (confirm(`Deletar QRCode Mesa?`)) {
      setQrcodes(qrcodes.filter(q => q.id !== id));
      setQrImageCache((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      // Remover do localStorage também
      if (admin?.store?.slug) {
        const storeSlugKey = `tableNumbers_${admin.store.slug}`;
        const tableNumberMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");
        delete tableNumberMap[id];
        localStorage.setItem(storeSlugKey, JSON.stringify(tableNumberMap));
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
            <div key={qr.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 w-48 aspect-square flex flex-col justify-between">
              <div className="mb-4 space-y-2 text-center text-sm">
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

              <div className="space-y-2">
                <a
                  href={qr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 text-center"
                >
                  Abrir Cardápio
                </a>

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
