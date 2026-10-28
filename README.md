<p align="center">
  <img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,50:1a1b27,100:7aa2f7&height=200&section=header&text=Velnox%20APP&fontSize=46&fontColor=70a5fd&fontAlignY=36&desc=Gest%C3%A3o%20completa%20para%20pizzarias%20%E2%80%94%20do%20card%C3%A1pio%20ao%20caixa&descSize=16&descAlignY=56" alt="Velnox APP" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-1a1b27?style=for-the-badge&logo=typescript&logoColor=3178C6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-1a1b27?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TanStack_Start-1a1b27?style=for-the-badge&logo=reactquery&logoColor=FF4154" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Prisma-1a1b27?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-1a1b27?style=for-the-badge&logo=postgresql&logoColor=4169E1" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Stripe-1a1b27?style=for-the-badge&logo=stripe&logoColor=635BFF" alt="Stripe" />
  <img src="https://img.shields.io/badge/Tauri-1a1b27?style=for-the-badge&logo=tauri&logoColor=FFC131" alt="Tauri" />
  <img src="https://img.shields.io/badge/Vitest-1a1b27?style=for-the-badge&logo=vitest&logoColor=6E9F18" alt="Vitest" />
</p>

## 🍕 Sobre

O **Velnox APP** é uma plataforma **white-label** para pizzarias e restaurantes. Cada loja ganha cardápio digital, pedidos online, atendimento nas mesas por QR Code e um **painel administrativo** que cuida de tudo: pedidos, caixa, estoque, entregadores, funcionários e relatórios.

## ✨ Funcionalidades

### 🛒 Para o cliente
- Cardápio digital por loja, com tamanhos, extras e carrinho
- Pedido na mesa via **QR Code** com confirmação por PIN
- Acompanhamento do pedido em tempo real por link

### 🧑‍💼 Painel administrativo

| Módulo | Descrição |
|---|---|
| 📦 **Pedidos e Balcão (PDV)** | Recebimento de pedidos e frente de caixa |
| 📋 **Cardápio** | Produtos, categorias, tamanhos e extras |
| 🧮 **Estoque** | Insumos, fichas técnicas, conversão de unidades e controle de perdas |
| 🛵 **Entregadores** | Convite, app do entregador e localização |
| 👥 **Clientes e Funcionários** | Cadastro, planos de benefícios e desempenho |
| 🎟️ **Cupons e Promoções** | Campanhas de desconto |
| ⭐ **Avaliações** | Feedback dos clientes |
| 📊 **Relatórios** | Receita, produtos, perdas, recebimentos e KPIs |
| 🔐 **Auditoria** | Registro das ações importantes no sistema |
| 💳 **Assinatura** | Planos Basic e Premium via Stripe |

### 🤖 Extras
- **Criação de site com IA**: gera o site da loja a partir de uma análise do negócio
- **App desktop** com Tauri
- Upload de imagens com Cloudflare R2 e e-mails com Resend

## 🛠️ Tecnologias

| Camada | Stack |
|---|---|
| Front-end | React 19, TanStack Start/Router/Query, Radix UI, Tailwind |
| Back-end | Server functions (TanStack Start), Prisma 7, PostgreSQL |
| Pagamentos | Stripe (assinaturas e webhooks) |
| Infra | Docker, Railway, Cloudflare R2 |
| Desktop | Tauri |
| Testes | Vitest com banco de testes em Docker |

## ▶️ Como rodar

```bash
git clone https://github.com/joaovictormaria/velnoxia-APP.git
cd velnoxia-APP
npm install
cp .env.development.example .env.development
docker compose up -d     # Postgres local
npm run dev
```

Testes:

```bash
npm run test:db:up
npm test
```

<p align="center">Feito com 💙 por <a href="https://github.com/joaovictormaria">João Victor</a></p>

<p align="center">
  <img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:7aa2f7,50:1a1b27,100:0d1117&height=100&section=footer" alt="Rodapé" />
</p>
