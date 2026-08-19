-- Pedido de nova senha por e-mail.
--
-- Guarda o hash do token, nunca o token: enquanto vale, um link de redefinicao
-- e a propria senha, entao quem ler o banco nao pode usa-lo.
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_adminUserId_usedAt_idx" ON "PasswordResetToken"("adminUserId", "usedAt");

-- Apagar a conta leva os pedidos pendentes dela junto.
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
