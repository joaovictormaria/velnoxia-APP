import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAdmin } from "../auth/session";
import { getStoreBySlug } from "../repositories/store-repository";
import {
  listOpenTableSessions,
  getTableSessionDetails,
  closeTableSession,
} from "../services/table-session-dashboard-service";

/**
 * List all open table sessions for the current store.
 * Admin-only endpoint.
 */
const listOpenSessionsSchema = z.object({
  storeSlug: z.string().min(1),
});

export const listOpenTableSessionsFn = createServerFn({ method: "GET" })
  .validator(listOpenSessionsSchema)
  .handler(async ({ data }) => {
    try {
      const admin = await getCurrentAdmin();
      if (!admin) {
        return { ok: false as const, error: "Não autorizado" };
      }

      const store = await getStoreBySlug(data.storeSlug);
      if (!store || store.id !== admin.storeId) {
        return { ok: false as const, error: "Loja não encontrada" };
      }

      const sessions = await listOpenTableSessions(store.id);

      return {
        ok: true as const,
        sessions,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Get full details of a table session.
 * Admin-only endpoint.
 */
const getSessionDetailsSchema = z.object({
  storeSlug: z.string().min(1),
  sessionId: z.string().cuid(),
});

export const getTableSessionDetailsFn = createServerFn({ method: "GET" })
  .validator(getSessionDetailsSchema)
  .handler(async ({ data }) => {
    try {
      const admin = await getCurrentAdmin();
      if (!admin) {
        return { ok: false as const, error: "Não autorizado" };
      }

      const store = await getStoreBySlug(data.storeSlug);
      if (!store || store.id !== admin.storeId) {
        return { ok: false as const, error: "Loja não encontrada" };
      }

      const details = await getTableSessionDetails(store.id, data.sessionId);

      return {
        ok: true as const,
        session: details,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Close a table session after payment.
 * Admin-only endpoint.
 */
const closeSessionSchema = z.object({
  storeSlug: z.string().min(1),
  sessionId: z.string().cuid(),
  status: z.enum(["PAID", "CLOSED", "CANCELLED"]),
});

export const closeTableSessionFn = createServerFn({ method: "POST" })
  .validator(closeSessionSchema)
  .handler(async ({ data }) => {
    try {
      const admin = await getCurrentAdmin();
      if (!admin) {
        return { ok: false as const, error: "Não autorizado" };
      }

      const store = await getStoreBySlug(data.storeSlug);
      if (!store || store.id !== admin.storeId) {
        return { ok: false as const, error: "Loja não encontrada" };
      }

      await closeTableSession(store.id, data.sessionId, data.status);

      return {
        ok: true as const,
        message: `Sessão encerrada com status: ${data.status}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });
