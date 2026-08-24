import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { orchestrateTableSessionFn } from "@/server/functions/table-session.fn";

export const Route = createFileRoute("/qr/$storeSlug/$qrcodeId")({
  component: QRCodeRedirect,
});

/// Rota de redirecionamento do QR Code da mesa.
/// O qrcodeId é o Table.id (QR Token permanente, nunca muda).
function QRCodeRedirect() {
  const { storeSlug, qrcodeId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!qrcodeId) return;

    // Armazenar QR Token (tableId) no localStorage
    localStorage.setItem("tableId", qrcodeId);

    // Buscar número da mesa do mapeamento
    const storeSlugKey = `tableNumbers_${storeSlug}`;
    const tableNumberMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");
    const tableNumber = tableNumberMap[qrcodeId];
    if (tableNumber) {
      localStorage.setItem("tableNumber", tableNumber.toString());
    }

    // Orchestrar table session para obter deviceToken, DEPOIS redirecionar
    orchestrateTableSessionFn({ data: { storeSlug, tableId: qrcodeId } })
      .then((res) => {
        if (res.ok) {
          localStorage.setItem("sessionId", res.sessionId);
          if (res.deviceToken) {
            localStorage.setItem("deviceToken", res.deviceToken);
          }
        }
        // Redirecionar após obter o deviceToken (ou após timeout)
        navigate({
          to: "/$storeSlug",
          params: { storeSlug },
          search: { tableId: qrcodeId }
        });
      })
      .catch(() => {
        // Mesmo com erro, redirecionar
        navigate({
          to: "/$storeSlug",
          params: { storeSlug },
          search: { tableId: qrcodeId }
        });
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
