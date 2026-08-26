-- Documento do estabelecimento: CPF ou CNPJ.
--
-- Aditiva de proposito. A coluna nasce anulavel porque o `start` do Railway roda
-- `prisma migrate deploy` antes de subir a aplicacao: uma migration que falha
-- deixa o container em crashloop, e uma coluna NOT NULL sobre uma tabela que ja
-- tem linhas falha na hora. O NOT NULL vem numa migration separada, depois que
-- as lojas existentes tiverem documento.

CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');

ALTER TABLE "Store"
  ADD COLUMN "document"     VARCHAR(14),
  ADD COLUMN "documentType" "DocumentType";

-- Unicidade no banco, e nao so na aplicacao: a checagem em codigo melhora a
-- mensagem de erro, mas duas requisicoes simultaneas com o mesmo documento
-- passam pelas duas checagens antes de qualquer uma gravar. Em Postgres NULL
-- nao conflita com NULL, entao varias lojas sem documento convivem enquanto a
-- coluna for anulavel.
CREATE UNIQUE INDEX "Store_document_key" ON "Store"("document");

-- Impede os tres estados incoerentes que a aplicacao sozinha nao garante:
--   1. document preenchido e documentType vazio (ou o contrario);
--   2. documentType dizendo CPF com 14 digitos, ou CNPJ com 11;
--   3. documento gravado com mascara ("123.456.789-09") ou com qualquer
--      caractere que nao seja digito.
--
-- O item 3 e o que transforma "guardar so numeros" de convencao em invariante:
-- sem ele, um caminho novo que esqueca de normalizar corrompe a unicidade em
-- silencio, porque "12345678909" e "123.456.789-09" sao valores diferentes.
--
-- Os `IS NOT NULL` explicitos nao sao redundancia, e foram acrescentados depois
-- que um teste pegou a falha: com document NULL e documentType = 'CPF', a
-- comparacao `NULL ~ regex` da NULL, o OR inteiro da NULL, e um CHECK que
-- resulta em NULL e ACEITO pelo Postgres — so FALSE rejeita. Sem esta guarda,
-- metade do par entrava no banco.
ALTER TABLE "Store" ADD CONSTRAINT "Store_document_coerente"
  CHECK (
    ("document" IS NULL AND "documentType" IS NULL)
    OR (
      "document" IS NOT NULL AND "documentType" IS NOT NULL
      AND (
        ("documentType" = 'CPF'  AND "document" ~ '^[0-9]{11}$') OR
        ("documentType" = 'CNPJ' AND "document" ~ '^[0-9]{14}$')
      )
    )
  );
