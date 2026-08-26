-- Versao da sessao do AdminUser.
--
-- Sobe a cada troca de senha. A sessao selada no cookie guarda a versao que a
-- conta tinha no login; quando divergem, o cookie antigo deixa de valer e a
-- sessao cai. E o que faz uma redefinicao de senha expulsar quem ja estava
-- dentro -- sem isto, um invasor com um cookie ainda valido sobrevivia a
-- recuperacao da conta por ate uma semana.
--
-- Aditivo e preserva dados: toda linha existente ganha 0, e as sessoes ja
-- abertas (que nao carregam versao) caem no primeiro request e refazem login,
-- que e o lado seguro do erro.

ALTER TABLE "AdminUser" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
