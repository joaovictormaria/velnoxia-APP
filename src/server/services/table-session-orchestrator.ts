import { prisma } from "@/server/db/client";
import { getOrCreateOpenTableSession, authorizeDeviceForSession } from "./table-session-service";

/**
 * Orquestra o fluxo completo de QR Code.
 *
 * Chamado uma única vez pelo frontend após escanear QR.
 * Coordena:
 *   1. Criar ou recuperar sessão
 *   2. Se primeira vez: autorizar dispositivo automaticamente
 *   3. Se segunda+ vez: retornar apenas sessionId (PIN será digitado)
 *
 * Resposta varia conforme seja primeira ou segunda+ dispositivo.
 */
export async function orchestrateTableSession(
  storeId: string,
  tableId: string,
): Promise<{
  sessionId: string;
  firstDevice: boolean;
  deviceToken?: string;
  pin?: string; // PIN shown to first device ONLY (from newly created session)
}> {
  // Step 1: Get or create session (returns PIN if newly created)
  let sessionResult = await getOrCreateOpenTableSession(storeId, tableId);

  // Step 2: Verificar se sessão tem pedidos
  const sessionOrders = await prisma.order.count({
    where: {
      tableId,
      status: { not: "COMPLETED" }, // Ignorar pedidos já entregues
    },
  });

  const hasActiveOrders = sessionOrders > 0;

  /*
   * V3 — "SEM PEDIDOS" NÃO É PROVA DE PRESENÇA.
   *
   * Aqui havia `if (!hasActiveOrders) isFirstDevice = true`, e era um buraco de
   * autorização: o `tableId` vem impresso no QR, é permanente e público, então
   * qualquer um que o conhecesse chamava este fluxo de fora e era tratado como
   * primeira pessoa — recebendo deviceToken sem nunca ter estado na mesa.
   *
   * A regra existia por um motivo real, porém: a sessão dura 24h, então a do
   * almoço ainda está OPEN no jantar, e o cliente novo virava "segundo
   * aparelho", preso atrás de um PIN que ninguém lhe deu.
   *
   * A troca é encerrar a sessão parada e deixar o fluxo normal criar outra, em
   * vez de distribuir autorização. O gatilho continua sendo "nenhum pedido
   * ativo", mas agora ele decide o CICLO DE VIDA da sessão — não quem entra.
   */
  const aparelhosNaSessao = await checkExistingDevices(sessionResult.id);
  if (!hasActiveOrders && aparelhosNaSessao > 0) {
    console.log(
      `[TABLE SESSION] Sessão ${sessionResult.id} ociosa (sem pedidos) - encerrando e abrindo nova`,
    );
    await prisma.tableSession.update({
      where: { id: sessionResult.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    sessionResult = await getOrCreateOpenTableSession(storeId, tableId);
  }

  const isFirstDevice = (await checkExistingDevices(sessionResult.id)) === 0;

  // Step 3: If first device, mark table as OCCUPIED
  if (isFirstDevice) {
    try {
      await prisma.table.update({
        where: { id: tableId },
        data: { status: "OCCUPIED" },
      });
    } catch (error) {
      // If update fails, don't break the entire flow
      // Log but continue
      console.error(`[TABLE SESSION] Failed to mark table ${tableId} as OCCUPIED:`, error);
    }
  }

  // Step 4: Authorize device
  if (isFirstDevice) {
    // First device: authorize immediately without PIN
    const device = await authorizeDeviceForSession(storeId, sessionResult.id, true);
    return {
      sessionId: sessionResult.id,
      firstDevice: true,
      deviceToken: device.deviceToken,
      pin: (sessionResult as any).pin, // Return PIN if available (newly created session)
    };
  } else {
    // Second+ device: return only sessionId, client must validate PIN first
    return {
      sessionId: sessionResult.id,
      firstDevice: false,
      // deviceToken will be returned after PIN validation
      // pin is NOT returned for second+ devices
    };
  }
}

/**
 * Check how many active (non-revoked) devices are authorized for a session.
 */
async function checkExistingDevices(sessionId: string): Promise<number> {
  const count = await prisma.sessionDevice.count({
    where: {
      sessionId,
      revokedAt: null, // Only count active devices
    },
  });

  return count;
}
