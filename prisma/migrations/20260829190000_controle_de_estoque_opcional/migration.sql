-- CONTROLE DE ESTOQUE OPCIONAL
--
-- Dá à loja a escolha de usar ou não o controle de estoque, e faz a escolha
-- valer: com o controle ligado, um produto que participa dele precisa saber de
-- onde tirar o que vende — ficha técnica com pelo menos um ingrediente OU um
-- item de estoque vinculado.
--
-- O SINTOMA QUE ISTO FECHA: hoje um produto sem ficha e sem vínculo é vendido
-- normalmente e não desce saldo nenhum. `insumosDoPedido` percorre os dois
-- caminhos, não acha nenhum e segue em silêncio. A mercadoria sai pela porta e
-- o estoque não se mexe; a diferença só aparece no inventário do mês seguinte.
--
-- INTEIRAMENTE ADITIVA. Duas colunas novas, ambas NOT NULL DEFAULT. Nenhuma
-- coluna é removida ou renomeada, nenhuma linha existente é reescrita, nenhum
-- índice ou constraint é derrubado. Não há UPDATE, não há DELETE, não há DROP.
--
-- NADA AQUI TOCA PEDIDOS, PAGAMENTOS, FIADO, STRIPE OU AUTENTICAÇÃO. As duas
-- tabelas alteradas são `StoreSettings` e `Product`, e em nenhuma delas o
-- comportamento muda enquanto o controle estiver desligado.
--
-- IMPACTO NOS REGISTROS EXISTENTES: nenhum, e isso é verificável. Toda loja já
-- criada recebe `inventoryControlEnabled = false`, que é literalmente o
-- comportamento de hoje — a regra nova não é consultada. Todo produto já criado
-- recebe `controlaEstoque = true`, que só passa a significar algo se o dono
-- ligar o controle, e ligá-lo é uma ação deliberada que o servidor recusa
-- enquanto houver produto pendente.
--
-- ROLLBACK:
--   ALTER TABLE "Product" DROP COLUMN "controlaEstoque";
--   ALTER TABLE "StoreSettings" DROP COLUMN "inventoryControlEnabled";

-- AlterTable
--
-- DEFAULT false: a loja não pediu estoque, então nada é exigido dela. É o que
-- mantém esta migration sem efeito até alguém decidir o contrário.
ALTER TABLE "StoreSettings"
  ADD COLUMN "inventoryControlEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
--
-- DEFAULT true, e o default é a regra, não a exceção. Fosse `false`, ligar o
-- controle não exigiria nada de produto nenhum: a trava nasceria decorativa e
-- cada mercadoria teria de ser marcada à mão para o estoque valer alguma coisa.
--
-- Marcar `false` é a exceção explícita do dono, para o que ocupa uma linha do
-- cardápio sem sair de prateleira: taxa de entrega, couvert, serviço.
ALTER TABLE "Product"
  ADD COLUMN "controlaEstoque" BOOLEAN NOT NULL DEFAULT true;
