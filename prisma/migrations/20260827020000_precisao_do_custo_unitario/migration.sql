-- Precisao do custo unitario de estoque: DECIMAL(10,2) -> DECIMAL(15,6).
--
-- ISTO NASCEU DE UM OLEO A R$ 0,01 O MILILITRO. A garrafa de 900 ml custa
-- R$ 8,00, entao o mililitro custa R$ 0,008889 -- e duas casas decimais nao
-- guardam esse numero. O banco arredondava para R$ 0,01, e os 110 ml da receita
-- saiam R$ 1,10 em vez de R$ 0,98. Doze por cento de erro, em silencio, em todo
-- insumo contado em unidade pequena.
--
-- Duas casas bastam para PRECO DE VENDA, que e o que se cobra do cliente e
-- sempre tem centavo redondo. Nao bastam para CUSTO UNITARIO, que e resultado
-- de uma divisao: preco da embalagem dividido pelo que ela rende. Quanto menor
-- a unidade de contagem, mais casas a divisao pede.
--
-- 15,6 da folga para os dois lados: ate 999.999.999 reais por unidade, e ate um
-- milionesimo de real. Um insumo a R$ 0,000001 o miligrama ainda cabe.
--
-- ALARGAR E OPERACAO SEM PERDA. Postgres reescreve a coluna preservando cada
-- valor: R$ 4,50 continua R$ 4,50, agora com quatro zeros a mais que nao
-- mudam o numero. Nenhum arredondamento, nenhum default, nenhum backfill.
--
-- ESCOPO DELIBERADAMENTE ESTREITO. Nao toca em saldo, em movimento, em
-- OrderItem.unitCost, nem em nenhum preco de venda. Uma coluna, um proposito.

ALTER TABLE "InventoryItem"
  ALTER COLUMN "cost" TYPE DECIMAL(15,6);
