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
  const sessionResult = await getOrCreateOpenTableSession(storeId, tableId);
  console.log(`[ORCHESTRATE] Table ${tableId}: session ${sessionResult.id}, hasPin: ${!!(sessionResult as any).pin}`);

  // Step 2: Check if this is the first device
  const existingDevices = await checkExistingDevices(sessionResult.id);
  const isFirstDevice = existingDevices === 0;
  console.log(`[ORCHESTRATE] Session ${sessionResult.id}: existingDevices=${existingDevices}, isFirstDevice=${isFirstDevice}`);

  // Step 3: If first device, mark table as OCCUPIED
  if (isFirstDevice) {
    await prisma.table.update({
      where: { id: tableId },
      data: { status: "OCCUPIED" },
    });
    console.log(`[ORCHESTRATE] Marked table ${tableId} as OCCUPIED`);
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
