import { prisma } from "@/server/db/client";
import { generatePin, hashPin, verifyPin } from "@/server/auth/pin";
import { generateDeviceToken, hashDeviceToken } from "@/server/auth/device-token";
import { dentroDoLimite } from "@/server/security/rate-limit";

export interface OpenTableSession {
  id: string;
  tableId: string;
  storeId: string;
  pinHash: string;
  status: "OPEN" | "PAID" | "CLOSED" | "CANCELLED";
  openedAt: Date;
  paidAt: Date | null;
  closedAt: Date | null;
  expiresAt: Date;
  pin?: string; // Only set when newly created (first device sees this)
}

/**
 * Get or create an open session for a table.
 *
 * If a session is already OPEN for this table:
 *   → Returns the existing session
 *
 * If no OPEN session exists:
 *   → Creates new session with PIN
 *   → Protects against concurrency via unique constraint on [tableId, status]
 *
 * Concurrency protection:
 * If two requests arrive simultaneously:
 *   - First one creates the session successfully
 *   - Second one gets unique constraint error
 *   - Second one then retrieves the session that was created by first
 *   - Both return the same session
 */
export async function getOrCreateOpenTableSession(
  storeId: string,
  tableId: string,
): Promise<OpenTableSession> {
  // Validate table exists and belongs to store
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { id: true, storeId: true },
  });

  if (!table) {
    throw new Error("Mesa não encontrada");
  }

  if (table.storeId !== storeId) {
    throw new Error("Não autorizado");
  }

  // Try to find existing OPEN session
  let session = await prisma.tableSession.findFirst({
    where: {
      tableId,
      storeId,
      status: "OPEN",
    },
  });

  console.log(`[TABLE SESSION] Searching for OPEN session for table ${tableId}...`);
  if (session) {
    // Session exists, but we can't recover the PIN (it's hashed)
    // Return the session without PIN - it will only be shown on first creation
    console.log(`[TABLE SESSION] ✓ Found existing OPEN session ${session.id} for table ${tableId}. This is NOT first device!`);
    return session as OpenTableSession;
  }
  console.log(`[TABLE SESSION] ✗ No OPEN session found for table ${tableId}. Looking for closed sessions...`);

  // Check if there's a CLOSED or PAID session (table was liberated)
  // Don't reuse it - create a completely new session for the new customer
  const previousSession = await prisma.tableSession.findFirst({
    where: {
      tableId,
      storeId,
      status: {
        in: ["CLOSED", "PAID", "CANCELLED"],
      },
    },
    orderBy: { closedAt: "desc" },
  });

  if (previousSession) {
    // Table was already used, create a fresh session for new customer
    // Continue to create new session below
    console.log(`[TABLE SESSION] Found previous ${previousSession.status} session ${previousSession.id}, creating fresh session for new customer`);
  } else {
    console.log(`[TABLE SESSION] No previous sessions found either - creating fresh new session`);
  }

  // No open session: create new one
  const pin = generatePin();
  const pinHash = await hashPin(pin);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  try {
    session = await prisma.tableSession.create({
      data: {
        storeId,
        tableId,
        pinHash,
        status: "OPEN",
        expiresAt,
      },
    });

    console.log(`[TABLE SESSION] ✅ CREATED new session ${session.id} for table ${tableId}`);

    // Log masked PIN for admin debugging (only in dev/test, never in production)
    if (process.env.NODE_ENV !== "production") {
      const maskedPin = pin.slice(0, 2) + "**";
      console.log(`[TABLE SESSION] PIN for table ${tableId} (session ${session.id}): ${maskedPin}`);
    }

    // Return PIN only on first creation (for first device display)
    // After this, pin is never exposed again
    return { ...session, pin } as OpenTableSession;
  } catch (error) {
    // If create fails (e.g., unique constraint), try to find the session that was created
    // First try OPEN status (normal case - race condition with another client)
    let existing = await prisma.tableSession.findFirst({
      where: {
        tableId,
        storeId,
        status: "OPEN",
      },
    });

    if (existing) {
      return existing as OpenTableSession;
    }

    // If no OPEN session found, it means the constraint was from a non-OPEN status
    // This can happen if create failed for another reason
    // Try to create again with a fresh PIN
    const newPin = generatePin();
    const newPinHash = await hashPin(newPin);

    session = await prisma.tableSession.create({
      data: {
        storeId,
        tableId,
        pinHash: newPinHash,
        status: "OPEN",
        expiresAt,
      },
    });

    if (process.env.NODE_ENV !== "production") {
      const maskedPin = newPin.slice(0, 2) + "**";
      console.log(`[TABLE SESSION] PIN for table ${tableId} (session ${session.id}): ${maskedPin}`);
    }

    return { ...session, pin: newPin } as OpenTableSession;
  }
}

/**
 * Validate PIN for an open table session.
 *
 * Returns { ok: true } if PIN is correct.
 * Returns { ok: false, error: string } if:
 *   - Session not found
 *   - Session not OPEN
 *   - Session expired
 *   - PIN incorrect
 *   - Rate limit exceeded (too many wrong attempts)
 *
 * Rate limiting: Max 3 wrong attempts per session, then blocked for 5 minutes
 */
