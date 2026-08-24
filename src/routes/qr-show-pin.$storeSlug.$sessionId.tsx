import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Share2, ChevronRight } from "lucide-react";
import { getSessionPinHintFn } from "@/server/functions/table-session.fn";

export const Route = createFileRoute("/qr-show-pin/$storeSlug/$sessionId")({
  component: QRShowPIN,
});

function QRShowPIN() {
  const { storeSlug, sessionId } = Route.useParams();
  const navigate = useNavigate();
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pinHint, setPinHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  useEffect(() => {
    const storedTableId = localStorage.getItem("tableId");
    const storedTableNumber = localStorage.getItem("tableNumber");
    const storedPin = localStorage.getItem("pin");

    setTableId(storedTableId);
    setTableNumber(storedTableNumber);

    if (storedPin) {
      // PIN foi armazenado na localStorage pela rota QR
      setPin(storedPin);
    } else if (process.env.NODE_ENV !== "production") {
      // Em desenvolvimento: gerar PIN para mostrar se não houver
      // (útil quando sessão já existe de testes anteriores)
      const demoPin = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0");
      setPin(demoPin);
      localStorage.setItem("pin", demoPin);
    }

    setLoading(false);
  }, [storeSlug, sessionId]);

  const handleCopyPin = () => {
    if (pin) {
      navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleContinue = () => {
    navigate({
      to: "/$storeSlug",
      params: { storeSlug },
      search: { tableId },
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-neutral-950 to-neutral-900 px-4 py-8">
      {/* Cabeçalho com número da mesa */}
      {tableNumber && (
        <div className="text-center">
          <p className="text-sm text-neutral-400 mb-2">Sua Mesa</p>
          <h1 className="text-5xl font-bold text-white">MESA {tableNumber}</h1>
        </div>
      )}

      {/* Container Principal do PIN */}
      <div className="w-full max-w-sm rounded-3xl border-2 border-blue-500 bg-gradient-to-br from-blue-950 to-blue-900 p-8 shadow-2xl">
        <p className="text-center text-sm text-blue-200 mb-6 font-medium">
          Compartilhe este código com seus amigos
        </p>

        {/* PIN em Destaque */}
        <div className="mb-8">
          {pin ? (
            <div className="rounded-2xl bg-blue-500 px-8 py-6 text-center shadow-lg">
              <p className="text-xs text-blue-100 mb-3 uppercase tracking-wider font-semibold">
                Código de Acesso
              </p>
              <p className="text-6xl font-black text-white tracking-widest">
                {pin}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-blue-500 px-8 py-6 text-center shadow-lg">
              <p className="text-xl text-blue-100">Carregando...</p>
            </div>
          )}
        </div>

        {/* Instruções */}
        <div className="mb-8 rounded-2xl bg-blue-900/50 p-4 border border-blue-700">
          <p className="text-sm text-blue-100 text-center leading-relaxed">
            Outros dispositivos na sua mesa precisam deste código para acessar o cardápio
          </p>
        </div>

        {/* Botão de Copiar */}
        <button
          onClick={handleCopyPin}
          disabled={!pin}
          className="w-full mb-4 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-600 text-white font-semibold py-3 transition-colors"
        >
          <Share2 className="size-5" />
          {copied ? "Copiado!" : "Copiar Código"}
        </button>

        {/* Botão Continuar */}
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-neutral-100 text-neutral-900 font-semibold py-3 transition-colors"
        >
          Ir para o Cardápio
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Dica na base */}
      <div className="max-w-sm text-center text-xs text-neutral-500">
        <p>💡 Dica: O código é válido por 24 horas</p>
      </div>
    </div>
  );
}
