import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./password";

/**
 * Gerar token único de dispositivo (UUID v4 aleatório, não previsível)
 */
export function generateDeviceToken(): string {
  // 32 bytes de entropia → 256 bits de segurança
  // Base64url encoding (sem padding)
  return randomBytes(32).toString("base64url");
}

/**
 * Hash do device token usando bcrypt (mesmo que password)
 */
export async function hashDeviceToken(token: string): Promise<string> {
  return hashPassword(token);
}

/**
 * Validar device token contra hash
 */
export async function verifyDeviceToken(token: string, hash: string): Promise<boolean> {
  return verifyPassword(token, hash);
}
