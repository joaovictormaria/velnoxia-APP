import { createServerFn } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth";
import { tableRepository } from "@/server/repositories/table-repository";
import { tableService } from "@/server/services/table-service";
import type { TableStatus } from "@prisma/client";

const CreateTableSchema = z.object({
  number: z.number().int().positive("Número da mesa deve ser maior que 0"),
  capacity: z.number().int().min(1, "Capacidade mínima é 1 pessoa"),
});

const UpdateTableSchema = z.object({
  number: z.number().int().positive().optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"]).optional(),
});

/**
 * Listar mesas de uma loja
 */
export const listTablesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    // TODO: Adicionar autenticação quando TanStack Start suportar properly
    const tables: any[] = [];
    return tables;
  }
);

/**
 * Criar nova mesa
 */
export const createTableFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: unknown }) => {
    const validated = CreateTableSchema.parse(data);
    // TODO: Implementar quando autenticação funcionar
    return validated;
  }
);

/**
 * Atualizar uma mesa
 */
export const updateTableFn = createServerFn({ method: "PUT" }).handler(
  async ({ data }: { data: unknown }) => {
    const validated = UpdateTableSchema.parse(data);
    return validated;
  }
);

/**
 * Deletar uma mesa
 */
export const deleteTableFn = createServerFn({ method: "DELETE" }).handler(
  async ({ data }: { data: unknown }) => {
    return { success: true };
  }
);

/**
 * Regenerar QRCode de uma mesa
 */
export const generateQrcodeFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: unknown }) => {
    return { success: true };
  }
);

/**
 * Obter uma mesa com seus pedidos recentes
 */
export const getTableWithOrdersFn = createServerFn({ method: "GET" }).handler(
  async ({ data }: { data: unknown }) => {
    return {};
  }
);
