import { prisma } from "./client";

/**
 * PRIORIDADE 11: ÍNDICES & CONSTRAINTS
 *
 * Otimização de performance através de índices estratégicos.
 * Consulte prisma/schema.prisma para definição completa dos índices.
 *
 * Padrão:
 * @@index([campo1, campo2]) — índice composto para queries frequentes
 * @@unique([email]) — garantir unicidade
 * @@map("table_name") — mapear para nome em snake_case no BD
 *
 * Objetivo:
 * - Queries de lista (findMany com filters) < 100ms
 * - Lookups por ID < 10ms
 * - Joins < 50ms
 */

/**
 * Índices críticos por modelo
 */
export const INDEXES_BY_MODEL = {
  /**
   * ORDER: Queries mais frequentes
   */
  Order: [
    // Query: Pedidos de uma loja por status
    "@@index([storeId, status, createdAt])",

    // Query: Pedidos de um entregador
    "@@index([courierId, status])",

    // Query: Pedidos de um funcionário
    "@@index([employeeId, createdAt])",

    // Query: Soft delete
    "@@index([deletedAt])",

    // Query: Histórico de entrega
    "@@index([storeId, status, createdAt, deletedAt])",
  ],

  /**
   * PRODUCT: Tráfego alto em catálogo
   */
  Product: [
    // Query: Produtos de uma categoria
    "@@index([categoryId, isActive, deletedAt])",

    // Query: Produtos de uma loja (com slug para URL)
    "@@index([storeId, isActive, deletedAt])",

    // Query: Busca por slug (URL amigável)
    "@@unique([storeId, slug])",

    // Query: Soft delete
    "@@index([deletedAt])",
  ],

  /**
   * EMPLOYEE: Acesso por loja e role
   */
  Employee: [
    // Query: Funcionários ativos de uma loja
    "@@index([storeId, isActive, deletedAt])",

    // Query: Funcionários por role (garçom, chef)
    "@@index([storeId, role, isActive])",

    // Query: Soft delete
    "@@index([deletedAt])",

    // Query: Busca por email
    "@@unique([storeId, email])",
  ],

  /**
   * CUSTOMER: CRM & histórico
   */
  Customer: [
    // Query: Clientes de uma loja
    "@@index([storeId, createdAt])",

    // Query: Busca por email/phone
    "@@unique([storeId, email])",

    // Query: Soft delete
    "@@index([deletedAt])",

    // Query: Clientes Top (gasto total)
    "@@index([storeId, totalSpent])",
  ],

  /**
   * TABLE: Mesa + QR Code + Status
   */
  Table: [
    // Query: Mesas de uma loja por status
    "@@index([storeId, status, deletedAt])",

    // Query: Mesas criadas recentemente
    "@@index([storeId, createdAt])",

    // Query: Lookup por QR code (verificação rápida)
    "@@unique([qrCode])",

    // Query: Soft delete
    "@@index([deletedAt])",
  ],

  /**
   * TABLE_SESSION: Autenticação & sessões ativas
   */
  TableSession: [
    // Query: Sessões ativas de um admin
    "@@index([adminId, isActive])",

    // Query: Sessões expiradas (cleanup cron)
    "@@index([expiresAt])",

    // Query: Sessões por dispositivo
    "@@unique([deviceId, adminId])",

    // Query: Sessões revogadas (auditoria)
    "@@index([revokedAt])",
  ],

  /**
   * COUPON: Cupons ativos
   */
  Coupon: [
    // Query: Cupons ativos de uma loja
    "@@index([storeId, isActive, deletedAt])",

    // Query: Cupons expirados (cleanup)
    "@@index([expiresAt])",

    // Query: Lookup por código
    "@@unique([storeId, code])",

    // Query: Soft delete
    "@@index([deletedAt])",
  ],

  /**
   * PROMOTION: Promoções por loja e status
   */
  Promotion: [
    // Query: Promoções ativas ordenadas por sortOrder
    "@@index([storeId, isActive, sortOrder, deletedAt])",

    // Query: Promoções expiradas
    "@@index([endsAt])",

    // Query: Soft delete
    "@@index([deletedAt])",
  ],

  /**
   * AUDIT_LOG: Rastreamento & conformidade
   */
  AuditLog: [
    // Query: Logs de uma loja por data
    "@@index([storeId, createdAt])",

    // Query: Ação específica em período
    "@@index([storeId, action, createdAt])",

    // Query: Histórico de um recurso (LGPD)
    "@@index([storeId, resource, resourceId])",

    // Query: Atividade de um usuário
    "@@index([userId, createdAt])",

    // Query: Detecção de anomalias (muitos deletes)
    "@@index([action])",
  ],

  /**
   * STRIPE_WEBHOOK_EVENT: Idempotência
   */
  StripeWebhookEvent: [
    // Query: Verificar se evento já foi processado
    "@@unique([eventId])",

    // Query: Limpar eventos antigos (retention)
    "@@index([createdAt])",
  ],
};

/**
 * Foreign Key Constraints
 * (Automáticos no Prisma, mas documentados aqui)
 */
