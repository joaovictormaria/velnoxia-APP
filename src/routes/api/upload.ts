import { createFileRoute } from "@tanstack/react-router";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { requireAdminSession } from "@/server/auth/session";
import {
  LOCAL_UPLOAD_ROOT,
  isSafeUploadKey,
  storeIdFromUploadKey,
} from "@/server/storage/local-uploads";

/**
 * Receives the file when R2 is not configured, so image upload works in
 * development without any cloud credentials. In production R2 is used and this
 * endpoint is never called — presign returns an R2 URL instead.
 */
export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        // Same gate as the presign call: only a signed-in admin may write.
        const admin = await requireAdminSession();

        const key = new URL(request.url).searchParams.get("key") ?? "";
        // The key decides a path on disk, so it is matched against a strict
        // shape rather than merely cleaned — "../" and absolute paths never
        // reach the filesystem.
        if (!isSafeUploadKey(key)) {
          return Response.json({ error: "Chave de upload inválida." }, { status: 400 });
        }

        // A chave carrega a loja, e ela tem de ser a de quem está enviando: um
        // dono logado não grava na pasta de outra lanchonete nem por engano.
        if (storeIdFromUploadKey(key) !== admin.storeId) {
          return Response.json({ error: "Esta chave não é da sua loja." }, { status: 403 });
        }

        const body = await request.arrayBuffer();
        if (body.byteLength === 0) {
          return Response.json({ error: "Arquivo vazio." }, { status: 400 });
        }
        if (body.byteLength > 2 * 1024 * 1024) {
          return Response.json({ error: "A imagem passa de 2MB." }, { status: 413 });
        }

        const target = join(LOCAL_UPLOAD_ROOT, key);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(body));

        return Response.json({ ok: true });
      },
    },
  },
});
