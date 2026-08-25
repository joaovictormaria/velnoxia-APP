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
        try {
          const key = new URL(request.url).searchParams.get("key") ?? "";
          console.log(`[Upload API] Iniciando upload: key=${key}`);

          // Same gate as the presign call: only a signed-in admin may write.
          let admin;
          try {
            admin = await requireAdminSession();
            console.log(`[Upload API] Admin autenticado: ${admin.storeId}`);
          } catch (authError) {
            console.error(`[Upload API] Erro de autenticação:`, authError);
            return Response.json(
              { error: "Não autenticado. Faça login novamente." },
              { status: 401 }
            );
          }

          // The key decides a path on disk, so it is matched against a strict
          // shape rather than merely cleaned — "../" and absolute paths never
          // reach the filesystem.
          if (!isSafeUploadKey(key)) {
            console.error(`[Upload API] Chave inválida: ${key}`);
            return Response.json({ error: "Chave de upload inválida." }, { status: 400 });
          }

          // A chave carrega a loja, e ela tem de ser a de quem está enviando: um
          // dono logado não grava na pasta de outra lanchonete nem por engano.
          if (storeIdFromUploadKey(key) !== admin.storeId) {
            console.error(
              `[Upload API] Chave não pertence à loja: esperado ${admin.storeId}, chave tem ${storeIdFromUploadKey(key)}`
            );
            return Response.json(
              { error: "Esta chave não é da sua loja." },
              { status: 403 }
            );
          }

          const body = await request.arrayBuffer();
          console.log(`[Upload API] Arquivo recebido: ${body.byteLength} bytes`);

          if (body.byteLength === 0) {
            console.error(`[Upload API] Arquivo vazio`);
            return Response.json({ error: "Arquivo vazio." }, { status: 400 });
          }
          if (body.byteLength > 2 * 1024 * 1024) {
            console.error(`[Upload API] Arquivo muito grande: ${body.byteLength} bytes`);
            return Response.json(
              { error: "A imagem passa de 2MB." },
              { status: 413 }
            );
          }

          const target = join(LOCAL_UPLOAD_ROOT, key);
          console.log(`[Upload API] Salvando em: ${target}`);

          try {
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, Buffer.from(body));
            console.log(`[Upload API] ✅ Upload concluído com sucesso`);
          } catch (writeError) {
            console.error(`[Upload API] Erro ao salvar arquivo:`, writeError);
            return Response.json(
              { error: `Erro ao salvar arquivo: ${writeError instanceof Error ? writeError.message : "desconhecido"}` },
              { status: 500 }
            );
          }

          return Response.json({ ok: true });
        } catch (error) {
          console.error(`[Upload API] Erro inesperado:`, error);
          return Response.json(
            {
              error: `Erro inesperado: ${error instanceof Error ? error.message : "desconhecido"}`,
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
