import { prisma } from "@/server/db/client";
import type { OrderStatus, PaymentStatus } from "@prisma/client";

/**
 * Table session dashboard data for admin view
 */
export interface TableSessionDashboard {
  sessionId: string;
  tableId: string;
  tableNumber: number;
  status: "OPEN" | "PAID" | "CLOSED" | "CANCELLED";

  // Timing
  openedAt: Date;
  paidAt: Date | null;
  closedAt: Date | null;
  expiresAt: Date;

  // Devices
  deviceCount: number;
  devices: Array<{
    id: string;
    requiresPin: boolean;
    authorizedAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
  }>;

  // Orders
  orders: Array<{
    id: string;
    number: number;
    status: OrderStatus;
    total: number;
    paymentMethod: string;
    paymentStatus: PaymentStatus;
    customerName: string;
    itemCount: number;
  }>;

  // Totals
  orderCount: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
}

/**
 * List all open table sessions for a store.
 * Used by dashboard to show which tables are currently occupied.
 */
export async function listOpenTableSessions(
  storeId: string,
): Promise<
  Array<{
    sessionId: string;
    tableNumber: number;
    deviceCount: number;
    orderCount: number;
    totalAmount: number;
    openedAt: Date;
  }>
> {
  const sessions = await prisma.tableSession.findMany({
    where: {
      storeId,
      status: "OPEN",
    },
    include: {
      table: { select: { number: true } },
      devices: {
        where: { revokedAt: null },
        select: { id: true },
      },
      orders: {
        select: { id: true, total: true },
      },
    },
    orderBy: { openedAt: "asc" },
  });

  return sessions.map((s) => ({
    sessionId: s.id,
    tableNumber: s.table.number,
    deviceCount: s.devices.length,
    orderCount: s.orders.length,
    totalAmount: s.orders.reduce((sum, o) => sum + Number(o.total), 0),
    openedAt: s.openedAt,
  }));
}

/**
 * Get full details of a table session for admin view.
 * Includes devices and orders but never exposes PIN or tokens.
 */
export async function getTableSessionDetails(
  storeId: string,
  sessionId: string,
): Promise<TableSessionDashboard> {
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: {
      table: { select: { id: true, number: true } },
      devices: {
        select: {
          id: true,
          requiresPin: true,
          authorizedAt: true,
          lastSeenAt: true,
          revokedAt: true,
        },
      },
      orders: {
        include: {
          items: { select: { id: true } },
        },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          paymentMethod: true,
          paymentStatus: true,
          customerName: true,
          items: { select: { id: true } },
        },
      },
    },
  });

  if (!session) {
    throw new Error("SessÃ£o nÃ£o encontrada");
  }

  if (session.storeId !== storeId) {
    throw new Error("NÃ£o autorizado");
  }

  const totalAmount = session.orders.reduce((sum, o) => sum + Number(o.total), 0);
  const paymentStatus =
    session.status === "PAID"
      ? ("PAID" as const)
      : session.orders.every((o) => o.paymentStatus === "PAID")
        ? ("PAID" as const)
        : ("PENDING" as const);

  return {
    sessionId: session.id,
    tableId: session.table.id,
    tableNumber: session.table.number,
    status: session.status as "OPEN" | "PAID" | "CLOSED" | "CANCELLED",

    openedAt: session.openedAt,
    paidAt: session.paidAt,
    closedAt: session.closedAt,
    expiresAt: session.expiresAt,

    deviceCount: session.devices.length,
    devices: session.devices,

    orders: session.orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      total: Number(o.total),
      paymentMethod: String(o.paymentMethod),
      paymentStatus: o.paymentStatus,
      customerName: o.customerName,
      itemCount: o.items.length,
    })),

    orderCount: session.orders.length,
    totalAmount,
    paymentStatus,
  };
}

/**
 * Close a table session (mark as PAID/CLOSED/CANCELLED).
 * Automatically revokes all device tokens.
 */
export async function closeTableSession(
  storeId: string,
  sessionId: string,
  newStatus: "PAID" | "CLOSED" | "CANCELLED",
): Promise<void> {
  // Verify session exists and belongs to store
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    select: { storeId: true },
  });

  if (!session) {
    throw new Error("SessÃ£o nÃ£o encontrada");
  }

  if (session.storeId !== storeId) {
    throw new Error("NÃ£o autorizado");
  }

  // Close session in transaction
  await prisma.$transaction(async (tx) => {
    // Update session status
    await tx.tableSession.update({
      where: { id: sessionId },
      data: {
        status: newStatus,
        paidAt: newStatus === "PAID" ? new Date() : undefined,
        closedAt: newStatus === "CLOSED" || newStatus === "CANCELLED" ? new Date() : undefined,
      },
    });

    // Revoke all device tokens for this session
    await tx.sessionDevice.updateMany({
      where: {
        sessionId,
        revokedAt: null, // Only active devices
      },
      data: {
        revokedAt: new Date(),
      },
    });
  });
}

