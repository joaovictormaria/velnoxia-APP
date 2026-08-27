-- Semeia as conversoes entre unidades do mesmo sistema.
--
-- ISTO NASCEU DE UMA RECEITA IMPOSSIVEL. Uma ficha com "60 g de farinha", com a
-- farinha contada em kg, era aceita no cadastro e falhava em TODO uso:
-- calcular o custo lancava, produzir lancava, e o formulario mostrava
-- R$ 300,00 porque tratava 60 g como 60 kg. O item ficava cadastrado e
-- impossivel de produzir.
--
-- A causa era nao existir conversao nenhuma. `converterParaUnidadeBase` so
-- sabia converter por `contentSize` -- que significa "1 pote = 500 g", ou seja
-- EMBALAGEM, e nao escala metrica. Para g -> kg ela nao tinha o que fazer.
--
-- A tabela `InventoryUnitConversion` existe desde o inicio, foi desenhada
-- exatamente para isto, e estava VAZIA sem nenhum leitor -- achado A6 da
-- auditoria da Fase 2.
--
-- Por que DADO e nao codigo: acrescentar libra, onca ou xicara depois vira uma
-- linha nova, sem deploy. E a conversao passa a ser inspecionavel por quem
-- desconfiar de um custo.
--
-- So dentro do mesmo sistema. Peso nao vira volume: 1 kg de farinha e 1 L de
-- leite nao se convertem um no outro sem densidade, que o sistema nao guarda.
-- Os pares ausentes sao recusados de proposito.
--
-- O INSERT deriva da propria tabela de unidades, em vez de assumir que elas
-- existem. Num banco recem-truncado -- o de testes, entre uma suite e outra --
-- as unidades podem nao estar la, e um INSERT direto quebraria a migration por
-- violacao de chave estrangeira. Assim ela insere o que puder e segue.

INSERT INTO "InventoryUnitConversion" ("id", "fromUnitId", "toUnitId", "conversionFactor", "createdAt")
SELECT v.id, v.de, v.para, v.fator, CURRENT_TIMESTAMP
  FROM (VALUES
    -- Peso
    ('conv_kg_g', 'unit_kg', 'unit_g',  1000::numeric),
    ('conv_g_kg', 'unit_g',  'unit_kg', 0.001::numeric),
    -- Volume
    ('conv_l_ml', 'unit_l',  'unit_ml', 1000::numeric),
    ('conv_ml_l', 'unit_ml', 'unit_l',  0.001::numeric)
  ) AS v(id, de, para, fator)
 WHERE EXISTS (SELECT 1 FROM "InventoryUnit" u WHERE u.id = v.de)
   AND EXISTS (SELECT 1 FROM "InventoryUnit" u WHERE u.id = v.para)
ON CONFLICT ("fromUnitId", "toUnitId") DO NOTHING;
