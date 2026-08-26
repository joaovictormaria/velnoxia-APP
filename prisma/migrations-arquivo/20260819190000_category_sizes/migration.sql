-- Tamanho deixa de ser um enum de pizzaria e passa a ser um nome livre que
-- pertence a categoria.
--
-- Pertence a categoria, e nao ao produto, por causa da meia a meia: o preco de
-- uma pizza metade A metade B procura o mesmo tamanho nos dois sabores. Com o
-- nome preso ao produto, "Grande" e "grande" seriam tamanhos diferentes e a
-- conta sairia errada sem ninguem perceber.
--
-- A conversao preserva o que existir: cada par (categoria, tamanho) em uso vira
-- uma linha de CategorySize, e os precos apontam para ela.

CREATE TABLE "CategorySize" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CategorySize_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategorySize_categoryId_label_key" ON "CategorySize"("categoryId", "label");
CREATE INDEX "CategorySize_categoryId_sortOrder_idx" ON "CategorySize"("categoryId", "sortOrder");

ALTER TABLE "CategorySize" ADD CONSTRAINT "CategorySize_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma linha por (categoria, tamanho) que hoje tem preco cadastrado.
INSERT INTO "CategorySize" ("id", "categoryId", "label", "sortOrder")
SELECT
    md5(p."categoryId" || '|' || ps."size"::text),
    p."categoryId",
    CASE ps."size"::text
        WHEN 'BROTINHO' THEN 'Brotinho'
        WHEN 'MEDIA'    THEN 'Média'
        WHEN 'GRANDE'   THEN 'Grande'
        WHEN 'GIGANTE'  THEN 'Gigante'
    END,
    CASE ps."size"::text
        WHEN 'BROTINHO' THEN 1
        WHEN 'MEDIA'    THEN 2
        WHEN 'GRANDE'   THEN 3
        WHEN 'GIGANTE'  THEN 4
    END
FROM "ProductSize" ps
JOIN "Product" p ON p."id" = ps."productId"
GROUP BY p."categoryId", ps."size";

-- Os precos passam a apontar para o tamanho da categoria.
ALTER TABLE "ProductSize" ADD COLUMN "categorySizeId" TEXT;

UPDATE "ProductSize" ps
SET "categorySizeId" = md5(p."categoryId" || '|' || ps."size"::text)
FROM "Product" p
WHERE p."id" = ps."productId";

-- Se sobrou preco sem tamanho correspondente, ele nao tem mais como ser lido:
-- apagar e melhor que deixar uma linha orfa cobrando o preco base em silencio.
DELETE FROM "ProductSize" WHERE "categorySizeId" IS NULL;

ALTER TABLE "ProductSize" ALTER COLUMN "categorySizeId" SET NOT NULL;
ALTER TABLE "ProductSize" DROP COLUMN "size";

ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_categorySizeId_fkey"
    FOREIGN KEY ("categorySizeId") REFERENCES "CategorySize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProductSize_productId_categorySizeId_key" ON "ProductSize"("productId", "categorySizeId");
CREATE INDEX "ProductSize_categorySizeId_idx" ON "ProductSize"("categorySizeId");

-- O pedido guarda o nome em texto: e um retrato do momento da compra, e
-- renomear o tamanho depois nao pode reescrever o historico.
ALTER TABLE "OrderItem" ALTER COLUMN "sizeLabel" TYPE TEXT USING (
    CASE "sizeLabel"::text
        WHEN 'BROTINHO' THEN 'Brotinho'
        WHEN 'MEDIA'    THEN 'Média'
        WHEN 'GRANDE'   THEN 'Grande'
        WHEN 'GIGANTE'  THEN 'Gigante'
        ELSE "sizeLabel"::text
    END
);

DROP TYPE "SizeLabel";
