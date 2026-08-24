# ROADMAP PROFISSIONAL - VELNOXIA APP
## Plano de Escalabilidade e Profissionalização

**Data**: 2026-08-24  
**Status**: Em Planejamento  
**Prioridade**: Crítica para Produção

---

## ESTRUTURA DE PASTAS RECOMENDADA

```
src/server/
├── auth/                    # Autenticação, sessões, PINs
│   ├── session.ts
│   ├── password.ts
│   ├── pin.ts
│   ├── device-token.ts
│   ├── invite-code.ts
│   └── authorization.ts     # [NEW] Centralized AuthorizationService
│
├── billing/                 # Stripe, assinaturas, entitlements
│   ├── stripe.ts
│   ├── subscription-service.ts
│   ├── access.ts
│   ├── webhook-handler.ts   # [NEW] Centralizado
│   └── entitlements.ts      # [NEW] Prioridade 2
│
├── repositories/            # Acesso aos dados
│   ├── order-repository.ts
│   ├── product-repository.ts
│   ├── store-repository.ts
│   ├── billing-repository.ts # [NEW]
│   ├── audit-repository.ts   # [NEW]
│   └── ...
│
├── services/                # Lógica de negócio
│   ├── order-service.ts
│   ├── product-service.ts
│   ├── inventory-service.ts
│   ├── billing-service.ts    # [NEW] Refatorado
│   ├── authorization-service.ts # [NEW] Prioridade 10
│   ├── audit-service.ts      # [NEW] Prioridade 6
│   └── ...
│
├── observability/           # [NEW] Prioridade 8
│   ├── logger.ts
│   ├── trace.ts
│   ├── metrics.ts
│   └── health.ts            # [NEW] Prioridade 16
│
├── security/                # [NEW] Rate limiting distribuído
│   ├── rate-limit.ts        # Migrar para Redis (Prioridade 9)
│   ├── validation.ts
│   └── multi-tenant.ts      # [NEW] Prioridade 3
│
├── mail/
│   └── resend.ts
│
├── jobs/                    # [NEW] Background jobs
│   ├── retry-failed-payments.ts
│   ├── process-subscriptions.ts
│   └── cleanup-expired-sessions.ts
│
├── integrations/            # [NEW] Integrações externas
│   ├── stripe/
│   ├── ifood/               # [NEW] Prioridade 14
│   ├── uber-eats/           # [NEW] Prioridade 14
│   └── whatsapp/
│
├── db/
│   └── client.ts
│
└── middleware/              # [NEW] Request handling
    ├── auth.ts
    ├── tenant.ts
    ├── logging.ts
    └── error.ts
```

---

## 17 PRIORIDADES DE IMPLEMENTAÇÃO

### 🔴 PRIORIDADE 1: BILLING (CRÍTICA)
**Objetivo**: Stripe como fonte de verdade, webhooks controlam tudo

**O quê implementar:**
- [ ] Refatorar `billing-service.ts` com webhooks robustos
- [ ] Estados claros: TRIAL, ACTIVE, PAST_DUE, CANCELED
- [ ] Upgrade imediato (sem esperar próximo ciclo)
- [ ] Downgrade agendado (efetiva no próximo ciclo)
- [ ] Proration automático ao mudar plano
- [ ] Sincronizar com Stripe a cada webhook (fonte de verdade)
- [ ] Nunca deixar front alterar plano (bloqueado no servidor)
- [ ] Entitlements layer integrado

**Arquivos a criar/modificar:**
- `src/server/billing/webhook-handler.ts` (novo)
- `src/server/billing/billing-service.ts` (refatorar)
- `src/server/functions/billing.fn.ts` (update)
- `prisma/schema.prisma` (novos campos se necessário)

**Entrada/Saída:**
```
Input: Webhook Stripe → evento de pagamento/cancelamento
Output: Store atualizada com status correto, acesso controlado por Entitlements
```

**Tests:**
- Trial renewal
- Upgrade com proration
- Downgrade agendado
- Pagamento falho → PAST_DUE
- Cancelamento
- Reativação

---

### 🟠 PRIORIDADE 2: ENTITLEMENTS LAYER
**Objetivo**: Decisão clara de recursos por plano, sem ifs espalhados

