import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/qr/$qrcodeId")({
  component: QRCodeRedirect,
});

function QRCodeRedirect() {
  const { qrcodeId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Armazenar tableId no localStorage para manter durante navegação
    if (qrcodeId) {
      localStorage.setItem("tableId", qrcodeId);
      localStorage.setItem("tableIdExpiresAt", (Date.now() + 1000 * 60 * 60 * 24).toString());
    }

    // Redirecionar para a página de pedidos com tableId como parâmetro
    navigate({
      to: "/pedidos",
      search: { tableId: qrcodeId }
    });
  }, [qrcodeId, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="text-center">
        <p className="text-white">Redirecionando para o cardápio...</p>
      </div>
    </div>
  );
}
