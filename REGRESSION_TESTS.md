# Testes de Regressão - Velnoxia APP

**Versão:** Prioridades 1-5 (Billing, Entitlements, Multi-tenant, Money, Tests)  
**Data:** 2026-08-24  
**Escopo:** Fluxos críticos que não devem quebrar com novas alterações

---

## 1. Checkout e Cálculo de Preços

### ✓ Teste 1.1: Checkout simples (1 pizza)
- [ ] Ir para cardápio
- [ ] Selecionar 1 pizza de R$ 35,00
- [ ] Ir ao checkout
- [ ] Verificar: `Subtotal: R$ 35,00`
- [ ] Verificar: `Total: R$ 35,00`
- [ ] Pagar com PIX
- [ ] Pedido criado com sucesso

### ✓ Teste 1.2: Meia-pizza (HIGHEST_PRICE)
- [ ] Selecionar pizza de R$ 50,00
- [ ] Ativar meia-pizza
- [ ] Escolher segunda pizza de R$ 45,00
- [ ] Ir ao checkout
- [ ] Verificar: `Subtotal: R$ 50,00` (maior preço)
- [ ] Pagar
- [ ] Validar no Kanban: linhas com `isHalfAndHalf: true`

### ✓ Teste 1.3: Meia-pizza (AVERAGE_PRICE)
- [ ] Selecionar pizza de R$ 50,00 (com AVERAGE_PRICE ativado)
- [ ] Ativar meia-pizza
- [ ] Escolher segunda pizza de R$ 45,00
- [ ] Ir ao checkout
- [ ] Verificar: `Subtotal: R$ 47,50` ((50+45)/2)
- [ ] Pagar
- [ ] Precisão de cálculo validada

### ✓ Teste 1.4: Desconto de cupom (percentual)
- [ ] Criar cupom: 10% de desconto
- [ ] Pedido com subtotal R$ 100,00
- [ ] Aplicar cupom
- [ ] Verificar: `Desconto: R$ 10,00`
- [ ] Verificar: `Total: R$ 90,00`

### ✓ Teste 1.5: Desconto de cupom (valor fixo)
- [ ] Criar cupom: R$ 15,00 de desconto fixo
- [ ] Pedido com subtotal R$ 50,00
- [ ] Aplicar cupom
- [ ] Verificar: `Desconto: R$ 15,00`
- [ ] Verificar: `Total: R$ 35,00`

### ✓ Teste 1.6: Taxa de entrega
- [ ] Configurar taxa: R$ 5,50
- [ ] Pedido delivery com subtotal R$ 40,00
- [ ] Ir ao checkout
- [ ] Verificar: `Taxa de entrega: R$ 5,50`
- [ ] Verificar: `Total: R$ 45,50`

### ✓ Teste 1.7: Frete grátis acima de R$ 100
- [ ] Configurar frete grátis a partir de R$ 100
- [ ] Pedido com R$ 120
- [ ] Ir ao checkout
- [ ] Verificar: `Taxa de entrega: R$ 0,00`
- [ ] Pedido com R$ 80
- [ ] Ir ao checkout
- [ ] Verificar: `Taxa de entrega: R$ 5,50`

### ✓ Teste 1.8: Adicionais (extras)
- [ ] Pizza com 2 extras: Bacon (+R$ 4,50) e Queijo (+R$ 3,00)
- [ ] Ir ao checkout
- [ ] Verificar: `Subtotal: R$ 42,50` (35+4.50+3.00)

### ✓ Teste 1.9: Quantidade > 1
- [ ] Selecionar 3x mesma pizza (R$ 30 cada)
- [ ] Ir ao checkout
- [ ] Verificar: `Subtotal: R$ 90,00` (30*3)

---

## 2. Autenticação de Mesa (PIN/QR)

