import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/qr/$storeSlug/$qrcodeId")({
  component: QRCodeRedirect,
});

function QRCodeRedirect() {
  const { storeSlug, qrcodeId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Armazenar tableId no localStorage para manter durante navegação
    if (qrcodeId) {
      localStorage.setItem("tableId", qrcodeId);
      localStorage.setItem("tableIdExpiresAt", (Date.now() + 1000 * 60 * 60 * 24).toString());
    }

    // Redirecionar para o cardápio da loja com tableId como parâmetro
    navigate({
      to: "/$storeSlug",
      params: { storeSlug },
      search: { tableId: qrcodeId }
    });
  }, [storeSlug, qrcodeId, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="text-center">
        <p className="text-white">Redirecionando para o cardápio...</p>
      </div>
    </div>
  );
}
