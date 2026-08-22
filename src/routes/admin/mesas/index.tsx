import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { QrCode, Copy, Download, Trash2, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateUUID } from "@/lib/uuid";
import { generateQRCodeDataUrl, generateQRCodePNG } from "@/lib/qrcode-generator";

export const Route = createFileRoute("/admin/mesas/")({
  component: MesasPage,
});

interface GeneratedQRCode {
  id: string;
  url: string;
  qrImage: string;
  createdAt: Date;
  ordersCount: number;
}

function MesasPage() {
  const { admin } = Route.useRouteContext();
  const [qrcodes, setQrcodes] = useState<GeneratedQRCode[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const generateQRCode = async () => {
    setGenerating(true);
    try {
      const newId = generateUUID();
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://velnoxia.app";
      const storeSlug = admin?.store.slug || "default";
      const qrUrl = `${baseUrl}/qr/${storeSlug}/${newId}`;
      const qrImage = await generateQRCodeDataUrl(qrUrl);

      const newQRCode: GeneratedQRCode = {
        id: newId,
        url: qrUrl,
        qrImage,
        createdAt: new Date(),
        ordersCount: 0,
      };
      setQrcodes([newQRCode, ...qrcodes]);
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
    if (confirm(`Deletar QRCode ${id}?`)) {
      setQrcodes(qrcodes.filter(q => q.id !== id));
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
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-400">Total de QRCodes</p>
          <p className="text-2xl font-bold text-blue-400">{qrcodes.length}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-400">Mesas Abertas</p>
          <p className="text-2xl font-bold text-red-400">{qrcodes.filter(q => q.ordersCount > 0).length}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-400">Pedidos Abertos</p>
          <p className="text-2xl font-bold text-yellow-400">{qrcodes.reduce((sum, q) => sum + q.ordersCount, 0)}</p>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {qrcodes.map((qr) => (
            <div key={qr.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4 flex justify-center rounded-lg bg-white p-3">
                <img src={qr.qrImage} alt={qr.id} className="size-48" />
              </div>

              <div className="mb-4 space-y-2 text-sm">
                <div>
                  <p className="text-neutral-400">ID</p>
                  <p className="font-mono font-bold text-white">{qr.id}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Pedidos Abertos</p>
                  <p className={`font-bold ${qr.ordersCount > 0 ? "text-red-400" : "text-green-400"}`}>
                    {qr.ordersCount}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => copyLink(qr.url)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Copy className="mr-1 size-4" />
                  {copied === qr.url ? "Copiado!" : "Copiar Link"}
                </Button>

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