### ✓ Teste 2.1: Primeira mesa (sem PIN)
- [ ] Escanear QR da mesa (ex: Mesa 1)
- [ ] Página abre diretamente (SEM pedir PIN)
- [ ] Cardápio disponível
- [ ] Fazer pedido
- [ ] Pedido vinculado a `tableId`

### ✓ Teste 2.2: Segundo dispositivo na mesma mesa
- [ ] Em outro celular, escanear QR de Mesa 1
- [ ] Tela pede PIN de 4 dígitos
- [ ] Inserir PIN correto
- [ ] Cardápio abre
- [ ] Fazer pedido diferente
- [ ] Ambos pedidos no Kanban com `sessionId` igual

### ✓ Teste 2.3: PIN incorreto 3x = bloqueio
- [ ] Escanear QR
- [ ] Inserir PIN errado 3x
- [ ] Sistema bloqueia por 5 min
- [ ] Mensagem: "Muitas tentativas. Tente novamente em 5 minutos"
- [ ] Após 5 min, libera

### ✓ Teste 2.4: Sessão expira após 24h
- [ ] Escanear QR em dia 1 (10h)
- [ ] Deixar até dia 2 (14h)
- [ ] Tentar fazer pedido
- [ ] Erro: "Sessão expirada. Escaneie o QR novamente"
- [ ] QR ainda funciona = nova sessão criada

### ✓ Teste 2.5: Mesa com pedido ativo
- [ ] Fazer 1º pedido da Mesa 2
- [ ] Em outro dispositivo, escanear Mesa 2
- [ ] Sistema encontra sessão existente
- [ ] Pede PIN (2º device)
- [ ] Pagar

---

## 3. Desconto de Funcionário

### ✓ Teste 3.1: Funcionário com desconto percentual
- [ ] Funcionário cadastrado: "João", Plano "Cozinha" (20% desc)
- [ ] Telefone: (11) 99999-0001, PIN: 1234
- [ ] No checkout: ativar "Sou funcionário"
- [ ] Inserir telefone + PIN
- [ ] Pedido de R$ 100
- [ ] Verificar: `Desconto de funcionário: R$ 20,00`
- [ ] Verificar: `Total: R$ 80,00`

### ✓ Teste 3.2: Funcionário com limite diário
- [ ] Plano: 30% desc, máximo R$ 50/dia
- [ ] 1º pedido: R$ 100 → desconto R$ 30 (OK)
- [ ] 2º pedido: R$ 100 → desconto R$ 20 (para atingir limite)
- [ ] 3º pedido: R$ 100 → sem desconto (limite esgotado)

### ✓ Teste 3.3: Desconto em folha (PAYROLL)
- [ ] Plano autoriza desconto em folha
- [ ] No checkout, apareça opção "Desconto em folha"
- [ ] Selecionar
- [ ] Pedido fica PENDING (não pago)
- [ ] No fim do mês, descontar do salário

### ✓ Teste 3.4: Não acumula cupom + funcionário
- [ ] Funcionário com desconto 20%
- [ ] Tentar aplicar cupom de 10%
- [ ] Erro: "Já tem desconto de funcionário"
- [ ] Impede acúmulo

---

## 4. Entitlements e Limites de Plano

### ✓ Teste 4.1: TRIAL - limite 50 produtos
- [ ] Criar loja em TRIAL
- [ ] Tentar adicionar 51º produto
- [ ] Erro: "Limite de 50 produtos atingido"

### ✓ Teste 4.2: TRIAL sem estoque
- [ ] No painel de estoque, apareça: "Estoque não disponível neste plano"

### ✓ Teste 4.3: TRIAL sem API pública
- [ ] Na aba de API, apareça: "API pública não disponível neste plano"

### ✓ Teste 4.4: Upgrade TRIAL → STARTER
- [ ] Loja em TRIAL
- [ ] Cliar em "Upgrade para Starter"
- [ ] Ir para Stripe
- [ ] Pagar
- [ ] Webhook recebido
- [ ] Loja muda para ACTIVE
- [ ] Agora pode adicionar mais produtos

