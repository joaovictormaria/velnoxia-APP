import bcrypt from "bcryptjs";

/*
 * 12 é o padrão atual do bcrypt: cada tentativa de senha custa ~4x mais que
 * com 10, o que quase não se sente num login legítimo e pesa muito para força
 * bruta. Hashes antigos (custo 10) continuam válidos — o verify lê o custo do
 * próprio hash —, então a conta só migra para 12 quando a senha for trocada.
 */
const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
