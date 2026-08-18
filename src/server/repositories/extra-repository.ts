import { prisma } from "../db/client";

export type ExtraInput = {
  name: string;
  price: number;
  isActive: boolean;
};

export function listExtras(storeId: string) {
  return prisma.extra.findMany({ where: { storeId }, orderBy: { name: "asc" } });
}

export function listActiveExtras(storeId: string) {
  return prisma.extra.findMany({
    where: { storeId, isActive: true },
    orderBy: { name: "asc" },
  });
}

export function createExtra(storeId: string, data: ExtraInput) {
  return prisma.extra.create({ data: { ...data, storeId } });
}

/** storeId is part of the filter so an id from another store matches nothing. */
export function updateExtra(storeId: string, id: string, data: Partial<ExtraInput>) {
  return prisma.extra.update({ where: { id, storeId }, data });
}

export function deleteExtra(storeId: string, id: string) {
  return prisma.extra.delete({ where: { id, storeId } });
}
