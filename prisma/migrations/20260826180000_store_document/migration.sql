-- Documento do estabelecimento: CPF ou CNPJ.
--
-- Esta migration existe por causa de uma assimetria criada pelo baseline de
-- 26/08/2026: producao foi marcada como tendo a `0_init` aplicada sem nunca
-- te-la executado — o schema de la veio de `prisma db push`. Um banco novo, ao
-- contrario, executa a `0_init` de verdade e ja nasce com estas quatro coisas.
--
-- A mesma migration precisa servir aos dois casos, e e por isso que cada
-- comando aqui e idempotente. Sem isso ela funcionaria em producao e quebraria
-- em toda instalacao nova, inclusive no `npm run test:db:up`.
--
-- Aditiva de proposito: sem NOT NULL, sem backfill, sem UPDATE. A loja que ja
-- existe em producao fica com as colunas NULAS — nao se inventa documento para
-- ninguem. O NOT NULL vem numa migration separada, depois que os dados
-- existentes estiverem preenchidos.

-- `CREATE TYPE` nao aceita `IF NOT EXISTS` em Postgres; o bloco com excecao e a
-- unica forma idempotente. `duplicate_object` e especifico: pega "ja existe" e
-- nao mascara erro de sintaxe, de permissao ou de tipo.
DO $$
BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "document"     VARCHAR(14),
  ADD COLUMN IF NOT EXISTS "documentType" "DocumentType";

-- Unicidade no banco, e nao so na aplicacao: a checagem em codigo melhora a
-- mensagem de erro, mas duas requisicoes simultaneas com o mesmo documento
-- passam pelas duas checagens antes de qualquer uma gravar. Em Postgres NULL
-- nao conflita com NULL, entao a loja existente sem documento nao impede.
CREATE UNIQUE INDEX IF NOT EXISTS "Store_document_key" ON "Store"("document");

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
--
-- `ADD CONSTRAINT` tambem nao aceita `IF NOT EXISTS`.
DO $$
BEGIN
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
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
