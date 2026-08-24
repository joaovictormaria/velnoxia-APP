# AUDITORIA COMPLETA - VELNOXIA APP

**Data da Auditoria**: 2026-08-24  
**Versão do Sistema**: Produção ativa  
**Gerado por**: Claude Code Audit v1

---

## 1. VISÃO GERAL DO SISTEMA

**VELNOXIA** é uma plataforma SaaS completa de gestão de restaurantes/lanchonetes com sistema de entrega. Permite que donos de pizzarias, hamburguerias e outros estabelecimentos gerenciem seu cardápio, pedidos, entregas, funcionários e pagamentos de forma integrada.

### Propósito Principal
- Fornecer um painel administrativo completo para restaurantes
- Oferecer uma vitrine de cardápio online para clientes
- Gerenciar entregas com rastreamento em tempo real
- Controlar estoque, benefícios de funcionários e relatórios financeiros
- Sistema de mesas com QRCode para pedidos locais (dine-in)

### Modelo de Negócio
- Plataforma SaaS com período de teste de 14 dias (TRIAL)
- Pagamento recorrente via Stripe após trial
- Suporta múltiplas lojas (multi-tenant)
- Cada loja tem seu próprio slug e URL única (ex: velnox.app/pizzaria-nome-1a2b)

---

## 2. STACK TECNOLÓGICO

### Frontend
- **Framework**: React 19.2.8
- **Roteamento**: TanStack React Router 1.170.25
- **Estado Global**: TanStack React Query 5.101.4
- **Formulários**: React Hook Form 7.85.0
- **Validação**: Zod 4.4.3
- **UI Components**: Radix UI (completo - dialogs, dropdowns, etc)
- **Styling**: Tailwind CSS 4.3.3 + Class Variance Authority
- **Ícones**: Lucide React 1.31.0
- **Carrossel**: Embla Carousel React 8.6.0
- **Notificações**: Sonner 2.0.8
- **Toast/Drawer**: Vaul 1.1.2
- **Código QR**: qrcode 1.5.4

### Backend
- **Framework**: TanStack React Start 1.168.46
- **Server Functions**: createServerFn (server-side logic)
- **ORM**: Prisma 7.9.1 + Adapter PostgreSQL
- **Database**: PostgreSQL
- **Autenticação**: bcryptjs 3.0.3 (password hashing)
- **Email**: Resend (envio de reset de senha)
- **Pagamento**: Stripe SDK 22.5.0
- **IA**: Anthropic SDK 0.116.0
- **Storage**: AWS S3 (R2 Cloudflare)
- **Server Runtime**: Node.js 24.x

### DevOps & Build
- **Build Tool**: Vite 8.2.1
- **TypeScript**: 5.9.3
- **Banco**: Railway (PostgreSQL addon)
- **Desktop**: Tauri 2.11.4 (opcional)
- **Image Processing**: Sharp 0.35.3

---

## 3. ARQUITETURA DE ALTO NÍVEL

```
FLUXO DE DADOS:

┌─────────────────────┐
│   Cliente (Browser) │
└──────────┬──────────┘
           │
      React Router + TanStack Query
           │
           ▼
┌──────────────────────────┐
│  React Components        │
│ - Vitrine (pizzaria2)    │
│ - Painel Admin           │
│ - Entregador             │
└──────────┬───────────────┘
           │
      Server Functions (createServerFn)
           │
           ▼
┌──────────────────────────┐
│  Server Layer            │
│ - functions/*.fn.ts      │
│ - auth/session.ts        │
│ - security/rate-limit.ts │
└──────────┬───────────────┘
           │
    ┌──────┴──────┬──────────┬─────────────┐
    ▼             ▼          ▼             ▼
 Repositories  Services  Database  External APIs
 - order-repo  - order-  Prisma   - Stripe
 - product-    service  Client    - Resend
   repo        - employee-        - Anthropic
 - inventory   benefit            - AWS S3
   etc         etc                - WhatsApp
```