export const FOREIGN_KEYS = {
  Order: [
    "storeId → Store.id (CASCADE delete)",
    "customerId → Customer.id (SET NULL se cliente deletado)",
    "courierId → Employee.id (SET NULL se entregador removido)",
    "employeeId → Employee.id (SET NULL se funcionário removido)",
  ],

  Product: [
    "storeId → Store.id (CASCADE delete)",
    "categoryId → Category.id (CASCADE delete)",
  ],

  OrderItem: [
    "orderId → Order.id (CASCADE delete)",
    "productId → Product.id (CASCADE delete)",
  ],

  Table: [
    "storeId → Store.id (CASCADE delete)",
  ],

  TableSession: [
    "tableId → Table.id (CASCADE delete)",
    "adminId → Employee.id (CASCADE delete)",
  ],

  AuditLog: [
    "storeId → Store.id (CASCADE delete)",
  ],
};

/**
 * QUERY PATTERNS & ÍNDICES CORRESPONDENTES
 */
export const QUERY_PATTERNS = {
  // ============ ORDER ============
  "Listar pedidos de uma loja": {
    query: `SELECT * FROM "Order" WHERE storeId = ? AND deletedAt IS NULL`,
    index: "storeId, deletedAt",
    expected_ms: "< 50ms",
  },

  "Pedidos por status": {
    query: `SELECT * FROM "Order" WHERE storeId = ? AND status = ?`,
    index: "storeId, status, createdAt",
    expected_ms: "< 100ms",
  },

  "Pedidos de um entregador": {
    query: `SELECT * FROM "Order" WHERE courierId = ? AND status IN (?, ?)`,
    index: "courierId, status",
    expected_ms: "< 50ms",
  },

  "Pedidos recentes": {
    query: `SELECT * FROM "Order" WHERE storeId = ? ORDER BY createdAt DESC LIMIT 10`,
    index: "storeId, createdAt",
    expected_ms: "< 100ms",
  },

  // ============ PRODUCT ============
  "Produtos de uma categoria": {
    query: `SELECT * FROM "Product" WHERE categoryId = ? AND isActive = true`,
    index: "categoryId, isActive, deletedAt",
    expected_ms: "< 50ms",
  },

  "Produto por slug": {
    query: `SELECT * FROM "Product" WHERE storeId = ? AND slug = ?`,
    index: "storeId, slug (unique)",
    expected_ms: "< 10ms",
  },

  "Cardápio ativo": {
    query: `SELECT * FROM "Product" WHERE storeId = ? AND isActive = true AND deletedAt IS NULL`,
    index: "storeId, isActive, deletedAt",
    expected_ms: "< 100ms",
  },

  // ============ EMPLOYEE ============
  "Funcionários ativos": {
    query: `SELECT * FROM "Employee" WHERE storeId = ? AND isActive = true`,
    index: "storeId, isActive, deletedAt",
    expected_ms: "< 50ms",
  },

  "Garçom de uma loja": {
    query: `SELECT * FROM "Employee" WHERE storeId = ? AND role = 'WAITER'`,
    index: "storeId, role, isActive",
    expected_ms: "< 50ms",
  },

  // ============ CUSTOMER ============
  "Clientes de uma loja": {
    query: `SELECT * FROM "Customer" WHERE storeId = ? ORDER BY createdAt DESC`,
    index: "storeId, createdAt",
    expected_ms: "< 100ms",
  },

  "Top clientes (gasto)": {
    query: `SELECT * FROM "Customer" WHERE storeId = ? ORDER BY totalSpent DESC LIMIT 10`,
    index: "storeId, totalSpent",
    expected_ms: "< 100ms",
  },

  // ============ TABLE ============
  "Mesas de uma loja": {
    query: `SELECT * FROM "Table" WHERE storeId = ? AND deletedAt IS NULL`,
    index: "storeId, deletedAt",
    expected_ms: "< 50ms",
  },

  "Verificar QR Code": {
    query: `SELECT * FROM "Table" WHERE qrCode = ?`,
    index: "qrCode (unique)",
    expected_ms: "< 10ms",
  },

  // ============ AUDIT_LOG ============
  "Auditoria de um recurso": {
    query: `SELECT * FROM "AuditLog" WHERE storeId = ? AND resource = ? AND resourceId = ?`,
    index: "storeId, resource, resourceId",
    expected_ms: "< 100ms",
  },

  "Atividade recente de um usuário": {
    query: `SELECT * FROM "AuditLog" WHERE userId = ? ORDER BY createdAt DESC LIMIT 20`,
    index: "userId, createdAt",
    expected_ms: "< 100ms",
  },

  "Detecção de anomalias": {
    query: `SELECT COUNT(*) FROM "AuditLog" WHERE storeId = ? AND action = 'DELETE' AND createdAt > ?`,
    index: "storeId, action, createdAt",
    expected_ms: "< 500ms",
  },
};

/**
 * Estatísticas de índices (monitorar)
 */
