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
 * Listar mesas de uma loja com filtros opcionais
 */
export const listTablesFn = createServerFn({ method: "GET" })
  .middleware(requireAdminSession)
  .handler(async ({ context }) => {
    const { store } = context;

    const tables = await tableRepository.listTablesByStore(store.id);
    return tables;
  });

/**
 * Criar nova mesa
 */
export const createTableFn = createServerFn({ method: "POST" })
  .middleware(requireAdminSession)
  .handler(async ({ data, context }) => {
    const { store } = context;

    const validated = CreateTableSchema.parse(data);

    // Verifica se o número já existe
    const existing = await tableRepository.getTableByNumber(store.id, validated.number);
    if (existing) {
      throw new Error(`Mesa número ${validated.number} já existe`);
    }

    // Gera QRCode
    const { qrcodeUrl, qrcodeData } = await tableService.generateTableQrCode(
      `temp-${Date.now()}`,
      store.slug
    );

    // Cria a mesa (depois o ID real é usado para regenerar QRCode)
    const table = await tableRepository.createTable(store.id, {
      ...validated,
      qrcodeUrl,
      qrcodeData,
    });

    // Regenera QRCode com o ID real
    const { qrcodeUrl: finalUrl, qrcodeData: finalData } =
      await tableService.generateTableQrCode(table.id, store.slug);

    // Atualiza com QRCode final
    const finalTable = await tableRepository.updateTable(store.id, table.id, {
      qrcodeUrl: finalUrl,
      qrcodeData: finalData,
    });

    return finalTable;
  });

/**
 * Atualizar uma mesa
 */
export const updateTableFn = createServerFn({ method: "PUT" })
  .middleware(requireAdminSession)
  .handler(async ({ data, context }) => {
    const { store } = context;

    const { tableId, ...updateData } = data as { tableId: string } & typeof UpdateTableSchema._type;

    const validated = UpdateTableSchema.parse(updateData);

    // Verifica se a mesa existe
    const table = await tableRepository.getTableById(store.id, tableId);
    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    // Se mudar o número, verifica se o novo número já existe
    if (validated.number !== undefined && validated.number !== table.number) {
      const existing = await tableRepository.getTableByNumber(store.id, validated.number);
      if (existing) {
        throw new Error(`Mesa número ${validated.number} já existe`);
      }
    }

    return tableRepository.updateTable(store.id, tableId, validated);
  });

/**
 * Deletar uma mesa
 */
export const deleteTableFn = createServerFn({ method: "DELETE" })
  .middleware(requireAdminSession)
  .handler(async ({ data, context }) => {
    const { store } = context;
    const { tableId } = data as { tableId: string };

    const table = await tableRepository.getTableById(store.id, tableId);
    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    await tableRepository.deleteTable(store.id, tableId);
    return { success: true };
  });

/**
 * Regenerar QRCode de uma mesa
 */
export const generateQrcodeFn = createServerFn({ method: "POST" })
  .middleware(requireAdminSession)
  .handler(async ({ data, context }) => {
    const { store } = context;
    const { tableId } = data as { tableId: string };

    const table = await tableRepository.getTableById(store.id, tableId);
    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    const { qrcodeUrl, qrcodeData } = await tableService.generateTableQrCode(tableId, store.slug);

    return tableRepository.updateTable(store.id, tableId, {
      qrcodeUrl,
      qrcodeData,
    });
  });

/**
 * Obter uma mesa com seus pedidos recentes
 */
export const getTableWithOrdersFn = createServerFn({ method: "GET" })
  .middleware(requireAdminSession)
  .handler(async ({ data, context }) => {
    const { store } = context;
    const { tableId } = data as { tableId: string };

    return tableRepository.getTableWithOrders(store.id, tableId);
  });