**O quê implementar:**
- [ ] Model `Plan` com recursos (max_produtos, max_funcionarios, etc)
- [ ] Service `EntitlementsService` para verificar permissões
- [ ] Middleware que enriquece context com entitlements
- [ ] Bloqueios no servidor (não front)

**Exemplo de uso:**
```typescript
const { canAddProduct, remainingProducts } = await entitlements.canAddProduct(storeId);
if (!canAddProduct) {
  return { ok: false, error: "Plano atingiu limite de produtos" };
}
```

**Arquivos:**
- `src/server/billing/entitlements.ts` (novo)
- `src/server/services/authorization-service.ts` (novo, Prioridade 10)
- Migrations para tabelas de planos

**Tests:**
- Verificar limite de produtos
- Verificar acesso a módulos (estoque, API pública)
- Bloqueio de upgrade sem plano ativo

---

### 🔴 PRIORIDADE 3: MULTI-TENANT SECURITY
**Objetivo**: Isolamento total, storeId em todas as queries

**O quê implementar:**
- [ ] Audit de todas as queries Prisma (grep `where:`)
- [ ] Middleware que valida storeId no contexto
- [ ] Rejeição automática se storeId não bater
- [ ] Foreign keys com cascade corretos

**Checklist:**
- [ ] Todos os `findMany` têm `where: { storeId }`
- [ ] Todos os `findUnique` também validam storeId
- [ ] Admin não pode ver dados de outra loja
- [ ] API pública não pode ser explorada com IDs manipulados

**Arquivos:**
- `src/server/security/multi-tenant.ts` (novo)
- Middleware que enriquece context

**Tests:**
- Loja A tenta acessar dados de Loja B (recusa)
- Admin tenta manipular IDs na URL
- QueryFn ignora ID manipulado

---

### 💰 PRIORIDADE 4: DINHEIRO (NUNCA FLOAT)
**Objetivo**: Usar Decimal ou centavos, nunca Float

**O quê implementar:**
- [ ] Mudar Order.total, subtotal, deliveryFee para Decimal
- [ ] Mudar Coupon.discountValue para Decimal
- [ ] Mudar InventoryItem.cost para Decimal
- [ ] Mudar Promotion.value para Decimal
- [ ] Helpers para conversão (Float ↔ Decimal)
- [ ] Testes de precisão (0.01 BRL)

**Exemplo:**
```typescript
// ERRADO
const total = order.subtotal + order.deliveryFee; // Float imprecisão
// CERTO
const total = new Decimal(order.subtotal).plus(order.deliveryFee); // Decimal precisão
```

**Migrations:**
- Alterar tipos de Float para Decimal em todas as tabelas financeiras

**Tests:**
- Somar 0.01 + 0.02 = 0.03 (não 0.030000000000000001)
- Desconto de cupom (5% de R$ 99.99)

---

### 🧪 PRIORIDADE 5: TESTES
**Objetivo**: Cobertura de pricing, cupons, benefícios, estoque, permissões

**O quê implementar:**
- [ ] Testes unitários de `pricing` (desconto, cupom, taxa)
- [ ] Testes de `benefícios` (cálculo, cota diária, exceções)
- [ ] Testes de `estoque` (entrada, consumo, saldo)
- [ ] Testes de `permissões` (multi-tenant, planos, roles)
- [ ] Testes de integração de `checkout` (ponta a ponta)
- [ ] Testes E2E do fluxo completo

**Estrutura:**
```
src/server/
├── services/__tests__/
│   ├── pricing.test.ts
│   ├── benefits.test.ts
│   ├── inventory.test.ts
│   └── permissions.test.ts
└── functions/__tests__/
    ├── checkout.test.ts
    └── orders.test.ts
```

**Mínimo esperado:**
- 80% cobertura de código em services críticos
- Todos os cenários de negócio testados
- E2E: cliente → carrinho → checkout → pedido no BD

---

### 📋 PRIORIDADE 6: AUDIT LOG
**Objetivo**: Registrar criação/exclusão de produtos, preços, permissões, estoque, pedidos

**O quê implementar:**
- [ ] Tabela `AuditLog` (userId, action, resource, oldValue, newValue, timestamp, IP)
- [ ] Service `AuditService` que registra automaticamente
- [ ] Middleware que captura userId e IP
- [ ] Queries para listar histórico (filtrar por recurso, data)

