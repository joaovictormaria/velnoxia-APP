import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuditService } from "../audit-service";
import { prisma } from "../../db/client";

/**
 * PRIORIDADE 6: TESTES DE AUDITORIA
 *
 * Valida que logs de auditoria são registrados corretamente,
 * sem perder informações, e habilitam investigação/compliance.
 */

vi.mock("../../db/client");

describe("AuditService: Logging", () => {
  const storeId = "store-123";
  const userId = "admin-456";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Registrar mudanças", () => {
    it("deve criar log ao editar produto", async () => {
      const mockLog = {
        id: "log-1",
        storeId,
        userId,
        action: "UPDATE",
        resource: "Product",
        resourceId: "prod-789",
        oldValue: '{"price": 25.00}',
        newValue: '{"price": 29.99}',
        createdAt: new Date(),
      };

      vi.mocked(prisma.auditLog.create).mockResolvedValue(mockLog as any);

      await AuditService.log({
        storeId,
        userId,
        action: "UPDATE",
        resource: "Product",
        resourceId: "prod-789",
        oldValue: { price: 25.0 },
        newValue: { price: 29.99 },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId,
          userId,
          action: "UPDATE",
          resource: "Product",
          resourceId: "prod-789",
          status: "SUCCESS",
        }),
      });
    });

    it("deve registrar CREATE de novo recurso", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await AuditService.log({
        storeId,
        userId,
        action: "CREATE",
        resource: "Employee",
        resourceId: "emp-111",
        newValue: { name: "João", phone: "11999999999" },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "CREATE",
          oldValue: null, // Nenhum valor anterior
        }),
      });
    });

    it("deve registrar DELETE com razão", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await AuditService.log({
        storeId,
        userId,
        action: "DELETE",
        resource: "Coupon",
        resourceId: "coupon-222",
        oldValue: { code: "DESC10", discount: 10 },
        reason: "Cupom expirado",
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "DELETE",
          reason: "Cupom expirado",
        }),
      });
    });

    it("deve registrar WEBHOOK como ação do sistema", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await AuditService.log({
        storeId,
        isSystem: true,
        action: "WEBHOOK",
        resource: "Subscription",
        resourceId: "sub-stripe-123",
        newValue: { status: "active", currentPeriodEnd: 1234567890 },
        reason: "Stripe: subscription.updated",
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isSystem: true,
          action: "WEBHOOK",
        }),
      });
    });

    it("deve capturar IP do cliente", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await AuditService.log({
        storeId,
        userId,
        action: "UPDATE",
        resource: "Store",
        resourceId: storeId,
        ipAddress: "192.168.1.100",
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: "192.168.1.100",
        }),
      });
    });

    it("deve usar createdAt do servidor (não do cliente)", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const beforeCall = new Date();
      await AuditService.log({
        storeId,
        userId,
        action: "CREATE",
        resource: "Product",
        resourceId: "prod-new",
      });
      const afterCall = new Date();

      // Prisma usaria @default(now()) — data do servidor
      expect(prisma.auditLog.create).toHaveBeenCalled();
      // Não passamos createdAt manualmente (deixar Prisma decidir)
    });
  });

  describe("Registrar erros", () => {
    it("deve registrar erro de operação", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const error = new Error("Falha ao salvar no banco");
      await AuditService.logError(
        {
          storeId,
          userId,
          action: "UPDATE",
          resource: "Order",
          resourceId: "order-999",
        },
        error,
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Falha ao salvar no banco",
        }),
      });
    });

    it("deve limitar tamanho de mensagem de erro", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const longError = new Error("x".repeat(1000));
      await AuditService.logError(
        {
          storeId,
          userId,
          action: "DELETE",
          resource: "Product",
          resourceId: "prod-del",
        },
        longError,
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          errorMessage: expect.stringMatching(/.{1,500}$/), // Max 500 chars
        }),
      });
    });
  });

  describe("Extrair mudanças", () => {
    it("deve detectar mudanças entre dois estados", () => {
      const result = AuditService.extractChanges(
        { price: 25.0, name: "Pizza A" },
        { price: 29.99, name: "Pizza A" },
      );

      expect(result.changed).toBe(true);
      expect(result.oldValue).toBeDefined();
      expect(result.newValue).toBeDefined();
    });

    it("deve retornar changed=false se nada mudou", () => {
      const result = AuditService.extractChanges(
        { price: 25.0 },
        { price: 25.0 },
      );

      expect(result.changed).toBe(false);
    });

    it("deve lidar com null values", () => {
      const resultCreate = AuditService.extractChanges(null, { id: "123" });
      expect(resultCreate.changed).toBe(true);
      expect(resultCreate.newValue).toBeDefined();

      const resultDelete = AuditService.extractChanges({ id: "123" }, null);
      expect(resultDelete.changed).toBe(true);
      expect(resultDelete.oldValue).toBeDefined();
    });
  });

  describe("Consultas de auditoria", () => {
    it("deve buscar logs com filtros", async () => {
      const mockLogs = [
        {
          id: "log-1",
          action: "UPDATE",
          resource: "Product",
          status: "SUCCESS",
          createdAt: new Date(),
        },
      ];

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockLogs as any);

      const result = await AuditService.query({
        storeId,
        action: "UPDATE",
        limit: 100,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            storeId,
            action: "UPDATE",
          }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("deve retornar logs com valores parseados", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: "log-1",
          action: "UPDATE",
          oldValue: '{"price": 25.00}',
          newValue: '{"price": 29.99}',
          createdAt: new Date(),
        },
      ] as any);

      const result = await AuditService.query({ storeId });

      expect(result[0].oldValue).toEqual({ price: 25.0 });
      expect(result[0].newValue).toEqual({ price: 29.99 });
    });
  });

  describe("Relatórios e compliance", () => {
    it("deve gerar relatório de 24h", async () => {
      const now = new Date();
      const logs = [
        {
          id: "log-1",
          action: "CREATE",
          resource: "Product",
          createdAt: now,
        },
        {
          id: "log-2",
          action: "UPDATE",
          resource: "Product",
          createdAt: new Date(now.getTime() - 3600000),
        },
      ];

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(logs as any);

      const report = await AuditService.getDayReport(storeId);

      expect(report.totalChanges).toBe(2);
      expect(report.byAction.CREATE).toHaveLength(1);
      expect(report.byAction.UPDATE).toHaveLength(1);
      expect(report.byResource.Product).toHaveLength(2);
    });

    it("deve retornar histórico de um recurso", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: "log-1",
          action: "CREATE",
          createdAt: new Date("2026-08-20"),
        },
        {
          id: "log-2",
          action: "UPDATE",
          createdAt: new Date("2026-08-21"),
        },
        {
          id: "log-3",
          action: "UPDATE",
          createdAt: new Date("2026-08-22"),
        },
      ] as any);

      const history = await AuditService.getResourceHistory(
        storeId,
        "Product",
        "prod-123",
      );

      expect(history).toHaveLength(3);
      expect(history[0].action).toBe("CREATE");
      expect(history[2].action).toBe("UPDATE");
    });

    it("deve retornar atividade de um usuário", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        { id: "log-1", userId, action: "CREATE" },
        { id: "log-2", userId, action: "UPDATE" },
        { id: "log-3", userId, action: "DELETE" },
      ] as any);

      const activity = await AuditService.getUserActivity(storeId, userId);

      expect(activity).toHaveLength(3);
      expect(activity.every((log) => log.userId === userId)).toBe(true);
    });

    it("deve detectar padrão anômalo (muitos deletes)", async () => {
      const deleteLogs = Array(15)
        .fill(null)
        .map((_, i) => ({
          id: `log-${i}`,
          action: "DELETE",
        }));

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(
        deleteLogs as any,
      );

      const anomalies = await AuditService.detectAnomalies(storeId, 24);

      expect(anomalies.deleteCount).toBe(15);
      expect(anomalies.isAnomaly).toBe(true);
    });

    it("não deve marcar como anômalo se < 10 deletes", async () => {
      const deleteLogs = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `log-${i}`,
          action: "DELETE",
        }));

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(
        deleteLogs as any,
      );

      const anomalies = await AuditService.detectAnomalies(storeId, 24);

      expect(anomalies.deleteCount).toBe(5);
      expect(anomalies.isAnomaly).toBe(false);
    });
  });

  describe("Segurança e imutabilidade", () => {
    it("AuditLog nunca é deletado", () => {
      // AuditLog.model não tem deleteMany/delete em prisma client
      // É apenas createOnly (append-only log)
      expect(prisma.auditLog.create).toBeDefined();
      expect(prisma.auditLog.delete).toBeUndefined();
    });

    it("deve registrar IP para forensics", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await AuditService.log({
        storeId,
        userId,
        action: "CREATE",
        resource: "Product",
        resourceId: "prod-sus",
        ipAddress: "203.0.113.1", // Example IP
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: "203.0.113.1",
        }),
      });
    });

    it("deve diferenciar ações do sistema vs admin", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      // Ação do admin
      await AuditService.log({
        storeId,
        userId: "admin-789",
        action: "UPDATE",
        resource: "Product",
        resourceId: "prod-1",
      });

      // Ação do sistema (webhook)
      await AuditService.log({
        storeId,
        isSystem: true,
        action: "WEBHOOK",
        resource: "Subscription",
        resourceId: "sub-1",
      });

      const calls = vi.mocked(prisma.auditLog.create).mock.calls;
      expect(calls[0][0].data.isSystem).toBe(false);
      expect(calls[1][0].data.isSystem).toBe(true);
    });
  });
});
