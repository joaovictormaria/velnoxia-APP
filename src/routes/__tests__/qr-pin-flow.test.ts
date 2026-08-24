import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/server/db/client";
import { orchestrateTableSession } from "@/server/services/table-session-orchestrator";
import { getOrCreateOpenTableSession, validateTableSessionPin, authorizeDeviceForSession } from "@/server/services/table-session-service";
import { generatePin, hashPin } from "@/server/auth/pin";

describe("QR Code PIN Flow - Complete Integration", () => {
  let storeId: string;
  let tableId: string;
  let sessionId: string;
  let pin: string;

  beforeEach(async () => {
    // Create test store
    const store = await prisma.store.create({
      data: {
        slug: `qr-pin-flow-${Date.now()}`,
        name: "Test Store",
      },
    });
    storeId = store.id;

    // Create test table
    tableId = `table-${Date.now()}`;
    await prisma.table.create({
      data: {
        id: tableId,
        storeId,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://example.com/qr",
        qrcodeData: "data",
      },
    });
  });

  afterEach(async () => {
    await prisma.sessionDevice.deleteMany({});
    await prisma.tableSession.deleteMany({});
    await prisma.table.deleteMany({});
    await prisma.storeSettings.deleteMany({});
    await prisma.store.deleteMany({});
  });

  describe("Scenario 1: First Device Access", () => {
    it("should return firstDevice=true with deviceToken for first device", async () => {
      const result = await orchestrateTableSession(storeId, tableId);

      expect(result.firstDevice).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.deviceToken).toBeDefined();
    });

    it("should create exactly one SessionDevice for first device", async () => {
      const result = await orchestrateTableSession(storeId, tableId);
      sessionId = result.sessionId;

      const deviceCount = await prisma.sessionDevice.count({
        where: { sessionId, revokedAt: null },
      });

      expect(deviceCount).toBe(1);
    });

    it("should authorize device without requiring PIN for first device", async () => {
      const result = await orchestrateTableSession(storeId, tableId);

      // Verify device is already authorized
      const devices = await prisma.sessionDevice.findMany({
        where: { sessionId: result.sessionId },
      });

      expect(devices).toHaveLength(1);
      expect(devices[0].requiresPin).toBe(false);
      expect(devices[0].authorizedAt).toBeDefined();
    });
  });

  describe("Scenario 2: Second Device Access (Requires PIN)", () => {
    it("should return firstDevice=false without deviceToken for second device", async () => {
      // First device
      const firstResult = await orchestrateTableSession(storeId, tableId);
      sessionId = firstResult.sessionId;

      // Second device (same table, different browser/device)
      const secondResult = await orchestrateTableSession(storeId, tableId);

      expect(secondResult.firstDevice).toBe(false);
      expect(secondResult.sessionId).toBe(sessionId);
      expect(secondResult.deviceToken).toBeUndefined();
    });

    it("should require PIN validation for second device before getting token", async () => {
      // First device sets up session with PIN
      const firstResult = await orchestrateTableSession(storeId, tableId);
      sessionId = firstResult.sessionId;

      // Second device tries to access
      const secondResult = await orchestrateTableSession(storeId, tableId);
      expect(secondResult.firstDevice).toBe(false);

      // Get actual PIN from session (for testing)
      const session = await prisma.tableSession.findUnique({
        where: { id: sessionId },
        select: { pinHash: true },
      });

      // Test PIN validation
      const testPin = "1234";
      const hashOfTestPin = await hashPin(testPin);

      // Set up session with known PIN for testing
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { pinHash: hashOfTestPin },
      });

      // Validate PIN
      const pinValidation = await validateTableSessionPin(storeId, sessionId, testPin);
      expect(pinValidation.ok).toBe(true);

      // Authorize device after PIN validation
      const device = await authorizeDeviceForSession(storeId, sessionId, false);
      expect(device.deviceToken).toBeDefined();
    });

    it("should allow multiple devices (up to 5) per session", async () => {
      // First device
      const firstResult = await orchestrateTableSession(storeId, tableId);
      sessionId = firstResult.sessionId;

      // Set up known PIN for subsequent devices
      const testPin = "5555";
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { pinHash: await hashPin(testPin) },
      });

      // Add 4 more devices (total 5)
      for (let i = 0; i < 4; i++) {
        // Validate PIN
        const validation = await validateTableSessionPin(storeId, sessionId, testPin);
        expect(validation.ok).toBe(true);

        // Authorize device
        const device = await authorizeDeviceForSession(storeId, sessionId, false);
        expect(device.deviceToken).toBeDefined();
      }

      // Verify 5 devices are authorized
      const deviceCount = await prisma.sessionDevice.count({
        where: { sessionId, revokedAt: null },
      });

      expect(deviceCount).toBe(5);
    });

    it("should block 6th device when max devices reached", async () => {
      // First device
      const firstResult = await orchestrateTableSession(storeId, tableId);
      sessionId = firstResult.sessionId;

      // Set up known PIN
      const testPin = "6666";
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { pinHash: await hashPin(testPin) },
      });

      // Add 5 devices (max)
      for (let i = 0; i < 5; i++) {
        if (i > 0) {
          const validation = await validateTableSessionPin(storeId, sessionId, testPin);
          expect(validation.ok).toBe(true);
        }
        await authorizeDeviceForSession(storeId, sessionId, i === 0);
      }

      // Try to add 6th device
      const validation = await validateTableSessionPin(storeId, sessionId, testPin);
      expect(validation.ok).toBe(true);

      try {
        await authorizeDeviceForSession(storeId, sessionId, false);
        expect.fail("Should have thrown error for 6th device");
      } catch (error) {
        expect((error as Error).message).toContain("Máximo de dispositivos");
      }
    });
  });

  describe("Scenario 3: PIN Validation and Rate Limiting", () => {
    beforeEach(async () => {
      // First device creates session
      const firstResult = await orchestrateTableSession(storeId, tableId);
      sessionId = firstResult.sessionId;

      // Set up known PIN
      pin = "7777";
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { pinHash: await hashPin(pin) },
      });
    });

    it("should validate correct PIN", async () => {
      const result = await validateTableSessionPin(storeId, sessionId, pin);
      expect(result.ok).toBe(true);
    });

    it("should reject incorrect PIN", async () => {
      const result = await validateTableSessionPin(storeId, sessionId, "0000");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("incorreto");
    });

    it("should enforce rate limiting after 5 wrong attempts", async () => {
      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        const result = await validateTableSessionPin(storeId, sessionId, "0000");
        if (i < 4) {
          expect(result.ok).toBe(false);
        }
      }

      // 6th attempt should be rate limited
      const rateLimited = await validateTableSessionPin(storeId, sessionId, pin);
      expect(rateLimited.ok).toBe(false);
      expect(rateLimited.error).toContain("Muitas tentativas");
    });
  });

  describe("Scenario 4: Session Expiration and Status", () => {
    it("should expire session after 24 hours", async () => {
      const result = await orchestrateTableSession(storeId, tableId);
      sessionId = result.sessionId;

      // Set session to expired
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: {
          expiresAt: new Date(Date.now() - 1000), // Already expired
        },
      });

      // Try to validate PIN on expired session
      const pin = "8888";
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { pinHash: await hashPin(pin) },
      });

      const result2 = await validateTableSessionPin(storeId, sessionId, pin);
      expect(result2.ok).toBe(false);
      expect(result2.error).toContain("expirou");
    });

    it("should reject requests to closed session", async () => {
      const result = await orchestrateTableSession(storeId, tableId);
      sessionId = result.sessionId;

      // Close session
      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: "CLOSED" },
      });

      // Try to add device to closed session
      try {
        await authorizeDeviceForSession(storeId, sessionId, false);
        expect.fail("Should reject closed session");
      } catch (error) {
        expect((error as Error).message).toContain("não está mais aberta");
      }
    });
  });
});
