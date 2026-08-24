import { hashPassword, verifyPassword } from "./password";

/**
 * Gerar PIN de 4 dígitos (0000-9999)
 */
export function generatePin(): string {
  const num = Math.floor(Math.random() * 10000);
  return String(num).padStart(4, "0");
}

/**
 * Hash do PIN usando bcrypt (mesmo que password)
 */
export async function hashPin(pin: string): Promise<string> {
  return hashPassword(pin);
}

/**
 * Validar PIN contra hash
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return verifyPassword(pin, hash);
}