**Exemplo:**
```typescript
await auditService.log({
  userId: admin.id,
  action: 'UPDATE_PRODUCT_PRICE',
  resource: 'Product',
  resourceId: product.id,
  oldValue: { price: 25.00 },
  newValue: { price: 29.90 },
  ip: request.headers['x-forwarded-for']
});
```

**Recursos a auditar:**
- Produtos (create, update, delete)
- Preços (change)
- Permissões (role change)
- Estoque (movimentos)
- Benefícios (create, update)
- Pedidos (cancel, refund)

---

### 🗑️ PRIORIDADE 7: SOFT DELETE
**Objetivo**: Nunca apagar pedidos, pagamentos, auditoria. Use `deletedAt`

**O quê implementar:**
- [ ] Adicionar campo `deletedAt` a modelos críticos
- [ ] Adicionar campo `deletedBy` para rastrear quem deletou
- [ ] Soft delete em: Order, Payment, AuditLog, Employee (histórico)
- [ ] Queries automáticas ignoram deletados por padrão
- [ ] Admin pode ver/restaurar deletados

**Modelos:**
```prisma
model Order {
  ...
  deletedAt DateTime?
  deletedBy String? // FK para AdminUser
}

model Product {
  ...
  deletedAt DateTime?
  deletedBy String?
}
```

---

### 📡 PRIORIDADE 8: OBSERVABILIDADE
**Objetivo**: requestId, correlationId, StripeEventId para rastrear tudo

**O quê implementar:**
- [ ] Middleware que gera requestId único
- [ ] correlationId para rastrear pedido até pagamento até entrega
- [ ] Logger estruturado (JSON com contexto)
- [ ] Rastreamento de StripeEventId em pagamentos

**Exemplo:**
```typescript
// Request inicia
const requestId = generateUUID();
const correlationId = req.headers['x-correlation-id'] || generateUUID();

// Log estruturado
logger.info('Checkout started', {
  requestId,
  correlationId,
  storeId,
  customerId,
  total
});

// Stripe webhook
logger.info('Payment received', {
  requestId,
  stripeEventId: event.id,
  correlationId
});
```

**Benefício:** Rastrear bug → requestId → todos os logs envolvidos

---

### 🔐 PRIORIDADE 9: RATE LIMITING DISTRIBUÍDO
**Objetivo**: Redis, não memória. Login, reset de senha, APIs públicas

**O quê implementar:**
- [ ] Substituir Map em memória por Redis
- [ ] Chaves: `rate-limit:{endpoint}:{ip}`
- [ ] Login: 5 tentativas / 60s
- [ ] Reset de senha: 3 tentativas / 60s
- [ ] Checkout: 8 por minuto
- [ ] PIN mesa: 3 tentativas / 5 min

**Instalação:**
```bash
npm install redis ioredis
```

**Arquivo:**
- `src/server/security/rate-limit.ts` (refatorar com Redis)

---

### 🔑 PRIORIDADE 10: AUTHORIZATION SERVICE
**Objetivo**: Centralizar autorização, PIN, sessões, revogação, rotação

**O quê implementar:**
- [ ] Service único para todas as verificações de permissão
- [ ] Validação de PIN (mesa, funcionário)
- [ ] Validação de dispositivo (SessionDevice)
- [ ] Revogação de tokens
- [ ] Rotação de sessão (version incrementing)

**Arquivo:**
- `src/server/services/authorization-service.ts` (novo)

**Métodos:**
```typescript
class AuthorizationService {
  canUserAccessStore(userId, storeId): boolean
  validatePin(sessionId, pin): { ok: boolean, deviceToken?: string }
  revokeDevice(deviceId): void
  rotateSession(userId): string // novo session token
}
```

---

### 📊 PRIORIDADE 11: ÍNDICES E CONSTRAINTS
**Objetivo**: Performance, buscas por storeId, status, datas

**O quê implementar:**
- [ ] Índice em `Order(storeId, status, createdAt)`
- [ ] Índice em `Product(storeId, isActive, categoryId)`
- [ ] Índice em `Customer(storeId, phone)`
- [ ] Índice em `InventoryMovement(storeId, createdAt)`
- [ ] Foreign keys com ON DELETE CASCADE onde apropriado
- [ ] Constraints de cardinalidade (ex: um OPEN por mesa)