### Componentes Principais

**Vitrine (Frontend Cliente)**
- `/` → Página inicial com hero, cardápio, promoções, avaliações
- `/cardapio` → Catálogo interativo de produtos
- `/produto/[slug]` → Detalhe do produto
- `/carrinho` → Carrinho de compras (localStorage)
- `/acompanhar/[token]` → Rastreamento público do pedido

**Painel Admin**
- `/admin/` → Dashboard com KPIs
- `/admin/pedidos` → Kanban de pedidos
- `/admin/cardapio` → Gerenciamento de categorias e produtos
- `/admin/mesas` → Gerenciamento de mesas com QRCode
- `/admin/funcionarios` → Cadastro de funcionários
- `/admin/entregadores` → Controle de couriers
- `/admin/estoque` → Inventário e movimentações
- `/admin/configuracoes` → Dados da loja

**App do Entregador**
- `/entregador/entrar` → Login com convite
- Tela de entregas com mapa e GPS

---

## 4. ESTRUTURA DE PASTAS

```
velnoxia-APP/
├── src/
│   ├── components/              # Componentes React
│   │   ├── admin/               # Painel administrativo
│   │   ├── site/                # Vitrine (front-end cliente)
│   │   └── ui/                  # Componentes base (Radix UI)
│   │
│   ├── server/
│   │   ├── auth/                # Autenticação
│   │   ├── functions/           # Server Functions (40+)
│   │   ├── repositories/        # Acesso aos dados
│   │   ├── services/            # Lógica de negócio
│   │   ├── billing/             # Stripe
│   │   ├── security/            # Rate limiting
│   │   ├── mail/                # Email
│   │   ├── db/                  # Prisma Client
│   │   └── utils/
│   │
│   ├── routes/                  # TanStack Router
│   │   ├── $storeSlug/          # Vitrine pública
│   │   ├── admin/               # Painel admin (protegido)
│   │   ├── entregador/          # App do courier
│   │   └── api/
│   │
│   ├── lib/                     # Utilitários e helpers
│   │   ├── pizzaria2/           # Lógica específica
│   │   └── ...
│   │
│   ├── hooks/                   # React Hooks customizados
│   ├── assets/                  # Imagens, fontes
│   └── app.tsx                  # Root component
│
├── prisma/
│   ├── schema.prisma            # Modelo de dados
│   ├── migrations/              # Histórico de alterações
│   └── seeds/                   # Dados iniciais
│
└── ...
```

---

## 5. MODELOS DE DADOS

### Tabelas Principais

#### Order
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | String (cuid) | ID do pedido |
| number | Int | Número sequencial por loja |
| storeId | String | FK para Store |
| customerId | String | FK para Customer |
| customerName | String | Nome do cliente |
| type | Enum | DELIVERY / PICKUP |
| status | Enum | RECEIVED → PREPARING → COMPLETED |
| paymentMethod | Enum | PIX / CREDIT_CARD / DEBIT_CARD / CASH / PAYROLL |
| paymentStatus | Enum | PENDING / PAID |
| subtotal | Float | Soma dos itens |
| deliveryFee | Float | Taxa de entrega |
| discount | Float | Desconto |
| total | Float | subtotal + entrega - desconto |
| sessionId | String | FK para TableSession (dine-in) |
| deviceId | String | FK para SessionDevice |
| createdAt | DateTime | Timestamp UTC |

#### Product
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | String | ID único |
| storeId | String | FK para Store |
| name | String | Nome do produto |
| slug | String | URL-friendly |
| basePrice | Float | Preço base |
| categoryId | String | FK para Category |
| allowHalfAndHalf | Boolean | Permite meia a meia |
| isActive | Boolean | Publicado ou não |

