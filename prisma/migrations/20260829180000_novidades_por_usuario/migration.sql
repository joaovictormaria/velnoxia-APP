-- NOVIDADES POR USUÁRIO
--
-- Tira do `localStorage` o registro de quem já concluiu ou dispensou cada
-- novidade. O sintoma era concreto: o dono concluía o tutorial no PC do balcão
-- e o via de novo no celular, porque cada navegador tinha a sua própria
-- memória. A fonte de verdade passa a ser o servidor.
--
-- INTEIRAMENTE ADITIVA. Nenhuma tabela existente é alterada, nenhuma coluna é
-- removida ou renomeada, nenhuma linha é reescrita. O rollback é
-- `DROP TABLE "AdminUserAnnouncement"; DROP TYPE "EstadoDaNovidade";`.
--
-- NADA AQUI TOCA PEDIDOS, ESTOQUE, FINANCEIRO OU AUTENTICAÇÃO. A única
-- referência a estrutura existente é a foreign key para `AdminUser`, que só lê.

-- CreateEnum
--
-- Estado, e não dois booleanos: `concluida=true, dispensada=true` seria um
-- estado sem significado, e aqui ele é impossível de escrever.
CREATE TYPE "EstadoDaNovidade" AS ENUM ('CONCLUIDA', 'DISPENSADA');

-- CreateTable
--
-- `novidadeId` é TEXT livre, e nunca um enum. É o que garante que lançar a
-- novidade nº 50 seja editar um arquivo TypeScript, sem migration nenhuma.
--
-- `storeId` fica gravado para auditoria e limpeza por tenant. Ele NÃO entra na
-- consulta: o recorte é `adminUserId`, que já é único no sistema inteiro.
CREATE TABLE "AdminUserAnnouncement" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "novidadeId" TEXT NOT NULL,
    "estado" "EstadoDaNovidade" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUserAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Por loja: serve à auditoria e a apagar o rastro de um tenant que sai.
CREATE INDEX "AdminUserAnnouncement_storeId_idx" ON "AdminUserAnnouncement"("storeId");

-- CreateIndex
--
-- A TRAVA CONTRA DUPLICATA, e ela é do banco — não da aplicação.
-- Dois cliques simultâneos disputam este índice: o segundo atualiza a linha do
-- primeiro em vez de inserir outra. É o que torna o `upsert` seguro sob
-- concorrência, sem transação explícita nem lock na aplicação.
CREATE UNIQUE INDEX "AdminUserAnnouncement_adminUserId_novidadeId_key" ON "AdminUserAnnouncement"("adminUserId", "novidadeId");

-- AddForeignKey
--
-- CASCADE: quando uma conta de admin é apagada, o que ela já viu não interessa
-- mais a ninguém. Não há dado de negócio aqui para preservar.
ALTER TABLE "AdminUserAnnouncement" ADD CONSTRAINT "AdminUserAnnouncement_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
