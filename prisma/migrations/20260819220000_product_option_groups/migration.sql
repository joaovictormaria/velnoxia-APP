-- Grupo de opcoes que pertence a um produto, e nao a categoria inteira.
--
-- A categoria "Bebidas" tem refrigerante e suco. Perguntar o sabor ali dentro
-- obrigava os dois a oferecerem a mesma lista -- Coca e Guarana no suco, ou
-- laranja e maracuja no refrigerante. Nenhum dono aceita isso, e o resultado
-- pratico era ninguem perguntar sabor nenhum.
--
-- Um grupo passa a apontar para a categoria OU para o produto, nunca para os
-- dois. O CHECK abaixo e o que garante isso: sem ele um grupo orfao (nenhum dos
-- dois) nunca apareceria em lugar algum, e um grupo com os dois apareceria
-- duas vezes no mesmo pedido.

ALTER TABLE "OptionGroup" ALTER COLUMN "categoryId" DROP NOT NULL;

ALTER TABLE "OptionGroup" ADD COLUMN "productId" TEXT;

ALTER TABLE "OptionGroup"
  ADD CONSTRAINT "OptionGroup_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "OptionGroup_productId_sortOrder_idx" ON "OptionGroup"("productId", "sortOrder");

ALTER TABLE "OptionGroup"
  ADD CONSTRAINT "OptionGroup_dono_unico"
  CHECK (("categoryId" IS NULL) <> ("productId" IS NULL));
