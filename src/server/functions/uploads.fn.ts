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
    await requireAdminSession();
    return createUploadUrl(data.kind, data.contentType);
  });