export async function validateTableSessionPin(
  storeId: string,
  sessionId: string,
  pin: string,
  clientIp?: string,
): Promise<{ ok: boolean; error?: string }> {
  // Rate limit: max 5 wrong attempts per session-IP combination per 5 minutes
  // This prevents brute force parallelization across multiple sessions
  const rateLimitKey = clientIp
    ? `pin-validate:${clientIp}:${sessionId}`
    : `pin-validate:${sessionId}`;
  const MAX_ATTEMPTS = 5;
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  if (!dentroDoLimite(rateLimitKey, MAX_ATTEMPTS, WINDOW_MS)) {
    return {
      ok: false,
      error: "Muitas tentativas incorretas. Tente novamente em alguns minutos.",
    };
  }

  // Validate PIN format (4 digits)
  if (!pin.match(/^\d{4}$/)) {
    return {
      ok: false,
      error: "PIN deve ter 4 dígitos.",
    };
  }

  // Find session
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      storeId: true,
      status: true,
      expiresAt: true,
      pinHash: true,
    },
  });

  if (!session) {
    return {
      ok: false,
      error: "Sessão não encontrada.",
    };
  }

  if (session.storeId !== storeId) {
    return {
      ok: false,
      error: "Não autorizado.",
    };
  }

  if (session.status !== "OPEN") {
    return {
      ok: false,
      error: "Sessão não está mais aberta.",
    };
  }

  if (new Date() > session.expiresAt) {
    return {
      ok: false,
      error: "Sessão expirou. Escaneie o QR Code novamente.",
    };
  }

  // Verify PIN
  const pinCorrect = await verifyPin(pin, session.pinHash);

  if (!pinCorrect) {
    return {
      ok: false,
      error: "PIN incorreto. Tente novamente.",
    };
  }

  // PIN is correct!
  return { ok: true };
}

/**
 * Authorize a device to participate in a table session.
 *
 * First device (isFirstDevice=true):
 *   → Called right after session creation
 *   → Enters automatically without PIN
 *   → requiresPin: false
 *
 * Other devices (isFirstDevice=false):
 *   → Called AFTER PIN validation
 *   → PIN must have been verified before calling this
 *   → requiresPin: true
 *
 * Returns the deviceToken for the client to store and use in orders.
 * Token is never exposed in plaintext after this point; only hash is stored.
 *
 * Device limit: max 5 devices per session to prevent spam
 */
export async function authorizeDeviceForSession(
  storeId: string,
  sessionId: string,
  isFirstDevice: boolean,
): Promise<{ id: string; deviceToken: string }> {
  const MAX_DEVICES_PER_SESSION = 5;

  // Check device count (only for non-first devices)
  if (!isFirstDevice) {
    const activeDeviceCount = await prisma.sessionDevice.count({
      where: {
        sessionId,
        revokedAt: null,
      },
    });

    if (activeDeviceCount >= MAX_DEVICES_PER_SESSION) {
      throw new Error(
        `Máximo de dispositivos (${MAX_DEVICES_PER_SESSION}) alcançado para esta mesa. Remova um dispositivo para continuar.`
      );
    }
  }
  // Validate session exists and belongs to store
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    select: { id: true, storeId: true, status: true, expiresAt: true },
  });

  if (!session) {
    throw new Error("Sessão não encontrada");
  }

  if (session.storeId !== storeId) {
    throw new Error("Não autorizado");
  }

  if (session.status !== "OPEN") {
    throw new Error("Sessão não está mais aberta");
  }

  if (new Date() > session.expiresAt) {
    throw new Error("Sessão expirou");
  }

  // Generate device token
  const deviceToken = generateDeviceToken();
  const deviceTokenHash = await hashDeviceToken(deviceToken);

  // Create SessionDevice record
  const device = await prisma.sessionDevice.create({
    data: {
      sessionId,
      deviceTokenHash,
      requiresPin: !isFirstDevice, // First device: false, others: true
      authorizedAt: new Date(),
    },
    select: { id: true },
  });

  // Return device ID and token (token is returned only here, never again)
  return {
    id: device.id,
    deviceToken, // Client stores this in localStorage
  };
}

/**
 * Revoke a device token (log out, end session, etc)
 */
export async function revokeDeviceToken(storeId: string, deviceId: string): Promise<void> {
  const device = await prisma.sessionDevice.findUnique({
    where: { id: deviceId },
    include: { session: { select: { storeId: true } } },
  });

  if (!device) {
    throw new Error("Dispositivo não encontrado");
  }

  if (device.session.storeId !== storeId) {
    throw new Error("Não autorizado");
  }

  // Soft delete: mark as revoked
  await prisma.sessionDevice.update({
    where: { id: deviceId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Validate a device token and get the device/session info.
 * Used when a client makes a request with a deviceToken.
 *
 * Returns null if token is invalid or revoked.
 */
export async function validateDeviceToken(
  storeId: string,
  deviceToken: string,
): Promise<{ deviceId: string; sessionId: string } | null> {
  // Find device by looking for matching token hash
  // This is expensive (O(n)) but SessionDevice records are few per session
  const devices = await prisma.sessionDevice.findMany({
    where: {
      session: { storeId },
      revokedAt: null, // Only active devices
    },
    include: {
      session: {
        select: { id: true, status: true, expiresAt: true },
      },
    },
  });

  // Check each device's token hash
  for (const device of devices) {
    // In production, consider caching token hashes or using indexed search
    // For now, verify against each hash (safe but slower)
    try {
      const { verifyDeviceToken } = await import("../auth/device-token");
      const isValid = await verifyDeviceToken(deviceToken, device.deviceTokenHash);

      if (isValid) {
        // Also check session is still valid
        if (device.session.status !== "OPEN" || new Date() > device.session.expiresAt) {
          return null; // Session invalid
        }

        // Update lastSeenAt
        await prisma.sessionDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() },
        });

        return {
          deviceId: device.id,
          sessionId: device.session.id,
        };
      }
    } catch {
      // Token doesn't match, continue to next device
      continue;
    }
  }

  return null; // No matching device found
}
