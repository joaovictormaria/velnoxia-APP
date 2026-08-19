-- Grupos de opcoes por categoria: o sabor do shake, o ponto da carne, os
-- complementos do acai, a borda da pizza.
--
-- Tres regras cobrem o que cada ramo precisa sem um campo por caso:
-- "escolha 1 obrigatorio" e min=1/max=1, "ate 3 gratis depois paga" e free=3,
-- e o adicional solto de sempre e min=0 sem limite.

CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minChoices" INTEGER NOT NULL DEFAULT 0,
    "maxChoices" INTEGER NOT NULL DEFAULT 1,
    "freeChoices" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OptionGroup_categoryId_sortOrder_idx" ON "OptionGroup"("categoryId", "sortOrder");

ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OptionItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OptionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OptionItem_groupId_name_key" ON "OptionItem"("groupId", "name");
CREATE INDEX "OptionItem_groupId_sortOrder_idx" ON "OptionItem"("groupId", "sortOrder");

ALTER TABLE "OptionItem" ADD CONSTRAINT "OptionItem_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O pedido guarda a escolha na mesma tabela onde ja guarda um adicional: para
-- o pedido, ambos sao "algo que o cliente escolheu e entrou na conta".
ALTER TABLE "OrderItemExtra" ADD COLUMN "optionItemId" TEXT;
ALTER TABLE "OrderItemExtra" ADD COLUMN "groupNameSnapshot" TEXT;

ALTER TABLE "OrderItemExtra" ADD CONSTRAINT "OrderItemExtra_optionItemId_fkey"
    FOREIGN KEY ("optionItemId") REFERENCES "OptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
