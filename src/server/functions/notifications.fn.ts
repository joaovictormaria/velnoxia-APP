import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";

export const listNotificationsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminSession();
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.notification.count({ where: { isRead: false } }),
  ]);
  return { items, unreadCount };
});

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireAdminSession();
    await prisma.notification.update({ where: { id: data.id }, data: { isRead: true } });
    return { ok: true as const };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdminSession();
  await prisma.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
  return { ok: true as const };
});
