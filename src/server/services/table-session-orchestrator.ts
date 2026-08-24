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
  pinPlaintext?: string, // PIN passed in for first-time display only
): Promise<{
  sessionId: string;
  firstDevice: boolean;
  deviceToken?: string;
  pin?: string; // PIN shown to first device ONLY
}> {
  // Step 1: Get or create session
  const session = await getOrCreateOpenTableSession(storeId, tableId);

  // Step 2: Check if this is the first device
  const existingDevices = await checkExistingDevices(session.id);
  const isFirstDevice = existingDevices === 0;

  // Step 3: Authorize device
  if (isFirstDevice) {
    // First device: authorize immediately without PIN
    const device = await authorizeDeviceForSession(storeId, session.id, true);
    return {
      sessionId: session.id,
      firstDevice: true,
      deviceToken: device.deviceToken,
      pin: pinPlaintext, // Return PIN for display ONLY on first device
    };
  } else {
    // Second+ device: return only sessionId, client must validate PIN first
    return {
      sessionId: session.id,
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
