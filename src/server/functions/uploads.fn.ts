import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { createUploadUrl } from "../storage/presign";

export const createUploadUrlFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: z.enum(["product", "category", "logo", "restaurant"]),
      contentType: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    // A loja sai da sessão, nunca do que o navegador manda: assim ninguém
    // consegue pedir uma URL que grave na pasta de outra lanchonete.
    const { storeId } = await requireAdminSession();
    return createUploadUrl(storeId, data.kind, data.contentType);
  });
