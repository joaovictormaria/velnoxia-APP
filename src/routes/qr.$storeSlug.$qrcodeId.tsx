import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

    // Limpar dados de sessão anterior (novo cliente)
    localStorage.removeItem("deviceToken");
    localStorage.removeItem("pin");
    localStorage.removeItem("sessionId");

    // Armazenar QR Token (tableId) no localStorage
    localStorage.setItem("tableId", qrcodeId);

    // Buscar número da mesa do mapeamento
    const storeSlugKey = `tableNumbers_${storeSlug}`;
    const tableNumberMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");
    const tableNumber = tableNumberMap[qrcodeId];
    if (tableNumber) {
      localStorage.setItem("tableNumber", tableNumber.toString());
    }

    // Orchestrar table session para coordenar fluxo de PIN
    orchestrateTableSessionFn({ data: { storeSlug, tableId: qrcodeId } })
      .then((res) => {
        if (res.ok) {
          localStorage.setItem("sessionId", res.sessionId);

          if (res.firstDevice && res.deviceToken) {
            // Primeiro dispositivo: autorizado automaticamente
            localStorage.setItem("deviceToken", res.deviceToken);
            // Armazenar PIN para exibir na próxima tela
            if (res.pin) {
              localStorage.setItem("pin", res.pin);
            }
            // Mostrar PIN antes de ir para o cardápio
            navigate({
              to: "/qr-show-pin/$storeSlug/$sessionId",
              params: { storeSlug, sessionId: res.sessionId }
            });
          } else {
            // Segundo+ dispositivo: requer PIN
            // Redirecionar para entrada de PIN
            navigate({
              to: "/qr-pin/$storeSlug/$sessionId",
              params: { storeSlug, sessionId: res.sessionId }
            });
          }
        } else {
          // Erro ao orquestrar sessão
          alert(res.error || "Erro ao acessar a mesa");
          navigate({
            to: "/$storeSlug",
            params: { storeSlug },
            search: { tableId: qrcodeId }
          });
        }
      })
      .catch((err) => {
        // Erro na chamada de função
        console.error("Orchestration error:", err);
        alert("Erro ao processar QR code");
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
