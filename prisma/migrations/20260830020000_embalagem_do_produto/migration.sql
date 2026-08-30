-- EMBALAGEM DO PRODUTO, FORA DA RECEITA
--
-- A caixa de pizza precisava sair do estoque quando a pizza fosse vendida, e o
-- unico lugar onde ela cabia era dentro da ficha tecnica, como se fosse
-- ingrediente. Tres coisas quebravam por causa disso:
--
--   1. O custo da caixa entrava no custo de PRODUCAO do preparado, e nao no
--      custo da venda. Uma ficha de molho com caixa faria a corrida de producao
--      consumir caixa — o molho e feito de manha, a caixa e usada a noite.
--   2. Um produto de REVENDA nao tem ficha nenhuma. O copo do refrigerante nao
--      tinha onde morar, e obrigar a Coca-Cola a ter receita para carregar um
--      copo e exatamente o trabalho que o tipo REVENDA existe para evitar.
--   3. "Ingrediente" deixava de significar alguma coisa. A tela de ficha
--      tecnica misturava comida e descartavel na mesma lista.
--
-- TABELA VAZIA. Ninguem le uma tabela sem linhas: a soma de embalagem no motor
-- e zero ate alguem configurar a primeira. Esta migration nao muda o
-- comportamento de nenhum pedido existente.
--
-- INTEIRAMENTE ADITIVA. Uma tabela nova, nada mais. Nenhuma coluna criada,
-- removida ou alterada em tabela existente. Nenhum UPDATE, DELETE ou DROP.
--
-- NADA AQUI TOCA PEDIDOS, PAGAMENTOS, FIADO, STRIPE OU AUTENTICACAO.
--
-- SOBRE OS onDelete:
--
--   product        Cascade   apagar o produto leva a configuracao dele junto.
--                            A embalagem nao existe sem o produto.
--   inventoryItem  Restrict  apagar um item de estoque que e embalagem de
--                            algum produto e RECUSADO. E o oposto deliberado
--                            do SetNull que o vinculo direto tinha ate agora,
--                            e que fazia o produto perder a origem em silencio.
--   unit           Restrict  igual ao resto do modulo: unidade em uso nao cai.
--
-- UNIQUE(productId, inventoryItemId): duas caixas do MESMO tipo sao
-- `quantity = 2`, nao duas linhas. Sem isto a soma do motor dependeria de
-- quantas vezes alguem clicou em adicionar.
--
-- ROLLBACK:
--   DROP TABLE "ProductPackaging";

-- CreateTable
CREATE TABLE "ProductPackaging" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductPackaging_productId_inventoryItemId_key" ON "ProductPackaging"("productId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "ProductPackaging_storeId_idx" ON "ProductPackaging"("storeId");

-- CreateIndex
CREATE INDEX "ProductPackaging_productId_idx" ON "ProductPackaging"("productId");

-- CreateIndex
CREATE INDEX "ProductPackaging_inventoryItemId_idx" ON "ProductPackaging"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
