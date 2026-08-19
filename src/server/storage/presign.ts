import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, getR2Config } from "./r2-client";
import { localPublicUrl } from "./local-uploads";

export type UploadKind = "product" | "category" | "logo" | "restaurant";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const FOLDER_BY_KIND: Record<UploadKind, string> = {
  product: "products",
  category: "categories",
  logo: "logos",
  restaurant: "restaurant",
};

export type PresignResult =
  | { ok: true; uploadUrl: string; publicUrl: string }
  | { ok: false; error: string };

/**
 * Gera a chave e a URL de envio.
 *
 * A loja entra no caminho — `stores/<storeId>/products/<uuid>.jpg` — e não
 * porque o UUID fosse inseguro: ele já basta para ninguém adivinhar nem
 * sobrescrever a imagem de outro. O prefixo existe para o que o UUID sozinho
 * não responde: quanto cada lanchonete ocupa, e quais arquivos apagar quando
 * ela sai. Sem ele, as fotos de um cliente cancelado viram lixo permanente
 * que ninguém consegue nem localizar.
 */
export async function createUploadUrl(
  storeId: string,
  kind: UploadKind,
  contentType: string,
): Promise<PresignResult> {
  if (!ALLOWED_TYPES.has(contentType)) {
    return { ok: false, error: "Formato não suportado. Use JPG, PNG, WEBP ou AVIF." };
  }

  const key = `stores/${storeId}/${FOLDER_BY_KIND[kind]}/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;

  const config = getR2Config();
  if (!config) {
    // No cloud credentials: store on disk instead of refusing the upload, so
    // an owner can put their own photos on the menu from day one. The client
    // uploads the same way — it just PUTs to our own endpoint.
    return {
      ok: true,
      uploadUrl: `/api/upload?key=${encodeURIComponent(key)}`,
      publicUrl: localPublicUrl(key),
    };
  }

  const client = createR2Client(config);

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );

  return {
    ok: true,
    uploadUrl,
    publicUrl: `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`,
  };
}
