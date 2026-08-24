import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/server/db/client";
import {
  listOpenTableSessions,
  getTableSessionDetails,
  closeTableSession,
} from "@/server/services/table-session-dashboard-service";

describe("Table Session Dashboard Service", () => {
  let storeId: string;
  let tableId: string;
  let sessionId: string;

  beforeEach(async () => {
    // Setup: Create test store and table
    const store = await prisma.store.create({
      data: {
        slug: `test-${Date.now()}-${Math.random()}`,
        name: "Test Store",
      },
    });
    storeId = store.id;

    tableId = `test-table-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId,
        storeId,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr",
        qrcodeData: "data:image/png;base64,...",
      },
    });

    // Create an open session
    const session = await prisma.tableSession.create({
      data: {
        storeId,
        tableId,
        status: "OPEN",
        pinHash: "$2b$10$test",
        openedAt: new Date(),
        expiresAt: new Date(Date.now() + 7200000),
      },
    });
    sessionId = session.id;

    // Create a device for the session
    await prisma.sessionDevice.create({
      data: {
        sessionId,
        deviceTokenHash: "$2b$10$test",
        requiresPin: false,
        authorizedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    await prisma.order.deleteMany({ where: { sessionId } });
    await prisma.sessionDevice.deleteMany({ where: { sessionId } });
    await prisma.tableSession.deleteMany({ where: { storeId } });
    await prisma.table.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
  });

  describe("listOpenTableSessions", () => {
    it("should list all open sessions for a store", async () => {
      const sessions = await listOpenTableSessions(storeId);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.sessionId).toBe(sessionId);
      expect(sessions[0]?.tableNumber).toBe(1);
    });

    it("should include device and order counts", async () => {
      const sessions = await listOpenTableSessions(storeId);

      expect(sessions[0]?.deviceCount).toBe(1);
      expect(sessions[0]?.orderCount).toBe(0);
    });

    it("should calculate total amount correctly", async () => {
      await prisma.order.create({
        data: {
          id: "test-order-1",
          sessionId,
          storeId,
          number: 1,
          status: "RECEIVED",
          customerName: "Test",
          customerPhone: "1234567890",
          type: "PICKUP",
          paymentMethod: "CASH",
          paymentStatus: "PENDING",
          subtotal: 100,
          total:100,
        },
      });

      const sessions = await listOpenTableSessions(storeId);

      expect(sessions[0]?.totalAmount).toBe(100);
    });

    it("should only list OPEN sessions", async () => {
      // Close session
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: "CLOSED", closedAt: new Date() },
      });

      const sessions = await listOpenTableSessions(storeId);

      expect(sessions).toHaveLength(0);
    });

    it("should exclude revoked devices from count", async () => {
      // Revoke the device
      await prisma.sessionDevice.update({
        where: { sessionId_deviceTokenHash: { sessionId, deviceTokenHash: "$2b$10$test" } },
        data: { revokedAt: new Date() },
      });

      const sessions = await listOpenTableSessions(storeId);

      expect(sessions[0]?.deviceCount).toBe(0);
    });

    it("should order sessions by openedAt", async () => {
      // Create another session
      const session2 = await prisma.tableSession.create({
        data: {
          storeId,
          tableId: `test-table-2-${Date.now()}`,
          status: "OPEN",
          pinHash: "$2b$10$test",
          openedAt: new Date(Date.now() - 60000), // Earlier
          expiresAt: new Date(Date.now() + 7200000),
        },
      });

      await prisma.table.create({
        data: {
          id: session2.tableId,
          storeId,
          number: 2,
          capacity: 4,
          qrcodeUrl: "https://example.com/qr2",
          qrcodeData: "data:image/png;base64,...",
        },
      });

      const sessions = await listOpenTableSessions(storeId);

      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.sessionId).toBe(session2.id); // Earlier one first
    });
  });

  describe("getTableSessionDetails", () => {
    it("should return complete session details", async () => {
      const details = await getTableSessionDetails(storeId, sessionId);

      expect(details.sessionId).toBe(sessionId);
      expect(details.tableNumber).toBe(1);
      expect(details.status).toBe("OPEN");
    });

    it("should include device information", async () => {
      const details = await getTableSessionDetails(storeId, sessionId);

      expect(details.deviceCount).toBe(1);
      expect(details.devices).toHaveLength(1);
      expect(details.devices[0]?.requiresPin).toBe(false);
    });

    it("should include order information", async () => {
      const order = await prisma.order.create({
        data: {
          id: "test-order-1",
          sessionId,
          storeId,
          number: 1,
          status: "RECEIVED",
          customerName: "Test",
          customerPhone: "1234567890",
          type: "PICKUP",
          paymentMethod: "CASH",
          paymentStatus: "PENDING",
          subtotal: 50,
          total: 50,
        },
      });

      const details = await getTableSessionDetails(storeId, sessionId);

      expect(details.orderCount).toBe(1);
      expect(details.totalAmount).toBe(50);
      expect(details.orders[0]?.id).toBe(order.id);
    });

    it("should throw error for non-existent session", async () => {
      await expect(
        getTableSessionDetails(storeId, "non-existent-id"),
      ).rejects.toThrow("SessÃ£o nÃ£o encontrada");
    });

    it("should throw error for unauthorized store", async () => {
      const otherStore = await prisma.store.create({
        data: {
          slug: `other-${Date.now()}-${Math.random()}`,
          name: "Other Store",
        },
      });

      await expect(
        getTableSessionDetails(otherStore.id, sessionId),
      ).rejects.toThrow("NÃ£o autorizado");

      await prisma.store.delete({ where: { id: otherStore.id } });
    });

    it("should calculate payment status correctly", async () => {
      const details = await getTableSessionDetails(storeId, sessionId);

      expect(details.paymentStatus).toBe("PENDING");
    });

    it("should show PAID status when session is marked PAID", async () => {
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: "PAID", paidAt: new Date() },
      });

      const details = await getTableSessionDetails(storeId, sessionId);

      expect(details.paymentStatus).toBe("PAID");
    });
  });

  describe("closeTableSession", () => {
    it("should close session with PAID status", async () => {
      await closeTableSession(storeId, sessionId, "PAID");

      const session = await prisma.tableSession.findUnique({
        where: { id: sessionId },
      });

      expect(session?.status).toBe("PAID");
      expect(session?.paidAt).toBeDefined();
    });

    it("should close session with CLOSED status", async () => {
      await closeTableSession(storeId, sessionId, "CLOSED");

      const session = await prisma.tableSession.findUnique({
        where: { id: sessionId },
      });

      expect(session?.status).toBe("CLOSED");
      expect(session?.closedAt).toBeDefined();
    });

    it("should close session with CANCELLED status", async () => {
      await closeTableSession(storeId, sessionId, "CANCELLED");

      const session = await prisma.tableSession.findUnique({
        where: { id: sessionId },
      });

      expect(session?.status).toBe("CANCELLED");
      expect(session?.closedAt).toBeDefined();
    });

    it("should revoke all active device tokens", async () => {
      // Create another active device
      await prisma.sessionDevice.create({
        data: {
          sessionId,
          deviceTokenHash: "$2b$10$test2",
          requiresPin: true,
          authorizedAt: new Date(),
          lastSeenAt: new Date(),
        },
      });

      await closeTableSession(storeId, sessionId, "CLOSED");

      const devices = await prisma.sessionDevice.findMany({
        where: { sessionId },
      });

      expect(devices).toHaveLength(2);
      devices.forEach((d) => {
        expect(d.revokedAt).toBeDefined();
      });
    });

    it("should not revoke already revoked devices", async () => {
      const revokedAt = new Date(Date.now() - 60000);
      await prisma.sessionDevice.updateMany({
        where: { sessionId },
        data: { revokedAt: revokedAt },
      });

      await closeTableSession(storeId, sessionId, "CLOSED");

      const device = await prisma.sessionDevice.findFirst({
        where: { sessionId },
      });

      expect(device?.revokedAt?.getTime()).toBe(revokedAt.getTime());
    });

    it("should throw error for non-existent session", async () => {
      await expect(
        closeTableSession(storeId, "non-existent-id", "CLOSED"),
      ).rejects.toThrow("SessÃ£o nÃ£o encontrada");
    });

    it("should throw error for unauthorized store", async () => {
      const otherStore = await prisma.store.create({
        data: {
          slug: `other-${Date.now()}-${Math.random()}`,
          name: "Other Store",
        },
      });

      await expect(
        closeTableSession(otherStore.id, sessionId, "CLOSED"),
      ).rejects.toThrow("NÃ£o autorizado");

      await prisma.store.delete({ where: { id: otherStore.id } });
    });

    it("should be atomic: update session and revoke devices together", async () => {
      await closeTableSession(storeId, sessionId, "PAID");

      const session = await prisma.tableSession.findUnique({
        where: { id: sessionId },
      });
      const devices = await prisma.sessionDevice.findMany({
        where: { sessionId },
      });

      expect(session?.status).toBe("PAID");
      expect(session?.paidAt).toBeDefined();
      expect(devices.every((d) => d.revokedAt)).toBe(true);
    });
  });
});

