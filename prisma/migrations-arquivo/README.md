# Migrations históricas — ARQUIVADAS, NÃO EXECUTAR

Estas 35 migrations foram substituídas por uma única `0_init` em 26/08/2026.
Elas estão aqui como registro histórico. **Nenhuma delas deve ser executada.**

O Prisma não enxerga esta pasta: só `prisma/migrations/` é lida por
`migrate deploy` e `migrate dev`. Mover um destes diretórios de volta para lá
quebra o banco.

## Por que foram arquivadas

Elas nunca descreveram o banco de verdade.

Auditoria de 26/08/2026, com consultas somente-leitura ao Postgres de produção:

- **`_prisma_migrations` tinha 36 registros, todos com `applied_steps_count = 0`**,
  e todos carimbados numa janela de seis minutos (05:53–05:59 de 26/08). Esse
  zero é a assinatura de `migrate resolve --applied`: registrada como aplicada,
  nenhum SQL executado. Antes disso a tabela estava vazia. Ou seja, **nenhuma
  destas migrations jamais rodou contra produção.**

- **O banco de produção foi construído por `prisma db push`.** É o que explica o
  estado observado: as tabelas existem com a forma que o `schema.prisma`
  descreve, e não com a forma que estas migrations produziriam.

- **Cinco tabelas e dois enums não são criados por migration nenhuma**:
  `Table`, `AuditLog`, `SessionDevice`, `PaymentWebhookEvent`,
  `StripeWebhookEvent`, `TableStatus`, `TableSessionStatus`.

- Por causa disso, `20260822000004_add_table_session_table_fkey` **falha em
  qualquer banco vazio** com `42P01: relation "Table" does not exist`: ela cria
  uma foreign key para uma tabela que ninguém criou.

- Reconstruindo um banco local com estas migrations e comparando com o schema,
  sobravam **380 linhas de diferença**: 5 tabelas, 2 enums, 30 colunas
  (a maioria `deletedAt`, do soft delete), 46 índices, 22 `ALTER COLUMN` de
  `Decimal` e 10 foreign keys.

Uma migration de reparo não resolveria: a migration quebrada roda *antes* dela e
continuaria falhando. E preservar um histórico que nunca foi executado é
preservar ficção — a `0_init` é a primeira migration honesta do projeto.

## O que mudou na prática

A partir da `0_init`, um Postgres vazio chega ao estado atual do schema com um
único `prisma migrate deploy`, sem nenhum `db push`. Isso foi verificado
destruindo o banco de teste e reconstruindo do zero.

## Se você precisar consultar algo daqui

Servem para entender *por que* uma coluna existe, ou para recuperar SQL de
alguma correção pontual. Para o estado atual do banco, a fonte é
`prisma/schema.prisma` e a `0_init`.
