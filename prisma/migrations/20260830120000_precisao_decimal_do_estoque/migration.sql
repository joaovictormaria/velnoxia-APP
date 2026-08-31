-- Precisao decimal do estoque e do custo: numeric(15,4)/(15,6) -> numeric(19,8).
--
-- POR QUE: o estoque por conteudo de embalagem produz dizima. Um oleo contado
-- em `un`, com 900 ml por garrafa, gasta 40/900 = 0,044444... de unidade por
-- salgado. Com quatro casas isso era gravado como 0,0444.
--
-- O erro NAO se cancela. A mesma receita da sempre a mesma dizima e arredonda
-- sempre para o mesmo lado, entao ele acumula linearmente e sempre para MENOS:
-- o sistema acredita ter mais oleo do que tem. Medido, sao quatro litros de
-- desvio a cada cem mil vendas — e uma contagem fisica que nunca fecha.
--
-- POR QUE OITO CASAS, e nao seis: o erro por movimento vale
-- 0,5 x 10^-escala x contentSize. Num galao de 20 L, seis casas ainda deixam um
-- litro de desvio por cem mil vendas; oito deixam dez mililitros. O limite veio
-- do pior caso real, nao do proximo numero redondo.
--
-- POR QUE 19 DE PRECISAO TOTAL: numeric(15,8) deixaria sete digitos inteiros.
-- Hoje sao onze, e uma padaria que conte farinha em gramas chega perto disso.
-- 19 preserva os mesmos onze digitos inteiros e acrescenta as quatro casas.
--
-- SEGURANCA: alargar `numeric` nunca perde dado — os valores existentes ganham
-- zeros a direita. O ALTER reescreve a tabela e toma ACCESS EXCLUSIVE; medido,
-- 215 ms para duzentas mil linhas. Nas tabelas de estoque da producao ha zero
-- linhas, entao e instantaneo.
--
-- IRREVERSIVEL NA PRATICA: voltar para (15,4) truncaria qualquer valor que ja
-- use as casas novas. So da para desfazer enquanto ninguem tiver gravado uma
-- dizima.

ALTER TABLE "InventoryMovement" ALTER COLUMN "quantity"   TYPE numeric(19,8);
ALTER TABLE "InventoryMovement" ALTER COLUMN "costAtTime" TYPE numeric(19,8);

ALTER TABLE "InventoryItem" ALTER COLUMN "quantityOnHand"   TYPE numeric(19,8);
ALTER TABLE "InventoryItem" ALTER COLUMN "quantityReserved" TYPE numeric(19,8);
ALTER TABLE "InventoryItem" ALTER COLUMN "cost"             TYPE numeric(19,8);
