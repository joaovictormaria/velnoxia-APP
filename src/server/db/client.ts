import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Hosts que contam como "a minha máquina".
 *
 * Lista de permissão, e não de proibição: um endereço de produção novo, que
 * ninguém lembrou de proibir, continua barrado por padrão. É a mesma escolha
 * feita no vitest.setup.ts, pelo mesmo motivo.
 */
const HOSTS_LOCAIS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];

/**
 * Impede que um processo de desenvolvimento fale com o banco de produção.
 *
 * Isto existe porque aconteceu: o `.env` do projeto apontava para o Railway, e
 * `npm run dev` subia um servidor que gravava direto na base real. Quem abrisse
 * o formulário de cadastro em localhost:5173 e clicasse em criar conta criava
 * uma loja de verdade, para um cliente de verdade — sem nenhum aviso de que
 * aquilo não era um teste.
 *
 * Fora de produção o banco tem que ser local. `NODE_ENV=production` é o que o
 * Railway define, e lá o host remoto é o certo — por isso a checagem sai do
 * caminho ali, e só ali.
 */
function conferirDestino(connectionString: string) {
  if (process.env.NODE_ENV === "production") return;

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error("DATABASE_URL não é uma URL válida.");
  }
  if (HOSTS_LOCAIS.includes(host)) return;

  throw new Error(
    `RECUSADO: fora de produção o banco precisa ser local.\n` +
      `  host encontrado: ${host}\n` +
      `  hosts aceitos:   ${HOSTS_LOCAIS.join(", ")}\n\n` +
      `Sua DATABASE_URL está apontando para um banco remoto — provavelmente o\n` +
      `de produção. Corrija com:\n` +
      `  cp .env.development.example .env.development\n` +
      `e suba o banco local com:  npm run db:local:up`,
  );
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  conferirDestino(connectionString);
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
