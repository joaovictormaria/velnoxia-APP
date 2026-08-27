-- Embalagem de compra: quantas unidades de estoque vem em uma.
--
-- ISTO NASCEU DE UM CADASTRO IMPOSSIVEL. "Ovos, unidade un, custo 15,
-- quantidade inicial 1" -- o operador queria dizer "uma caixa de 30 ovos por
-- R$ 15,00", e o sistema gravou UM ovo custando QUINZE REAIS. Nao havia campo
-- onde dizer que aquilo era uma caixa.
--
-- POR QUE `contentSize` NAO SERVIA: ele e a orientacao CONTRARIA. La o estoque
-- e contado na embalagem (potes) e a receita pede o conteudo (gramas), e o
-- numero e usado como DIVISOR -- 45 g num item contado em potes de 500 g dao
-- 0,09 potes. Aqui o estoque e contado no conteudo (ovos) e a compra vem em
-- embalagens (caixas), e o numero MULTIPLICA. Reusar a mesma coluna faria uma
-- receita de "60 un" virar 2 num item com 30 por caixa.
--
-- POR QUE `InventoryUnitConversion` NAO SERVIA: ela liga duas UNIDADES por
-- escala fixa e universal -- 1 kg = 1000 g sempre. "Caixa" nao e unidade
-- universal: caixa de ovos tem 30, caixa de leite tem 12. E propriedade do
-- ITEM, nao da unidade.
--
-- O `cost` do item continua sendo R$ POR UNIDADE DE ESTOQUE. O preco da
-- embalagem e entrada de formulario, dividido na hora de gravar. Essa
-- invariante o sistema inteiro depende dela: costAtTime, custo da ficha e
-- custo do preparado leem `cost` assumindo unidade de estoque.
--
-- IMPACTO NOS DADOS: nenhum. Duas colunas nulaveis, sem default e sem
-- backfill. Item sem embalagem se comporta exatamente como antes -- o codigo
-- trata conteudo ausente como 1, que e compra direta na unidade de estoque.

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "purchasePackSize" DECIMAL(15,4);
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "purchasePackLabel" TEXT;
