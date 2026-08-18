import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";

export const listNotificationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.notification.count({ where: { storeId, isRead: false } }),
  ]);
  return { items, unreadCount };
});

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await prisma.notification.updateMany({ where: { id: data.id, storeId }, data: { isRead: true } });
    return { ok: true as const };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  await prisma.notification.updateMany({ where: { storeId, isRead: false }, data: { isRead: true } });
  return { ok: true as const };
});
