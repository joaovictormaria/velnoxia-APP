import { prisma } from "../db/client";

export type ExtraInput = {
  name: string;
  price: number;
  isActive: boolean;
};

export function listExtras() {
  return prisma.extra.findMany({ orderBy: { name: "asc" } });
}

export function listActiveExtras() {
  return prisma.extra.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export function createExtra(data: ExtraInput) {
  return prisma.extra.create({ data });
}

export function updateExtra(id: string, data: Partial<ExtraInput>) {
  return prisma.extra.update({ where: { id }, data });
}

export function deleteExtra(id: string) {
  return prisma.extra.delete({ where: { id } });
}