#### TableSession
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | String | ID da sessão |
| storeId | String | FK para Store |
| tableId | String | FK para Table |
| pinHash | String | Hash do PIN (4 dígitos) |
| status | Enum | OPEN / PAID / CLOSED / CANCELLED |
| expiresAt | DateTime | Auto-expira em 24h |

#### Employee
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | String | ID único |
| storeId | String | FK para Store |
| name | String | Nome do funcionário |
| phone | String | Telefone (chave) |
| pinHash | String | Hash do PIN (4 dígitos) |
| planId | String | FK para EmployeeBenefitPlan |

#### InventoryItem
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | String | ID único |
| storeId | String | FK para Store |
| name | String | Nome do insumo |
| sku | String | Código único |
| itemType | String | INGREDIENT / RESALE / PRODUCED |
| quantityOnHand | Decimal | Estoque atual (DERIVADO) |
| cost | Decimal | Preço de custo |

---

## 6. FUNCIONALIDADES PRINCIPAIS

### Módulo de Pedidos
✅ Criar pedido com checkout completo  
✅ Validação de preços, tamanhos, opções  
✅ Formas de entrega: DELIVERY e PICKUP  
✅ Formas de pagamento: PIX, Cartão, Dinheiro, Desconto em Folha  
✅ Rastreamento público com token único  
✅ Cupons com desconto  
✅ Histórico de status imutável

### Módulo de Cardápio
✅ Categorias com ícones e tamanhos  
✅ Produtos com preços variáveis  
✅ Opções dinâmicas (sabor, ponto da carne, etc)  
✅ Adicionais com escopo  
✅ Meia a Meia para pizzas  
✅ Ativação/desativação

### Módulo de Mesas (Dine-in)
✅ Cadastro de mesas com número e capacidade  
✅ QRCode permanente (ID nunca muda)  
✅ Sessão com PIN de 4 dígitos  
✅ Múltiplos dispositivos por mesa  
✅ Vencimento automático em 24h  
✅ Dashboard de mesas abertas

### Módulo de Funcionários
✅ Cadastro com telefone + PIN  
✅ Planos de benefício flexíveis  
✅ Cota diária (itens ou reais)  
✅ Reconhecimento no checkout  
✅ Desconto em folha (PAYROLL)  
✅ Relatório de uso mensal

### Módulo de Entregas
✅ Contas de courier (invite-only)  
✅ Tela de entregador com suas entregas  
✅ Rastreamento de GPS  
✅ Marcação de entregue

### Módulo de Estoque (FASE 1)
✅ Cadastro de itens com unidades customizáveis  
✅ Movimentos imutáveis (PURCHASE, CONSUMPTION, etc)  
✅ Saldo derivado (calculado do histórico)  
✅ Fichas técnicas (receitas versionadas)  
✅ Alertas de estoque baixo

### Módulo de Assinatura
✅ Trial de 14 dias  
✅ Pagamento via Stripe (checkout)  
✅ Portal de gerenciamento  
✅ Webhooks de Stripe  
✅ Suspensão automática após vencimento

---

## 7. FLUXOS DE NEGÓCIO PRINCIPAIS

### Fluxo de Pedido (Entrega)
1. Cliente acessa vitrine → monta carrinho
2. Checkout com dados, endereço, cupom
3. Precificação no servidor (nunca confia cliente)
4. Criar pedido com transação
5. Painel admin vê em Kanban ao vivo
6. Admin muda status: RECEIVED → PREPARING
7. Atribui entregador → OUT_FOR_DELIVERY
8. Courier entrega e marca COMPLETED

### Fluxo de Mesa (Dine-in)
1. Cliente escaneia QR da mesa → `/qr/slug/tableId`
2. Sistema cria/obtém sessão com PIN
3. Primeiro dispositivo entra automático
4. Demais precisam do PIN de 4 dígitos
5. Ordenar no cardápio (mesmo checkout)
6. Painel admin vê mesas abertas
7. Garçom marca como PAID → CLOSED