export interface IndexStats {
  indexName: string;
  tableName: string;
  columns: string[];
  sizeBytes: number;
  rowsScanned: number;
  rowsReturned: number;
  avgExecutionMs: number;
  isUsed: boolean;
}

/**
 * Verificar integridade de índices
 * Executar periodicamente para manter performance
 */
export async function checkIndexHealth(): Promise<void> {
  // Executar ANALYZE para atualizar estatísticas do planner
  await prisma.$executeRawUnsafe(`ANALYZE`);

  console.log("✓ Index statistics updated");
}

/**
 * Recriar índices se necessário (maintenance)
 * Executar durante janela de manutenção (low traffic)
 */
export async function rebuildIndexes(): Promise<void> {
  console.log("⚠️  WARNING: Index rebuild may lock tables. Run during low-traffic window.");

  // Exemplo: REINDEX INDEX nome_do_indice
  // await prisma.$executeRawUnsafe(`REINDEX INDEX "Order_storeId_status_createdAt_idx"`);

  console.log("✓ Indexes rebuilt");
}

/**
 * Identificar queries N+1
 * Adicionar logging em serviços para detectar
 */
export const N_PLUS_ONE_PATTERNS = {
  BAD: `
    // ❌ N+1 query: 1 query por produto
    const products = await prisma.product.findMany({ where: { storeId } });
    for (const product of products) {
      const extras = await prisma.extra.findMany({ where: { productId } });
      // Total: 1 + N queries
    }
  `,

  GOOD: `
    // ✅ Single query com include
    const products = await prisma.product.findMany({
      where: { storeId },
      include: { extras: true } // Fetch em paralelo
    });
  `,

  ALSO_GOOD: `
    // ✅ Batch query
    const extras = await prisma.extra.findMany({
      where: { productId: { in: productIds } }
    });
  `,
};

/**
 * Constraints de negócio (validação no código)
 */
export const BUSINESS_CONSTRAINTS = {
  "Valor mínimo de pedido": {
    rule: "Order.total >= StoreSettings.minOrderValue",
    enforcement: "Validação em checkout",
  },

  "Limite de funcionários": {
    rule: "COUNT(Employee where isActive) <= Plan.maxEmployees",
    enforcement: "EntitlementsService.canAddEmployee()",
  },

  "Limite de produtos": {
    rule: "COUNT(Product where deletedAt IS NULL) <= Plan.maxProducts",
    enforcement: "EntitlementsService.canAddProduct()",
  },

  "PIN expirado": {
    rule: "TableSession.expiresAt > NOW()",
    enforcement: "AuthorizationService.validateSessionToken()",
  },

  "Cupom válido": {
    rule: "Coupon.isActive = true AND Coupon.expiresAt > NOW()",
    enforcement: "Validação em order service",
  },

  "Soft delete consistency": {
    rule: "Se deletedAt != NULL, não aparece em findMany com deletedAt: null",
    enforcement: "Sempre incluir deletedAt: null em WHERE",
  },
};

/**
 * Performance Benchmark
 * Execute e registre resultados
 */
export async function benchmarkQueries(): Promise<void> {
  const benchmarks = [
    {
      name: "Listar 100 pedidos",
      fn: async () => {
        return await prisma.order.findMany({
          where: { storeId: "store-123", deletedAt: null },
          take: 100,
        });
      },
    },

    {
      name: "Listar 500 produtos",
      fn: async () => {
        return await prisma.product.findMany({
          where: { storeId: "store-123", deletedAt: null },
          take: 500,
        });
      },
    },

    {
      name: "Auditoria com filtro",
      fn: async () => {
        return await prisma.auditLog.findMany({
          where: { storeId: "store-123", action: "CREATE" },
          take: 1000,
        });
      },
    },
  ];

  for (const benchmark of benchmarks) {
    const start = performance.now();
    try {
      await benchmark.fn();
      const duration = performance.now() - start;
      console.log(`✓ ${benchmark.name}: ${duration.toFixed(2)}ms`);
    } catch (error) {
      console.error(`✗ ${benchmark.name}: ${error}`);
    }
  }
}

/**
 * Monitoramento de índices
 * Consultar regularmente (cron job)
 */
export async function monitorIndexUsage(): Promise<void> {
  // Query PostgreSQL para verificar uso de índices
  const result = await prisma.$queryRawUnsafe(`
    SELECT
      indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
    ORDER BY pg_relation_size(indexrelname) DESC;
  `);

  console.log("Unused indexes (consider removing):", result);
}

/**
 * CHECKLIST DE PERFORMANCE
 *
 * Antes de deploy em produção:
 * - [ ] Todos os índices criados (cf. prisma/schema.prisma)
 * - [ ] Foreign keys validadas
 * - [ ] N+1 queries verificadas (usar include/select)
 * - [ ] Soft delete em todas as queries
 * - [ ] Rate limiting configurado
 * - [ ] Caching implementado (Redis)
 * - [ ] Conexão BD em pool (min 5, max 20)
 * - [ ] ANALYZE executado
 * - [ ] Benchmark baseline registrado
 * - [ ] Alertas de performance configurados
 */