**Migrations:**
- Criar índices compostos
- Adicionar constraints

---

### 📦 PRIORIDADE 12: EVOLUÇÃO DO ESTOQUE
**Objetivo**: Manter modelo bom, evoluir para conferência, custo médio, depósitos

**Futuro (não crítico agora):**
- [ ] Conferência (físico vs sistema)
- [ ] Custo médio (FIFO, LIFO)
- [ ] Múltiplos depósitos
- [ ] Transferências entre depósitos
- [ ] Alertas inteligentes

---

### 🍽️ PRIORIDADE 13: DINE-IN AVANÇADO
**Objetivo**: Reservas, troca de mesas, union, histórico

**O quê implementar:**
- [ ] Tabela `TableReservation` (data, hora, nomes, telefone)
- [ ] Status de mesa: AVAILABLE, OCCUPIED, RESERVED, MAINTENANCE
- [ ] API para trocar clientes de mesa
- [ ] API para unir mesas (consolidar conta)
- [ ] Histórico de sessões (para análise)

---

### 🌐 PRIORIDADE 14: API PÚBLICA
**Objetivo**: Integrações futuras (iFood, Uber Eats), sem quebrar atual

**O quê implementar:**
- [ ] Novo router `/api/v1/` separado
- [ ] Auth com API keys (não session)
- [ ] Endpoints: criar pedido, consultar status, webhook de entrega
- [ ] Rate limiting por API key
- [ ] Documentação OpenAPI/Swagger

**Exemplo:**
```
POST /api/v1/orders (criar pedido via iFood)
GET /api/v1/orders/:id (rastrear)
POST /api/v1/webhooks/order-status (notificação)
```

---

### ⚡ PRIORIDADE 15: PERFORMANCE
**Objetivo**: Cache, lazy loading, paginação, background jobs

**O quê implementar:**
- [ ] Cache de Menu (Redis, 1h TTL)
- [ ] Lazy loading em dashboard (infinit scroll)
- [ ] Paginação em listas grandes (pedidos antigos, etc)
- [ ] Background jobs (retry pagamentos, limpeza sessiões)
- [ ] Query optimization (N+1 fixes)

**Jobs:**
- `retry-failed-payments.ts` (diário às 2am)
- `process-subscriptions.ts` (diário às 3am)
- `cleanup-expired-sessions.ts` (de hora em hora)

---

### 📈 PRIORIDADE 16: MONITORAMENTO
**Objetivo**: Health checks, métricas, alertas

**O quê implementar:**
- [ ] Endpoint `/health` (DB, Redis, Stripe)
- [ ] Métricas: CPU, memória, latência
- [ ] Alertas: tempo resposta > 1s, erro rate > 1%
- [ ] Dashboard Grafana/DataDog (futuro)

**Arquivo:**
- `src/server/observability/health.ts` (novo)

---

### 📚 PRIORIDADE 17: DOCUMENTAÇÃO TÉCNICA
**Objetivo**: Arquitetura, fluxos, billing, permissões, estoque, integrações

**O quê criar:**
- [ ] `ARCHITECTURE.md` — Visão de alto nível
- [ ] `BILLING.md` — Fluxo de pagamento, Stripe, webhooks
- [ ] `PERMISSIONS.md` — Roles, planos, entitlements
- [ ] `INVENTORY.md` — Modelo de estoque, movimentos
- [ ] `INTEGRATIONS.md` — APIs externas, webhooks
- [ ] `DATABASE.md` — Schema, índices, constraints
- [ ] `DEPLOYMENT.md` — How to deploy, env vars, migrations

---

## VALIDAÇÃO FINAL

### Checklist Geral

#### ✅ Autenticação
- [ ] Login funciona
- [ ] Logout funciona
- [ ] Recuperação de senha funciona
- [ ] Troca de senha funciona
- [ ] Sessão expira corretamente
- [ ] Permissões OWNER/MANAGER/COURIER funcionam

#### ✅ Multi-tenant
- [ ] Loja A não acessa dados de Loja B
- [ ] APIs ignoram IDs manipulados
- [ ] Todas as queries usam `storeId`
- [ ] Logging inclui `storeId`