### Fluxo de Funcionário (Desconto)
1. Digita telefone + PIN no checkout
2. Sistema valida e calcula desconto
3. Deduz da cota diária
4. Registra no pedido quantidade economizada
5. Admin vê relatório de uso mensal

---

## 8. SEGURANÇA

### Autenticação
- **Admin**: Email + Senha (bcryptjs)
- **Courier**: Convite + Senha
- **Funcionário**: Telefone + PIN
- **Cliente**: Token único para tracking
- **Session**: Cookie seguro com versionamento (força logout ao trocar senha)

### Rate Limiting
- Login: 5 tentativas / 60s
- PIN: 3 tentativas / 5 min
- Checkout: 8 pedidos / minuto

### Proteção de Dados
- Senhas: bcryptjs hash
- PINs: bcryptjs hash
- Cartões: Nunca toca servidor (Stripe)
- Device Tokens: Hasheados
- Cookies: Encrypted

### Validação
- Schemas Zod em todas inputs
- Preços sempre relidos do banco
- Scope por storeId (multi-tenant isolation)

---

## 9. INTEGRAÇÕES EXTERNAS

| Serviço | Função | Status |
|---------|--------|--------|
| **Stripe** | Pagamento recorrente | ✅ Ativo |
| **Resend** | Email (reset password) | ✅ Ativo |
| **AWS S3 / R2** | Upload de imagens | ✅ Ativo |
| **Anthropic** | Geração com IA | ⏳ Futuro |
| **WhatsApp** | Notificações | ⏳ Parcial |
| **Google Maps** | Geolocalização | ⏳ Futuro |

---

## 10. PENDÊNCIAS CONHECIDAS

### Features Grandes Não Implementadas
- [ ] Integração WhatsApp em Produção
- [ ] Geração de Site com IA
- [ ] Google Maps / Geolocalização
- [ ] Avaliações do Google & Meta
- [ ] Cupons Automáticos
- [ ] Controle de Produção (FASE 2)

### Bugs Conhecidos
- Rate limiting só funciona em single-instance (memória)
- Alguns pontos podem ter problemas com timezone
- Não há soft delete (hard delete apenas)
- Sem notificações push
- Sem testes E2E ou carga

### Performance
- [ ] Paginação em listas grandes
- [ ] Caching de Menu
- [ ] Compressão de imagens
- [ ] Índices no banco para grandes volumes

---

## 11. COMO ESTENDER O SISTEMA

### Adicionar Nova Feature
1. Criar Server Function em `src/server/functions/`
2. Criar Repository em `src/server/repositories/` (se needed)
3. Criar Service em `src/server/services/` (se needed)
4. Chamar do Cliente via `useQuery`/`useMutation`
5. Adicionar Rota em `src/routes/`

### Adicionar Novo Modelo
1. Atualizar Prisma Schema
2. Rodar `npm run db:migrate`
3. Criar Repository/Service/Function

---

## 12. ROADMAP FUTURO

### Fase 2 (Próxima)
- Integração WhatsApp ativa
- Geração de site com IA
- Google Maps integration
- Sistema de cupons automáticos

### Fase 3
- App mobile nativa (React Native)
- Push notifications
- Integração com plataformas (iFood, Uber Eats)
- Soft delete + audit log

### Fase 4
- Machine Learning (previsão de demanda)
- Promoções dinâmicas
- Sistema de feedstock
- Fiscal (nota fiscal eletrônica)

---

## 13. CONTATO E SUPORTE

**Dúvidas sobre o código?**  
Use os comments no GitHub ou consulte a documentação Prisma em `prisma/schema.prisma`

**Bugs ou Problemas?**  
Abra uma issue com descrição clara e steps para reproduzir

**Novas features?**  
Faça uma discussion antes de começar a implementar

---

*Documento gerado automaticamente com Claude Code Audit v1*  
*Última atualização: 2026-08-24*