### ✓ Teste 4.5: Downgrade BUSINESS → STARTER
- [ ] Loja em BUSINESS com estoque ativado
- [ ] Fazer downgrade
- [ ] Status muda para ACTIVE
- [ ] Estoque fica desativado
- [ ] Aviso: "Estoque desativado no novo plano"

---

## 5. Segurança Multi-tenant

### ✓ Teste 5.1: Admin de Loja A não vê Loja B
- [ ] Admin de pizzaria "Pizza A" logged in
- [ ] Tentar acessar `/admin/pizza-b/pedidos`
- [ ] Erro 403: "Não autorizado"
- [ ] Ou redireciona para próprio painel

### ✓ Teste 5.2: Pedidos isolados por loja
- [ ] Fazer pedido em "Pizza A"
- [ ] No painel de "Pizza B"
- [ ] Pedido NÃO aparece

### ✓ Teste 5.3: Cupom isolado por loja
- [ ] Criar cupom em "Pizza A"
- [ ] Ir ao checkout de "Pizza B"
- [ ] Cupom NÃO vale
- [ ] Erro: "Cupom inválido"

### ✓ Teste 5.4: Funcionário isolado por loja
- [ ] Funcionário "João" em "Pizza A"
- [ ] Ir ao checkout de "Pizza B" public
- [ ] Inserir PIN de João
- [ ] Erro: "Telefone ou PIN não confere"

---

## 6. Webhook de Stripe (Billing)

### ✓ Teste 6.1: Primeira compra = subscription criada
- [ ] Novo usuário faz checkout
- [ ] Stripe webhook: `checkout.session.completed`
- [ ] Banco recebe: `stripeSubscriptionId`, status `ACTIVE`
- [ ] Loja pode fazer pedidos

### ✓ Teste 6.2: Renovação = status mantém ACTIVE
- [ ] Loja com subscription ativa
- [ ] Data de renovação chega
- [ ] Stripe webhook: `invoice.payment_succeeded`
- [ ] Banco recebe: `paidUntil` atualizado
- [ ] Loja continua ACTIVE

### ✓ Teste 6.3: Pagamento falhou = status PAST_DUE
- [ ] Cartão recusado
- [ ] Stripe webhook: `invoice.payment_failed`
- [ ] Banco recebe: `subscriptionStatus: past_due`
- [ ] Painel mostra aviso amarelo: "Pagamento pendente"
- [ ] Loja continua funcionando (graça)

### ✓ Teste 6.4: Cancelamento = status SUSPENDED
- [ ] Admin clica "Cancelar assinatura"
- [ ] Stripe webhook: `customer.subscription.deleted`
- [ ] Banco recebe: status `SUSPENDED`
- [ ] Loja não pode fazer pedidos
- [ ] Mensagem: "Assinatura expirada"

### ✓ Teste 6.5: Idempotência de webhook
- [ ] Mesmo evento Stripe é entregue 2x
- [ ] Banco processa 1ª vez: cria registro
- [ ] Banco processa 2ª vez: vê `StripeWebhookEvent` existente, ignora
- [ ] Sem duplicação de efeito

---

## 7. Kanban e Histórico de Pedidos

### ✓ Teste 7.1: Data correta no Kanban
- [ ] Fazer pedido hoje (2026-08-24)
- [ ] Kanban mostra na coluna correta: "24/08" (não 23/08)
- [ ] Bug anterior: timezone errado

### ✓ Teste 7.2: Pedido de mesa vs público
- [ ] Pedido via QR de mesa: mostra "MESA 2" + Nome
- [ ] Pedido via public QR: mostra "Nome" (sem MESA)
- [ ] Bug anterior: ambos mostravam MESA

