# WAVE 3 — STARTUP CONTEXT

**Data de início:** 2026-08-24 (WAVE 2 concluída)  
**Branch:** `develop` (pronto para WAVE 3)  
**Commit anterior:** `3489a18` WAVE 2: Hardening + Decimal foundation

---

## ✅ STATUS WAVE 2 (CHECKPOINT)

```
CONCLUÍDA EM: 2026-08-24 (~2h)
COMMITS:
- 3489a18 WAVE 2: Hardening + Decimal foundation

RESULTADO:
✅ Decimal converter pattern established (extra-repository)
✅ Multi-tenant security breach CLOSED (composition-item-repository)
✅ Multi-tenant test created (comprehensive coverage)
✅ Stripe/billing validated (webhook + idempotency)
✅ Build: 1.46-1.50s (no regressions)
✅ TS errors: 733 → 732 (pattern-ready)
✅ Security: 🔒 IMPROVED (storeId validation added)
⏳ TS errors: 732 remaining (pattern-ready for bulk)
```

---

## 🎯 WAVE 3 OBJETIVO

**Fase 3-5,8-9 do Hardening (Protocol 22 fases total)**

### Tarefas WAVE 3:
1. **Batch Decimal converter** (2-3h)
   - Apply `Number(x.price) || 0` pattern to 50+ files
   - TS errors: 732 → 0
   - Build + verify
   - Focus on high-impact files first (server functions, repositories)

2. **E2E Testing Foundation** (2h)
   - Setup test environment
   - Create base fixtures for multi-store testing
   - Test cross-tenant boundaries

3. **Production Readiness** (1-2h)
   - Performance check (build time, bundle size)
   - Security audit (OWASP top 10)
   - Database migration validation

**Total WAVE 3:** ~6-7 horas

---

## 📁 ARQUIVOS CHAVE PARA WAVE 3

### De WAVE 2:
- ✅ `src/server/repositories/extra-repository.ts` (pattern reference)
- ✅ `src/server/repositories/composition-item-repository.ts` (storeId pattern)
- ✅ `src/server/repositories/__tests__/composition-item-multitenant.test.ts` (test reference)

### Novos para WAVE 3:
- `src/server/utils/decimal-converter.ts` (use this for batch conversions)
- Build profiling needed: `npm run build --profile`
- Test setup: `vitest.config.ts` (já configurado em WAVE 1)

---

## 🚀 ESTRATÉGIA WAVE 3

### Foco Prioritário:
1. **Top 5 arquivos com mais erros** (80+ TS errors)
   - `src/routes/admin/pedidos/$orderId.tsx` (80 erros)
   - `src/server/services/inventory-cost-service.ts` (57 erros)
   - Test files (36+ erros - lower priority)

2. **Batch pattern application**
   - Server functions (prioridade: categories, health, inventory-alerts)
   - Repositories (prioridade: order, product, inventory)
   - Components (última: admin interfaces)

3. **No manual fixes** - use automated find/replace + verification

---

## 📊 SUCCESS METRICS WAVE 3

```
TYPESCRIPT ERRORS:     732 → 0 ✅
SECURITY:              Multi-tenant ✅ + OWASP audit ✅
BUILD:                 < 2s ✅
NPM AUDIT:             0 vulns ✅
TESTS:                 E2E base setup ✅
PERFORMANCE:           Bundle < 1.5MB gzip ✅
STATUS:                🟡 → 🟢 (if complete)
```

---

## 📝 NOTAS IMPORTANTES

1. **Decimal converter validado:**
   ```typescript
   // Pattern comprovado:
   price: price != null ? Number(price) : undefined
   // Ou para campos obrigatórios:
   price: Number(price) || 0
   ```

2. **Priorizar arquivos com mais impacto:**
   - Servidor > Componentes
   - High-frequency paths > Admin screens

3. **Test primeiro, depois batch:**
   - Rodar build após cada arquivo crítico
   - Se quebrar, revert e investigar

4. **E2E testing base:**
   - Setup fixtures de multi-store
   - Test cross-tenant isolation
   - Não é full E2E, apenas foundation

---

**READY FOR WAVE 3. Comece com arquivo de maior impacto: $orderId.tsx (80 erros)**

---

## 💡 QUICK START WAVE 3

```bash
# 1. Verificar status
npm run build

# 2. Contar erros por arquivo
npx tsc --noEmit 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -5

# 3. Atacar top arquivo
# Edit src/routes/admin/pedidos/$orderId.tsx

# 4. Rebuild + verify
npm run build

# 5. Contar progresso
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

---

**WAVE 3 ESTIMATED TIME:** 6-7 horas até 🟢 PRODUCTION READY
