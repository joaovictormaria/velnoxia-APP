import { Download, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface QrcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: number;
  qrcodeUrl: string;
  qrcodeData: string;
}

export function QrcodeModal({
  isOpen,
  onClose,
  tableNumber,
  qrcodeUrl,
  qrcodeData,
}: QrcodeModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = qrcodeData;
    link.download = `mesa-${tableNumber}-qrcode.png`;
    link.click();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrcodeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative rounded-lg bg-neutral-900 p-6 max-w-md w-full mx-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1 hover:bg-neutral-800"
        >
          <X className="size-5" />
        </button>

        <h2 className="mb-4 text-lg font-bold text-white">
          QRCode - Mesa #{tableNumber}
        </h2>

        <div className="mb-4 flex justify-center rounded-lg bg-white p-4">
          <img src={qrcodeData} alt="QRCode" className="size-80" />
        </div>

        <div className="mb-4 space-y-2">
          <p className="text-sm text-neutral-400">URL Pública:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={qrcodeUrl}
              readOnly
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-300"
            />
            <Button
              onClick={handleCopyLink}
              size="sm"
              variant="outline"
              className="gap-1"
            >
              <Copy className="size-4" />
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleDownload} className="flex-1 gap-2">
            <Download className="size-4" />
            Baixar PNG
          </Button>
          <Button onClick={onClose} variant="outline" className="flex-1">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
