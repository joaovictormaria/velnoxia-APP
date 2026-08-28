import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { orchestrateTableSessionFn } from "@/server/functions/table-session.fn";
import {
  atualizarContextoDeMesa,
  gravarContextoDeMesa,
  limparContextoDeMesa,
} from "@/lib/contexto-de-mesa";

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

    // Sessão anterior encerra aqui: escanear de novo é começar de novo.
    limparContextoDeMesa(storeSlug);

    // Buscar número da mesa do mapeamento
    const storeSlugKey = `tableNumbers_${storeSlug}`;
    const tableNumberMap = JSON.parse(localStorage.getItem(storeSlugKey) || "{}");
    const tableNumber = tableNumberMap[qrcodeId];

    /*
     * ESTE é o único lugar do sistema que abre um contexto de mesa. Chegar
     * por aqui — pelo QR da mesa, nesta loja — é o que define um pedido de
     * mesa; qualquer outra porta leva à vitrine pública.
     */
    gravarContextoDeMesa(storeSlug, {
      tableId: qrcodeId,
      tableNumber: tableNumber ? Number(tableNumber) : null,
    });

    // Orchestrar table session para coordenar fluxo de PIN
    orchestrateTableSessionFn({ data: { storeSlug, tableId: qrcodeId } })
      .then((res) => {
        if (res.ok) {
          atualizarContextoDeMesa(storeSlug, { sessionId: res.sessionId });

          if (res.firstDevice && res.deviceToken) {
            // Primeiro dispositivo: autorizado automaticamente
            atualizarContextoDeMesa(storeSlug, { deviceToken: res.deviceToken });
            // Armazenar PIN para exibir na próxima tela
            if (res.pin) {
              atualizarContextoDeMesa(storeSlug, { pin: res.pin });
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
