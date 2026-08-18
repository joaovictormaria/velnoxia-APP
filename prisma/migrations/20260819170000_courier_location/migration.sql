-- Onde o entregador esta agora, para o cliente ver a distancia diminuindo.
--
-- Chave primaria no proprio courierId: e uma linha por entregador, sobrescrita
-- a cada envio. Nao ha historico de trajeto de proposito — guardar o caminho de
-- um trabalhador seria dado sensivel sem nenhuma pergunta que ele responda.
CREATE TABLE "CourierLocation" (
    "courierId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourierLocation_pkey" PRIMARY KEY ("courierId")
);

-- Cascade: apagar a conta do entregador leva a posicao com ela.
ALTER TABLE "CourierLocation" ADD CONSTRAINT "CourierLocation_courierId_fkey"
    FOREIGN KEY ("courierId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