#### ✅ Billing/Stripe
- [ ] Cadastro de customer funciona
- [ ] Subscription cria corretamente
- [ ] Trial respeita 14 dias
- [ ] Upgrade imediato com proration
- [ ] Downgrade agendado para próximo ciclo
- [ ] Cancelamentos funcionam
- [ ] Pagamentos aprovados/recusados rastreados
- [ ] Banco atualiza via webhooks (não manual)
- [ ] Estados: TRIAL, ACTIVE, PAST_DUE, CANCELED corretos

#### ✅ Entitlements
- [ ] Limites de plano respeitados (max_produtos, etc)
- [ ] Bloqueios funcionam no backend
- [ ] Front não consegue bypass

#### ✅ Produtos
- [ ] CRUD funciona
- [ ] Categorias funcionam
- [ ] Tamanhos funcionam
- [ ] Adicionais funcionam
- [ ] Promoções funcionam
- [ ] Cupons funcionam

#### ✅ Pedidos
- [ ] Pedido simples
- [ ] Pedido com adicionais
- [ ] Meia pizza
- [ ] Cupom se aplica corretamente
- [ ] Benefício se aplica corretamente
- [ ] Cancelamento funciona
- [ ] Entrega rastreada

#### ✅ Estoque
- [ ] Entrada registra corretamente
- [ ] Consumo reduz saldo
- [ ] Ajuste funciona
- [ ] Perda registra
- [ ] Transferência funciona
- [ ] Reversão desfaz movimento
- [ ] Saldo final correto

---

## USER ACCEPTANCE TESTS (UAT)

### 📱 Cenário 1: Cliente do Restaurante

**Fluxo:**
1. Acessar QR Code da mesa OU link público
2. Conferir carregamento da vitrine
3. Navegar cardápio
4. Adicionar produtos
5. Escolher tamanhos e adicionais
6. Aplicar cupom
7. Ir ao checkout
8. Preencher dados
9. Confirmar pedido
10. Ver confirmação

**Validação:**
- [ ] Página carrega em < 2s
- [ ] Cardápio mostra corretamente
- [ ] Preços corretos
- [ ] Cupom desconta
- [ ] Pedido aparece no painel admin
- [ ] Cliente recebe link de rastreamento
- [ ] Rastreamento mostra status em tempo real

**Nota sobre UX:**
- Clareza das mensagens
- Número de cliques
- Responsividade mobile

---

### 🏪 Cenário 2: Dono do Estabelecimento

**Fluxo:**
1. Criar conta
2. Configurar loja
3. Definir horários
4. Definir taxa de entrega
5. Uploadar logo
6. Criar cardápio completo
7. Definir promoções
8. Gerenciar entregadores
9. Visualizar dashboard
10. Processar pagamentos
11. Upgrade de plano
12. Cancelar assinatura

**Validação:**
- [ ] Setup inicial intuitivo
- [ ] Cardápio organizado
- [ ] Dashboard com KPIs úteis
- [ ] Upgrade/downgrade funcionam
- [ ] Relatórios acessíveis
- [ ] Performance aceitável

---

### 👤 Cenário 3: Funcionário

**Fluxo:**
1. Login com PIN
2. Ver permissões
3. Verificar benefícios
4. Fazer pedido com desconto
5. Conferir restrições de acesso
6. Tentar acessar áreas bloqueadas

**Validação:**
- [ ] PIN funciona
- [ ] Desconto se aplica
- [ ] Cota diária respeita
- [ ] Áreas bloqueadas realmente estão bloqueadas

---

### 🚚 Cenário 4: Entregador

**Fluxo:**
1. Login com convite
2. Ver lista de entregas
3. Aceitar entrega
4. Atualizar localização (GPS)
5. Marcar como entregue
6. Ver histórico

**Validação:**
- [ ] Login funciona
- [ ] Lista de entregas precisa
- [ ] GPS funciona
- [ ] Notificações enviadas

---

## TESTE DE REGRESSÃO

**Repetir fluxos:**
- [ ] Pedido simples (delivery + pickup)
- [ ] Pedido com cupom
- [ ] Pedido de funcionário com benefício
- [ ] Pedido de mesa (dine-in)
- [ ] Cadastro de produto novo
- [ ] Edição de preço
- [ ] Movimento de estoque
- [ ] Promoções
- [ ] Upgrade/downgrade de plano
- [ ] Login em painel
- [ ] Entrega rastreada
- [ ] QR Code de mesa

