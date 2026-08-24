import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/qr/$storeSlug/$qrcodeId")({
  component: QRCodeRedirect,
});

/// Rota de redirecionamento do QR Code da mesa.
/// O qrcodeId é o Table.id (QR Token permanente, nunca muda).
function QRCodeRedirect() {
  const { storeSlug, qrcodeId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Armazenar QR Token (tableId) no localStorage (expira ao confirmar pedido)
    // Este ID permanece o mesmo para TODAS as sessões futuras da mesa.
    if (qrcodeId) {
      localStorage.setItem("tableId", qrcodeId);

      // Buscar número da mesa do mapeamento
      const storeSlugKey = `tableNumbers_${storeSlug}`;
      const tableNumberMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");
      const tableNumber = tableNumberMap[qrcodeId];
      if (tableNumber) {
        localStorage.setItem("tableNumber", tableNumber.toString());
      }
    }

    // Redirecionar para o cardápio da loja
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
