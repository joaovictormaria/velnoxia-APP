-- Funcionario: quem trabalha na loja e come nela.
--
-- Nao e um AdminUser. O funcionario nao entra no painel, nao tem senha e nao ve
-- pedido nenhum: ele pede pela vitrine como qualquer cliente, e o que o
-- distingue e ser reconhecido no checkout pelo telefone mais um PIN. O dinheiro
-- continua entrando pelo valor que ele realmente paga -- um item de 20 com 5 de
-- beneficio entra como 15 -- e o que estas colunas guardam e o "por que" desse
-- desconto, que o total do pedido sozinho nao consegue contar.

CREATE TYPE "EmployeeBenefitType" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE');
CREATE TYPE "EmployeeLimitMode" AS ENUM ('NONE', 'ITEMS_PER_DAY', 'AMOUNT_PER_DAY', 'PER_CATEGORY');

-- Desconto em folha. Fica de fora de "acceptedPaymentMethods" de proposito: nao
-- e uma forma de pagamento da loja, e um acerto com o funcionario.
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYROLL';

-- O beneficio de um grupo de funcionarios ("Cozinha", "Atendimento"). Mora num
-- plano, e nao em cada pessoa, porque a regra e do cargo: mudar o desconto da
-- cozinha teria de ser reescrito em cada ficha, e bastaria esquecer uma.
CREATE TABLE "EmployeeBenefitPlan" (
  "id"           TEXT NOT NULL,
  "storeId"      TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "defaultType"  "EmployeeBenefitType" NOT NULL DEFAULT 'NONE',
  "defaultValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "limitMode"    "EmployeeLimitMode" NOT NULL DEFAULT 'NONE',
  "limitValue"   DOUBLE PRECISION,
  "allowPayroll" BOOLEAN NOT NULL DEFAULT false,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeBenefitPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeBenefitPlan_storeId_name_key"
  ON "EmployeeBenefitPlan"("storeId", "name");

ALTER TABLE "EmployeeBenefitPlan"
  ADD CONSTRAINT "EmployeeBenefitPlan_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma excecao a regra padrao do plano, para uma categoria OU para um produto.
--
-- Sao os dois juntos -- padrao e excecoes -- que fazem os quatro jeitos que o
-- dono pediu caberem num mecanismo so: so o padrao e "% em tudo"; padrao NONE
-- com excecoes por categoria e "% por categoria"; padrao NONE com excecoes por
-- produto e "so nos marcados"; e excecoes FIXED_PRICE sao o preco de
-- funcionario.
CREATE TABLE "EmployeeBenefitRule" (
  "id"         TEXT NOT NULL,
  "planId"     TEXT NOT NULL,
  "categoryId" TEXT,
  "productId"  TEXT,
  "type"       "EmployeeBenefitType" NOT NULL,
  "value"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dailyLimit" INTEGER,

  CONSTRAINT "EmployeeBenefitRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeBenefitRule_planId_idx" ON "EmployeeBenefitRule"("planId");

-- Uma excecao por alvo dentro do plano: duas regras para a mesma categoria
-- fariam o preco depender de qual das duas o banco devolvesse primeiro.
CREATE UNIQUE INDEX "EmployeeBenefitRule_planId_categoryId_key"
  ON "EmployeeBenefitRule"("planId", "categoryId");
CREATE UNIQUE INDEX "EmployeeBenefitRule_planId_productId_key"
  ON "EmployeeBenefitRule"("planId", "productId");

ALTER TABLE "EmployeeBenefitRule"
  ADD CONSTRAINT "EmployeeBenefitRule_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "EmployeeBenefitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeBenefitRule"
  ADD CONSTRAINT "EmployeeBenefitRule_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeBenefitRule"
  ADD CONSTRAINT "EmployeeBenefitRule_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mesmo motivo do OptionGroup: uma regra orfa nunca se aplicaria a nada, e uma
-- regra com os dois alvos seria encontrada duas vezes pelo mesmo item.
ALTER TABLE "EmployeeBenefitRule"
  ADD CONSTRAINT "EmployeeBenefitRule_alvo_unico"
  CHECK (("categoryId" IS NULL) <> ("productId" IS NULL));

CREATE TABLE "Employee" (
  "id"        TEXT NOT NULL,
  "storeId"   TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "jobTitle"  TEXT,
  -- So digitos, no mesmo formato em que o checkout grava "customerPhone".
  "phone"     TEXT NOT NULL,
  -- Hash, igual as senhas: um PIN de 4 digitos em texto puro no banco e a mesma
  -- coisa que nao ter PIN.
  "pinHash"   TEXT NOT NULL,
  "planId"    TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Employee_storeId_phone_key" ON "Employee"("storeId", "phone");
CREATE INDEX "Employee_storeId_isActive_idx" ON "Employee"("storeId", "isActive");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sem plano o funcionario fica cadastrado mas nao ganha nada, que e o estado de
-- quem acabou de ser contratado. Por isso SetNull, e nao Cascade: apagar um
-- plano nao pode apagar as pessoas.
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "EmployeeBenefitPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O pedido guarda que saiu com beneficio, quanto do desconto veio dai, e por
-- qual regra. O nome vai copiado pelo mesmo motivo do courierNameSnapshot:
-- apagar a ficha do funcionario nao pode apagar quem pegou o que.
ALTER TABLE "Order" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "Order" ADD COLUMN "employeeNameSnapshot" TEXT;
ALTER TABLE "Order" ADD COLUMN "employeeDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "employeeBenefitNote" TEXT;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A cota do dia e uma pergunta por funcionario dentro de uma janela de tempo, e
-- ela e feita em todo checkout dele.
CREATE INDEX "Order_employeeId_createdAt_idx" ON "Order"("employeeId", "createdAt");

-- Por linha, para a cota poder acabar no meio de uma: "dois com desconto, o
-- terceiro cheio" nao cabe num campo unico do pedido.
ALTER TABLE "OrderItem" ADD COLUMN "employeeDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "benefitQuantity" INTEGER NOT NULL DEFAULT 0;
