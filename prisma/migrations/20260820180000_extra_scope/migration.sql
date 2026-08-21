-- Onde cada adicional pode ser pedido.
--
-- Ate aqui o adicional era da loja e valia para tudo: dava para pedir borda de
-- catupiry num refrigerante, e o sistema aceitava e cobrava. O dono nao tinha
-- onde dizer que nao.
--
-- O alcance aponta para uma categoria OU para um produto, nunca para os dois na
-- mesma linha -- mesma forma dos OptionGroup. A categoria existe porque sem ela
-- o cadastro seria impraticavel: numa pizzaria de quarenta sabores, "Borda de
-- catupiry" exigiria quarenta marcacoes, e mais uma a cada pizza nova.

CREATE TABLE "ExtraScope" (
  "id"         TEXT NOT NULL,
  "extraId"    TEXT NOT NULL,
  "categoryId" TEXT,
  "productId"  TEXT,

  CONSTRAINT "ExtraScope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtraScope_extraId_categoryId_key" ON "ExtraScope"("extraId", "categoryId");
CREATE UNIQUE INDEX "ExtraScope_extraId_productId_key"  ON "ExtraScope"("extraId", "productId");
CREATE INDEX "ExtraScope_categoryId_idx" ON "ExtraScope"("categoryId");
CREATE INDEX "ExtraScope_productId_idx"  ON "ExtraScope"("productId");

ALTER TABLE "ExtraScope"
  ADD CONSTRAINT "ExtraScope_extraId_fkey"
  FOREIGN KEY ("extraId") REFERENCES "Extra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtraScope"
  ADD CONSTRAINT "ExtraScope_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtraScope"
  ADD CONSTRAINT "ExtraScope_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mesmo motivo do OptionGroup: um alcance orfao nunca se aplicaria a nada, e um
-- com os dois alvos seria encontrado duas vezes pelo mesmo produto.
ALTER TABLE "ExtraScope"
  ADD CONSTRAINT "ExtraScope_alvo_unico"
  CHECK (("categoryId" IS NULL) <> ("productId" IS NULL));

-- Preserva o que as lojas no ar ja vendiam.
--
-- Todo adicional existente passa a valer em todas as categorias da loja dele, e
-- nao em cada produto um a um. Os dois cobrem o cardapio de hoje; a categoria
-- cobre tambem o produto que for cadastrado amanha, que e o comportamento que
-- essas lojas tem agora. Fosse por produto, um item novo nasceria sem adicional
-- nenhum e o dono descobriria isso pela reclamacao de um cliente.
INSERT INTO "ExtraScope" ("id", "extraId", "categoryId", "productId")
SELECT
  -- Id previsivel e unico sem depender de extensao do banco: o par ja e unico
  -- pelo indice acima.
  'esc_' || substr(md5(e."id" || ':' || c."id"), 1, 21),
  e."id",
  c."id",
  NULL
FROM "Extra" e
JOIN "Category" c ON c."storeId" = e."storeId";