### ✓ Teste 7.3: Status transitions válidas
- [ ] RECEIVED → PREPARING ✓
- [ ] RECEIVED → CANCELLED ✓
- [ ] PREPARING → TABLE_READY ✓ (só mesa)
- [ ] PREPARING → OUT_FOR_DELIVERY ✓ (só delivery com courier)
- [ ] PICKUP → OUT_FOR_DELIVERY ✗ Erro

---

## 8. Erros de Precisão (Float vs Decimal)

### ✓ Teste 8.1: 0.1 + 0.2 = 0.3
- [ ] Criar 2 adicionais: R$ 0.10 + R$ 0.20
- [ ] Total: R$ 0.30 (não 0.30000000000000004)

### ✓ Teste 8.2: Desconto 5% em R$ 99.99
- [ ] Pedido de R$ 99.99
- [ ] Cupom 5%
- [ ] Desconto: R$ 4.99 (não 4.999499999999999)
- [ ] Total: R$ 95.00

### ✓ Teste 8.3: Arredondamento em cálculos de meia-pizza
- [ ] Pizza 1: R$ 99.99
- [ ] Pizza 2: R$ 99.99
- [ ] AVERAGE_PRICE: (99.99+99.99)/2 = 99.99 ✓

---

## 9. Performance e Limites

### ✓ Teste 9.1: 100+ itens no carrinho
- [ ] Adicionar 100 pizzas
- [ ] Checkout não trava
- [ ] Cálculo de subtotal rápido (< 1s)

### ✓ Teste 9.2: Cupom com 1000+ usos
- [ ] Cupom já usado 1000 vezes
- [ ] Verificação de `usageCount` rápida
- [ ] Sem N+1 queries

### ✓ Teste 9.3: 50+ funcionários
- [ ] Loja com 50 funcionários
- [ ] Filtro por telefone rápido
- [ ] Sem timeout

---

## 10. Fluxos End-to-End

### ✓ Cenário E2E 1: Cliente visita loja
1. [ ] Cliente acessa `.velnox.app/pizza-bella`
2. [ ] Cardápio carrega
3. [ ] Adiciona 2 pizzas + 1 adicional
4. [ ] Aplica cupom (10%)
5. [ ] Paga com PIX
6. [ ] Confirmação de pedido
7. [ ] Link de acompanhamento funciona
8. [ ] Painel recebe notificação

### ✓ Cenário E2E 2: Funcionário pede com desconto
1. [ ] Funcionário escaneia QR da mesa
2. [ ] Faz pedido de R$ 80
3. [ ] Ativa "Sou funcionário" + insere PIN
4. [ ] Desconto 30% aplicado: R$ 56
5. [ ] Paga com desconto em folha
6. [ ] Painel mostra benefício no pedido
7. [ ] Cota do dia atualiza

### ✓ Cenário E2E 3: Admin faz upgrade de plano
1. [ ] Admin de loja TRIAL
2. [ ] Clica "Upgrade para STARTER"
3. [ ] Vai para Stripe
4. [ ] Preenche cartão
5. [ ] Volta para painel
6. [ ] Loja agora ACTIVE
7. [ ] Estoque disponível
8. [ ] Pode adicionar 101º produto

---

## Checklist de Deployment

- [ ] Todos os testes acima passaram
- [ ] Sem warnings em `npm run build`
- [ ] TypeScript sem erros
- [ ] Database migrations aplicadas
- [ ] Variáveis de ambiente configuradas (STRIPE_SECRET, etc)
- [ ] Stripe webhooks apontando para novo ambiente
- [ ] Backup do banco feito
- [ ] Rollback plan documentado
- [ ] Equipe notificada
- [ ] Deploy feito em horário de baixo uso

---

## Notas

- Cada teste deve ser documentado com print/vídeo para auditoria
- Testar em browsers múltiplos: Chrome, Safari, Firefox
- Testar em dispositivos: desktop, tablet, mobile
- Rate limiting de PIN é importante: testar com 3 tentativas
- Webhooks podem ter delay até 30s; aguardar e retry 3x

