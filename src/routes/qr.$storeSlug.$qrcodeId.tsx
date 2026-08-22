import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createTableSessionFn } from "@/server/functions/table-session.fn";

export const Route = createFileRoute("/qr/$storeSlug/$qrcodeId")({
  component: QRCodeRedirect,
});

function QRCodeRedirect() {
  const { storeSlug, qrcodeId } = Route.useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initSession = async () => {
      try {
        // Carregar mapeamento tableId -> tableNumber do localStorage
        const storeSlugKey = `tableNumbers_${storeSlug}`;
        const tableNumberMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");
        const tableNumber = tableNumberMap[qrcodeId];

        if (!tableNumber) {
          setError("QRCode inválido ou expirado");
          return;
        }

        // Criar sessão segura no servidor
        const result = await createTableSessionFn({
          data: {
            storeSlug,
            tableId: qrcodeId,
            tableNumber,
          },
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        // Guardar apenas o token seguro no localStorage
        localStorage.setItem("tableSessionToken", result.sessionToken);
        localStorage.setItem("tableNumber", result.tableNumber.toString());

        // Redirecionar para o cardápio
        navigate({
          to: "/$storeSlug",
          params: { storeSlug },
        });
      } catch (err) {
        setError("Erro ao processar QRCode");
        console.error(err);
      }
    };

    initSession();
  }, [storeSlug, qrcodeId, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="text-center">
          <p className="text-red-400">{error}</p>
          <p className="mt-4 text-sm text-neutral-400">Tente escanear o QRCode novamente</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="text-center">
        <p className="text-white">Redirecionando para o cardápio...</p>
      </div>
    </div>
  );
}
