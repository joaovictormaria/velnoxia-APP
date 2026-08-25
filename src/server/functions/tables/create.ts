import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

const createTableSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string(),
  number: z.number().int().min(1),
  capacity: z.number().int().min(1),
  qrcodeUrl: z.string().url(),
  qrcodeData: z.string(),
});

export const createTableFn = createServerFn({ method: "POST" })
  .validator(createTableSchema)
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    // Validate that the storeId matches the admin's store
    if (admin.storeId !== data.storeId) {
      return { ok: false as const, error: "Não autorizado" };
    }

    try {
      const table = await prisma.table.create({
        data: {
          id: data.id,
          storeId: data.storeId,
          number: data.number,
          capacity: data.capacity,
          status: "AVAILABLE",
          qrcodeUrl: data.qrcodeUrl,
          qrcodeData: data.qrcodeData,
        },
      });

      return { ok: true as const, table };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Erro ao criar mesa:", errorMsg, error);
      return { ok: false as const, error: `Falha ao criar mesa: ${errorMsg}` };
    }
  });
