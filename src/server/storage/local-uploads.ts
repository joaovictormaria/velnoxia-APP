import { join } from "node:path";

/**
 * Disk fallback used when the R2 variables are absent, so images work in
 * development without cloud credentials. Files land under public/, which the
 * server already serves as static assets — no extra route to read them.
 *
 * Not meant for production: a persistent process on Railway would keep these
 * files only until the next deploy replaces the container. R2 remains the
 * production path, and presign prefers it whenever it is configured.
 */
export const LOCAL_UPLOAD_ROOT = join(process.cwd(), "public", "uploads");

/** Public path for a stored key, matching where the static server looks. */
export function localPublicUrl(key: string) {
  return `/uploads/${key}`;
}

/**
 * The key becomes a path on disk, so it is validated against an exact shape
 * instead of being sanitised. Anything with "..", a leading slash, a drive
 * letter or an unexpected extension simply fails to match.
 */
const KEY_PATTERN =
  /^stores\/([A-Za-z0-9_-]{1,64})\/(products|categories|logos|restaurant)\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/;

export function isSafeUploadKey(key: string) {
  return KEY_PATTERN.test(key);
}

/** A loja dona da chave, para o endpoint conferir contra a sessão de quem envia. */
export function storeIdFromUploadKey(key: string): string | null {
  return KEY_PATTERN.exec(key)?.[1] ?? null;
}
