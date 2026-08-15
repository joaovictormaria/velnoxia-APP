import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, getR2Config } from "./r2-client";

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

export async function createUploadUrl(
  kind: UploadKind,
  contentType: string,
): Promise<PresignResult> {
  if (!ALLOWED_TYPES.has(contentType)) {
    return { ok: false, error: "Formato não suportado. Use JPG, PNG, WEBP ou AVIF." };
  }

  const config = getR2Config();
  if (!config) {
    return {
      ok: false,
      error:
        "Armazenamento de imagens não configurado. Defina as variáveis R2_* no ambiente.",
    };
  }

  const key = `${FOLDER_BY_KIND[kind]}/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;
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
