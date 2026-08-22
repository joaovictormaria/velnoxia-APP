import { createServerFn } from "@tanstack/react-start/server";
import { prisma } from "@/server/db";

/**
 * Obter informações públicas de uma mesa (sem autenticação)
 */
export const getTableInfoFn = createServerFn({ method: "GET" }).handler(
  async () => {
    // TODO: Implementar quando autenticação funcionar
    return null;
  }
);

/**
 * Listar pedidos de uma mesa (público)
 */
export const getTableOrdersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    // TODO: Implementar
    return [];
  }
);

/**
 * Obter status consolidado da mesa
 */
export const getTableStatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    // TODO: Implementar
    return null;
  }
);
