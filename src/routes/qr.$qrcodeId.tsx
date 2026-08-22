import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/qr/$qrcodeId")({
  component: QRCodeRedirect,
});

function QRCodeRedirect() {
  const { qrcodeId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirecionar para a página de pedidos com tableId
    // Formato esperado: qrcodeId é o UUID/ID da mesa
    navigate({ to: `/pedidos?tableId=${qrcodeId}` });
  }, [qrcodeId, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="text-center">
        <p className="text-white">Redirecionando para o cardápio...</p>
      </div>
    </div>
  );
}
