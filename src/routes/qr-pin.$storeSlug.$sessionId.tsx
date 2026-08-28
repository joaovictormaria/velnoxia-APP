import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { validateTableSessionPinFn } from "@/server/functions/table-session.fn";
import { Button } from "@/components/ui/button";
import { atualizarContextoDeMesa, lerContextoDeMesa } from "@/lib/contexto-de-mesa";

export const Route = createFileRoute("/qr-pin/$storeSlug/$sessionId")({
  component: QRPinEntry,
});

function QRPinEntry() {
  const { storeSlug, sessionId } = Route.useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tableId, setTableId] = useState<string | null>(null);

  // O contexto desta loja, aberto pelo scan do QR que trouxe o cliente até aqui.
  useEffect(() => {
    setTableId(lerContextoDeMesa(storeSlug)?.tableId ?? null);
  }, [storeSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length !== 4) {
      setError("PIN deve ter exatamente 4 dígitos");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await validateTableSessionPinFn({
        data: {
          storeSlug,
          sessionId,
          pin,
        },
      });

      if (result.ok) {
        // PIN validado: o aparelho passa a ter autorização dentro do contexto
        // já aberto. Sem contexto, nada é gravado — um PIN correto não inventa
        // uma mesa que este navegador nunca escaneou.
        atualizarContextoDeMesa(storeSlug, { deviceToken: result.deviceToken });

        // Redirecionar para o cardápio
        navigate({
          to: "/$storeSlug",
          params: { storeSlug },
          search: { tableId },
        });
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Erro ao validar PIN. Tente novamente.");
      console.error("PIN validation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(value);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-neutral-900 to-neutral-950">
      <div className="w-full max-w-md px-6">
        <div className="rounded-lg bg-neutral-900 p-8 shadow-xl border border-neutral-800">
          {/* Cabeçalho */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Digite o PIN</h1>
            <p className="text-neutral-400">
              Peça o código de 4 dígitos para o primeiro dispositivo
            </p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Input de PIN */}
            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={handlePinChange}
                placeholder="0000"
                className="w-full text-center text-4xl font-bold tracking-widest bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg py-4 focus:border-blue-500 focus:outline-none transition"
                autoFocus
              />
            </div>

            {/* Mensagem de erro */}
            {error && (
              <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Botão de envio */}
            <Button
              type="submit"
              disabled={pin.length !== 4 || loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition"
            >
              {loading ? "Validando..." : "Confirmar"}
            </Button>
          </form>

          {/* Informação adicional */}
          <div className="mt-6 text-center text-sm text-neutral-500">
            <p>Sessão ID: <code className="text-neutral-400">{sessionId.slice(0, 8)}...</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}
