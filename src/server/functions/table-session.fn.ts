// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { getStoreBySlug } from "../repositories/store-repository";
import {
  getOrCreateOpenTableSession,
  validateTableSessionPin,
  authorizeDeviceForSession,
} from "../services/table-session-service";
import { orchestrateTableSession } from "../services/table-session-orchestrator";

const createTableSessionSchema = z.object({
  storeSlug: z.string().min(1),
  tableId: z.string().uuid(),
  tableNumber: z.number().int().min(1),
});

export const createTableSessionFn = createServerFn({ method: "POST" })
  .validator(createTableSessionSchema)
  .handler(async ({ data }) => {
    const store = await getStoreBySlug(data.storeSlug);
    if (!store) {
      return { ok: false as const, error: "Loja nÃ£o encontrada" };
    }

    // Limpar sessions expiradas da loja
    await prisma.tableSession.deleteMany({
      where: {
        storeId: store.id,
        expiresAt: { lt: new Date() },
      },
    });

    // Criar nova sessÃ£o (24 horas de validade)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    try {
      const session = await prisma.tableSession.create({
        data: {
          storeId: store.id,
          tableId: data.tableId,
          tableNumber: data.tableNumber,
          expiresAt,
        },
      });

      return {
        ok: true as const,
        sessionToken: session.id,
        tableNumber: session.tableNumber,
      };
    } catch (error) {
      return { ok: false as const, error: "Erro ao criar sessÃ£o da mesa" };
    }
  });

/**
 * Validate table session token and get table info.
 * Returns null if token is invalid or expired.
 */
export async function validateTableSession(
  storeId: string,
  sessionToken: string,
): Promise<{ tableId: string; tableNumber: number } | null> {
  const session = await prisma.tableSession.findFirst({
    where: {
      id: sessionToken,
      storeId,
      expiresAt: { gt: new Date() },
    },
    select: { tableId: true, tableNumber: true },
  });

  if (!session) {
    // Clean up expired sessions while we're here
    await prisma.tableSession.deleteMany({
      where: {
        storeId,
        expiresAt: { lte: new Date() },
      },
    });
    return null;
  }

  return session;
}

/**
 * Get or create an open table session.
 *
 * Public server function called from storefront.
 *
 * Behavior:
 * - If session OPEN exists for this table: return it
 * - If no session exists: create new, generate PIN, return it
 *
 * Concurrency safe: unique constraint ensures only 1 OPEN session per table
 */
const getOrCreateSessionSchema = z.object({
  storeSlug: z.string().min(1),
  tableId: z.string().uuid(),
});

export const getOrCreateTableSessionFn = createServerFn({ method: "POST" })
  .validator(getOrCreateSessionSchema)
  .handler(async ({ data }) => {
    try {
      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja nÃ£o encontrada" };
      }

      const session = await getOrCreateOpenTableSession(store.id, data.tableId);

      return {
        ok: true as const,
        sessionId: session.id,
        tableId: session.tableId,
        status: session.status,
        openedAt: session.openedAt,
        expiresAt: session.expiresAt,
        // NEVER expose PIN to frontend in response
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Validate a PIN for a table session.
 *
 * Called when a second (or later) device tries to join a table session.
 * They must provide the correct 4-digit PIN.
 *
 * Rate limited: max 5 wrong attempts per session per 5 minutes.
 */
const validateSessionPinSchema = z.object({
  storeSlug: z.string().min(1),
  sessionId: z.string().cuid(),
  pin: z.string().regex(/^\d{4}$/, "PIN deve ter 4 dÃ­gitos"),
});

export const validateTableSessionPinFn = createServerFn({ method: "POST" })
  .validator(validateSessionPinSchema)
  .handler(async ({ data }) => {
    try {
      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja nÃ£o encontrada" };
      }

      const result = await validateTableSessionPin(store.id, data.sessionId, data.pin);

      // Se PIN validado com sucesso, autorizar o dispositivo
      if (result.ok) {
        const device = await authorizeDeviceForSession(store.id, data.sessionId, false);
        return {
          ok: true as const,
          deviceToken: device.deviceToken,
        };
      }

      return result as { ok: false; error: string };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Authorize the first device for a table session.
 *
 * Called immediately after session creation.
 * First device enters automatically without needing PIN.
 */
const authorizeFirstDeviceSchema = z.object({
  storeSlug: z.string().min(1),
  sessionId: z.string().cuid(),
});

export const authorizeFirstDeviceFn = createServerFn({ method: "POST" })
  .validator(authorizeFirstDeviceSchema)
  .handler(async ({ data }) => {
    try {
      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja nÃ£o encontrada" };
      }

      const result = await authorizeDeviceForSession(store.id, data.sessionId, true);

      return {
        ok: true as const,
        deviceId: result.id,
        deviceToken: result.deviceToken,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Authorize an additional device for a table session.
 *
 * Called AFTER PIN validation (PIN must be correct before this is called).
 * Second and subsequent devices require PIN entry first.
 */
const authorizeDeviceSchema = z.object({
  storeSlug: z.string().min(1),
  sessionId: z.string().cuid(),
});

export const authorizeDeviceForSessionFn = createServerFn({ method: "POST" })
  .validator(authorizeDeviceSchema)
  .handler(async ({ data }) => {
    try {
      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja nÃ£o encontrada" };
      }

      const result = await authorizeDeviceForSession(store.id, data.sessionId, false);

      return {
        ok: true as const,
        deviceId: result.id,
        deviceToken: result.deviceToken,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Orchestrate the complete QR Code table session flow.
 *
 * Called once by frontend after scanning QR code.
 * Coordinates:
 *   1. Create or retrieve open session
 *   2. If first device: authorize immediately, return deviceToken
 *   3. If second+ device: return sessionId only (PIN validation needed)
 *
 * Public endpoint - called from storefront.
 */
const orchestrateTableSessionSchema = z.object({
  storeSlug: z.string().min(1),
  tableId: z.string().uuid(),
});

export const orchestrateTableSessionFn = createServerFn({ method: "POST" })
  .validator(orchestrateTableSessionSchema)
  .handler(async ({ data }) => {
    try {
      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja nÃ£o encontrada" };
      }

      const result = await orchestrateTableSession(store.id, data.tableId);

      return {
        ok: true as const,
        sessionId: result.sessionId,
        firstDevice: result.firstDevice,
        deviceToken: result.deviceToken,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