---

## RELATÓRIO FINAL DE QUALIDADE

### Formato Esperado

```
# RELATÓRIO DE QUALIDADE - VELNOXIA APP
Data: 2026-XX-XX
Período: [inicio] - [fim]

## RESUMO EXECUTIVO
- Total de testes executados: XX
- Taxa de sucesso: XX%
- Bugs encontrados: XX
- Bugs críticos: X
- Bugs altos: XX
- Bugs médios: XX

## BUGS ENCONTRADOS

### Crítico: [Bug Title]
- Passos para reproduzir:
  1. ...
  2. ...
- Resultado esperado: ...
- Resultado obtido: ...
- Arquivo(s) envolvido(s): ...
- Correção aplicada: ...
- Status: FIXADO / PENDENTE

## SCORE DE UX (0-10)

| Aspecto | Score | Comentário |
|---------|-------|-----------|
| Facilidade de uso | X/10 | ... |
| Clareza | X/10 | ... |
| Performance | X/10 | ... |
| Organização das telas | X/10 | ... |
| Fluxo de pedidos | X/10 | ... |
| Painel administrativo | X/10 | ... |
| Consistência visual | X/10 | ... |
| Mobile | X/10 | ... |
| Desktop | X/10 | ... |

## RECOMENDAÇÕES PRÁTICAS

- [ ] Recomendação 1
- [ ] Recomendação 2
- [ ] Recomendação 3

## STATUS FINAL
✅ APROVADO / ⚠️ APROVADO COM RESSALVAS / ❌ REPROVADO
```

---

## RELATÓRIO DE CONCLUSÃO

### Formato Esperado

```markdown
# RELATÓRIO DE CONCLUSÃO - IMPLEMENTAÇÃO ROADMAP

Data: 2026-XX-XX

## RESUMO DAS MUDANÇAS

### Prioridades Implementadas
- [x] Prioridade 1: Billing
- [x] Prioridade 2: Entitlements
- ...

### Prioridades Pendentes
- [ ] Prioridade 14: API Pública
- [ ] Prioridade 15: Performance

## LISTA DE ARQUIVOS MODIFICADOS/CRIADOS

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `src/server/billing/webhook-handler.ts` | CRIADO | Novo handler centralizado |
| `src/server/services/authorization-service.ts` | CRIADO | Autorização centralizada |
| `prisma/schema.prisma` | MODIFICADO | Novos campos, índices |

## MIGRATIONS CRIADAS

- `20260825_add_audit_log.sql`
- `20260825_add_soft_delete.sql`
- `20260825_add_indexes.sql`

## NOVAS TABELAS

- `AuditLog`
- `EntitlementPlan`
- `TableReservation`

## APIS/SERVER FUNCTIONS ADICIONADAS

- `listAuditLogFn`
- `getEntitlementsFn`
- `validateAuthorizationFn`

## TESTES EXECUTADOS

| Tipo | Qtd | Status |
|------|-----|--------|
| Unitários | XX | ✅ XX passed |
| Integração | XX | ✅ XX passed |
| E2E | XX | ✅ XX passed |

## CORREÇÕES APLICADAS

- [x] Billing webhook race condition
- [x] Multi-tenant query injection risk
- [x] Float precision em preços

## PENDÊNCIAS REMANESCENTES

- [ ] API pública (Prioridade 14)
- [ ] Redis distribuído (Prioridade 9 parcial)

## CONCLUSÃO

✅ Sistema pronto para produção com todas as Prioridades 1-8 implementadas.
```

---

## COMO USAR ESTE ROADMAP

1. **Leia as 17 Prioridades** — Entenda o objetivo de cada uma
2. **Comece pelas Críticas** — Billing (1), Entitlements (2), Multi-tenant (3)
3. **Siga a ordem** — Cada prioridade pode depender da anterior
4. **Documente progresso** — Atualize este arquivo conforme avança
5. **Execute UAT** — Após cada prioridade, validate com usuários reais
6. **Finalize com relatório** — Documente tudo antes de declarar concluído

---

**Criado**: 2026-08-24  
**Próxima revisão**: Após Prioridade 8  
**Mantido por**: João Victor (Tech Lead)
