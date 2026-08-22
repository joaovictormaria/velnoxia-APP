import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { getStoreBySlug } from "../repositories/store-repository";

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
      return { ok: false as const, error: "Loja não encontrada" };
    }

    // Limpar sessions expiradas da loja
    await prisma.tableSession.deleteMany({
      where: {
        storeId: store.id,
        expiresAt: { lt: new Date() },
      },
    });

    // Criar nova sessão (24 horas de validade)
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
      return { ok: false as const, error: "Erro ao criar sessão da mesa" };
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
