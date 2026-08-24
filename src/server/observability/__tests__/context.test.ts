import { describe, it, expect, beforeEach } from "vitest";
import {
  initializeContext,
  setContext,
  getContext,
  getContextOrThrow,
  withContext,
  updateContext,
  createChildSpan,
  formatContextForLogs,
  getContextHeaders,
  extractContextFromHeaders,
} from "../context";

/**
 * PRIORIDADE 8: TESTES DE OBSERVABILIDADE
 *
 * Valida que contexto é propagado corretamente através
 * de async operations, e integra com logs e auditoria.
 */

describe("ObservabilityContext: Initialization", () => {
  beforeEach(() => {
    // Limpar contexto entre testes
  });

  it("deve gerar requestId único", () => {
    const context1 = initializeContext({});
    const context2 = initializeContext({});

    expect(context1.requestId).toBeDefined();
    expect(context2.requestId).toBeDefined();
    expect(context1.requestId).not.toBe(context2.requestId);
  });

  it("deve usar correlationId fornecido", () => {
    const context = initializeContext({
      correlationId: "my-correlation-123",
    });

    expect(context.correlationId).toBe("my-correlation-123");
  });

  it("deve gerar correlationId se não fornecido", () => {
    const context = initializeContext({});

    expect(context.correlationId).toBeDefined();
    expect(context.correlationId.length).toBeGreaterThan(0);
  });

  it("deve inicializar com startTime", () => {
    const before = new Date();
    const context = initializeContext({});
    const after = new Date();

    expect(context.startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(context.startTime.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("deve copiar todos os inputs para contexto", () => {
    const context = initializeContext({
      userId: "admin-123",
      userEmail: "admin@example.com",
      storeId: "store-456",
      ipAddress: "192.168.1.1",
      method: "POST",
      path: "/api/products",
      userAgent: "Mozilla/5.0",
    });

    expect(context.userId).toBe("admin-123");
    expect(context.userEmail).toBe("admin@example.com");
    expect(context.storeId).toBe("store-456");
    expect(context.ipAddress).toBe("192.168.1.1");
    expect(context.method).toBe("POST");
    expect(context.path).toBe("/api/products");
    expect(context.userAgent).toBe("Mozilla/5.0");
  });
});

describe("ObservabilityContext: Storage", () => {
  it("deve armazenar e recuperar contexto", () => {
    const context = initializeContext({ userId: "user-123" });
    setContext(context);

    const retrieved = getContext();

    expect(retrieved).toBeDefined();
    expect(retrieved?.userId).toBe("user-123");
    expect(retrieved?.requestId).toBe(context.requestId);
  });

  it("deve retornar undefined se contexto não existe", () => {
    const retrieved = getContext();

    expect(retrieved).toBeUndefined();
  });

  it("deve lançar erro se getContextOrThrow sem contexto", () => {
    expect(() => getContextOrThrow()).toThrow("ObservabilityContext not initialized");
  });

  it("deve retornar contexto com getContextOrThrow", () => {
    const context = initializeContext({ userId: "user-456" });
    setContext(context);

    const retrieved = getContextOrThrow();

    expect(retrieved.userId).toBe("user-456");
  });
});

describe("ObservabilityContext: Async Propagation", () => {
  it("deve propagar contexto através de await", async () => {
    const context = initializeContext({ userId: "user-789", storeId: "store-abc" });

    await withContext(context, async () => {
      const retrieved = getContextOrThrow();

      expect(retrieved.userId).toBe("user-789");
      expect(retrieved.storeId).toBe("store-abc");
    });
  });

  it("deve retornar valor do callback", async () => {
    const context = initializeContext({});

    const result = await withContext(context, async () => {
      return "success";
    });

    expect(result).toBe("success");
  });
});

describe("ObservabilityContext: Updates", () => {
  it("deve atualizar campos do contexto", () => {
    const context = initializeContext({ userId: undefined });
    setContext(context);

    updateContext({ userId: "admin-new" });

    const updated = getContextOrThrow();
    expect(updated.userId).toBe("admin-new");
    expect(updated.requestId).toBe(context.requestId); // Mantém original
  });

  it("deve lançar erro se atualizar sem contexto", () => {
    expect(() => updateContext({ userId: "admin" })).toThrow("No context to update");
  });
});

describe("ObservabilityContext: Child Spans", () => {
  it("deve criar span filho com mesmo contexto", () => {
    const parent = initializeContext({ userId: "user-123", storeId: "store-456" });

    const child = createChildSpan(parent);

    expect(child.userId).toBe(parent.userId);
    expect(child.storeId).toBe(parent.storeId);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.requestId).toBe(parent.requestId);
    expect(child.spanId).not.toBe(parent.spanId); // Novo spanId
  });

  it("deve gerar novo spanId para cada child", () => {
    const parent = initializeContext({});

    const child1 = createChildSpan(parent);
    const child2 = createChildSpan(parent);

    expect(child1.spanId).not.toBe(child2.spanId);
  });
});

describe("ObservabilityContext: Formatting", () => {
  it("deve formatar contexto para logs", () => {
    const context = initializeContext({ userId: "user-123", storeId: "store-456" });

    const formatted = formatContextForLogs(context);

    expect(formatted).toHaveProperty("requestId");
    expect(formatted).toHaveProperty("correlationId");
    expect(formatted).toHaveProperty("traceId");
    expect(formatted).toHaveProperty("spanId");
    expect(formatted).toHaveProperty("userId", "user-123");
    expect(formatted).toHaveProperty("storeId", "store-456");
    expect(formatted).toHaveProperty("duration");
  });

  it("duration deve ser calculado corretamente", async () => {
    const context = initializeContext({});

    await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms delay

    const formatted = formatContextForLogs(context);

    expect((formatted as any).duration).toBeGreaterThanOrEqual(10);
  });
});

describe("ObservabilityContext: HTTP Headers", () => {
  it("deve gerar headers W3C Trace Context", () => {
    const context = initializeContext({
      userId: "user-123",
      storeId: "store-456",
    });

    const headers = getContextHeaders(context);

    expect(headers["traceparent"]).toMatch(/^00-[\da-f]+-[\da-f]+-01$/);
    expect(headers["x-request-id"]).toBe(context.requestId);
    expect(headers["x-correlation-id"]).toBe(context.correlationId);
    expect(headers["x-user-id"]).toBe("user-123");
    expect(headers["x-store-id"]).toBe("store-456");
  });

  it("deve usar 'anonymous' para userId missing", () => {
    const context = initializeContext({});

    const headers = getContextHeaders(context);

    expect(headers["x-user-id"]).toBe("anonymous");
  });

  it("deve usar 'unknown' para storeId missing", () => {
    const context = initializeContext({});

    const headers = getContextHeaders(context);

    expect(headers["x-store-id"]).toBe("unknown");
  });
});

describe("ObservabilityContext: Header Extraction", () => {
  it("deve extrair contexto de headers", () => {
    const headers = {
      "traceparent": "00-1234567890abcdef-fedcba0987654321-01",
      "x-request-id": "req-123",
      "x-correlation-id": "corr-456",
      "x-user-id": "user-789",
      "x-store-id": "store-abc",
    };

    const extracted = extractContextFromHeaders(headers);

    expect(extracted.requestId).toBe("req-123");
    expect(extracted.correlationId).toBe("corr-456");
    expect(extracted.traceId).toBe("1234567890abcdef");
    expect(extracted.spanId).toBe("fedcba0987654321");
    expect(extracted.userId).toBe("user-789");
    expect(extracted.storeId).toBe("store-abc");
  });

  it("deve lidar com headers ausentes", () => {
    const extracted = extractContextFromHeaders({});

    expect(extracted.requestId).toBeUndefined();
    expect(extracted.correlationId).toBeUndefined();
  });

  it("deve aceitar trace-parent (alternativo)", () => {
    const headers = {
      "trace-parent": "00-aaaa-bbbb-01",
    };

    const extracted = extractContextFromHeaders(headers);

    expect(extracted.traceId).toBe("aaaa");
    expect(extracted.spanId).toBe("bbbb");
  });

  it("deve aceitar x-trace-id alternativo", () => {
    const headers = {
      "x-trace-id": "trace-999",
      "x-span-id": "span-888",
    };

    const extracted = extractContextFromHeaders(headers);

    expect(extracted.traceId).toBe("trace-999");
    expect(extracted.spanId).toBe("span-888");
  });
});

describe("ObservabilityContext: Integration", () => {
  it("deve funcionar com round-trip headers", () => {
    // Serviço A: cria contexto e gera headers
    const contextA = initializeContext({
      userId: "user-123",
      storeId: "store-456",
      method: "POST",
      path: "/api/orders",
    });

    const headers = getContextHeaders(contextA);

    // Serviço B: recebe headers e reconstrói contexto
    const extracted = extractContextFromHeaders(headers);
    const contextB = initializeContext(extracted);

    expect(contextB.requestId).toBe(contextA.requestId);
    expect(contextB.correlationId).toBe(contextA.correlationId);
    expect(contextB.traceId).toBe(contextA.traceId);
    expect(contextB.userId).toBe("user-123");
    expect(contextB.storeId).toBe("store-456");
  });

  it("deve gerar novo spanId para serviço B", () => {
    const contextA = initializeContext({});
    const headers = getContextHeaders(contextA);

    const extracted = extractContextFromHeaders(headers);
    const contextB = initializeContext(extracted);

    // spanId é novo para serviço B (nova operação)
    expect(contextB.spanId).not.toBe(contextA.spanId);

    // Mas trace permanece igual
    expect(contextB.traceId).toBe(contextA.traceId);
  });
});
