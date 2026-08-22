import { prisma } from "@/server/db";
import type { TableStatus } from "@prisma/client";

export const tableRepository = {
  async listTablesByStore(
    storeId: string,
    options?: {
      search?: string;
      status?: TableStatus;
    }
  ) {
    return prisma.table.findMany({
      where: {
        storeId,
        ...(options?.search && {
          OR: [
            { number: parseInt(options.search) || undefined },
          ],
        }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: [{ number: "asc" }],
    });
  },

  async getTableById(storeId: string, tableId: string) {
    return prisma.table.findFirst({
      where: { id: tableId, storeId },
    });
  },

  async getTableByNumber(storeId: string, number: number) {
    return prisma.table.findFirst({
      where: { storeId, number },
    });
  },

  async countTablesByStore(storeId: string) {
    return prisma.table.count({
      where: { storeId },
    });
  },

  async createTable(storeId: string, data: {
    number: number;
    capacity: number;
    qrcodeUrl: string;
    qrcodeData: string;
  }) {
    return prisma.table.create({
      data: {
        storeId,
        ...data,
      },
    });
  },

  async updateTable(
    storeId: string,
    tableId: string,
    data: Partial<{
      number: number;
      capacity: number;
      status: TableStatus;
      qrcodeUrl: string;
      qrcodeData: string;
    }>
  ) {
    return prisma.table.update({
      where: { id: tableId },
      data,
    });
  },

  async deleteTable(storeId: string, tableId: string) {
    return prisma.table.delete({
      where: { id: tableId },
    });
  },

  async getTableWithOrders(storeId: string, tableId: string) {
    return prisma.table.findFirst({
      where: { id: tableId, storeId },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            number: true,
            status: true,
            total: true,
            customerName: true,
            createdAt: true,
          },
        },
      },
    });
  },
};
