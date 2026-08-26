-- Semeia as unidades de medida base.
--
-- Por que isto e uma migration e nao um seed: sem estas linhas o modulo de
-- estoque inteiro esta inerte. `InventoryService.recordMovement` faz
-- `if (!unit) throw new Error("Unit not found")` antes de qualquer calculo, e
-- em producao a tabela estava vazia -- o motor da Fase 1 nunca pode gravar um
-- unico movimento. Um seed exige alguem lembrar de rodar; uma migration entra
-- sozinha no deploy e fica registrada em `_prisma_migrations`.
--
-- Ids fixos e legiveis, em vez de cuid: a mesma unidade tem o mesmo id em
-- local, teste e producao. Isso torna fixtures portaveis e deixa o razao de
-- movimentos legivel na inspecao manual.
--
-- ON CONFLICT ("code") e nao ("id"): `code` e a identidade de negocio. Se um
-- ambiente ja tiver "kg" gravado com outro id, o certo e preservar o que
-- existe -- ha movimentos apontando para ele -- e nao criar um duplicado.
--
-- DO NOTHING e nao DO UPDATE: uma migration nao pode reescrever o nome ou o
-- sistema de uma unidade que alguem ja usou. O historico ficaria mentindo.
--
-- Idempotente por construcao: rodar duas vezes deixa exatamente 5 linhas.

INSERT INTO "InventoryUnit" ("id", "code", "name", "system", "isBuiltIn", "createdAt")
VALUES
  ('unit_kg', 'kg', 'Quilograma', 'WEIGHT'::"InventoryUnitSystem", true, CURRENT_TIMESTAMP),
  ('unit_g',  'g',  'Grama',      'WEIGHT'::"InventoryUnitSystem", true, CURRENT_TIMESTAMP),
  ('unit_l',  'L',  'Litro',      'VOLUME'::"InventoryUnitSystem", true, CURRENT_TIMESTAMP),
  ('unit_ml', 'ml', 'Mililitro',  'VOLUME'::"InventoryUnitSystem", true, CURRENT_TIMESTAMP),
  ('unit_un', 'un', 'Unidade',    'COUNT'::"InventoryUnitSystem",  true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
