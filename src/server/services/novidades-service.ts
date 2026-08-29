import { prisma } from "@/server/db/client";
import type { Estado, Registro } from "@/lib/novidades/tipos";

/**
 * O ESTADO DAS NOVIDADES, POR USUÁRIO — a metade do servidor.
 *
 * Antes isto morava no `localStorage`, e o defeito era visível: o dono
 * concluía o tutorial no PC do balcão e o via de novo no celular. Cada
 * navegador tinha a própria memória, e apagar o cache trazia tudo de volta.
 *
 * ─── A REGRA QUE GOVERNA ESTE ARQUIVO ──────────────────────────────────────
 *
 * `adminUserId` e `storeId` são PARÂMETROS, e quem os passa é a server
 * function — que os tira de `requireAdminSession()`, nunca do corpo da
 * requisição. Este serviço não tem como saber a diferença, e é justamente por
 * isso que ele não pode ser chamado de nenhum outro lugar que não a função
 * HTTP: não há validador aqui, há confiança no chamador.
 *
 * O RECORTE É `adminUserId`, e só ele. `storeId` é gravado para auditoria e
 * para apagar o rastro de um tenant que sai, mas nunca entra num `where`:
 * `adminUserId` já é único no sistema inteiro, e filtrar por loja além disso
 * criaria um segundo lugar de onde o recorte poderia divergir — sem acrescentar
 * isolamento nenhum.
 */
export const NovidadesService = {
  /**
   * O que este usuário já concluiu ou dispensou.
   *
   * Devolve o formato que `escolherNovidade` já consome, para a lógica pura de
   * seleção continuar a mesma dos dois lados do fio.
   */
  async ler(adminUserId: string): Promise<Registro[]> {
    const linhas = await prisma.adminUserAnnouncement.findMany({
      where: { adminUserId },
      select: { novidadeId: true, estado: true },
    });
    return linhas.map((l) => ({ novidadeId: l.novidadeId, estado: l.estado as Estado }));
  },

  /**
   * Grava a decisão. Repetir a mesma não cria uma segunda linha.
   *
   * `upsert` sobre `@@unique([adminUserId, novidadeId])`, e não
   * "consultar, depois criar": entre a consulta e a criação cabe outra
   * requisição, e o duplo clique produziria duas linhas — ou uma violação de
   * unique estourando na cara do usuário. Aqui a segunda chamada simplesmente
   * atualiza a primeira, e a decisão de quem vence é do banco.
   */
  async marcar(
    adminUserId: string,
    storeId: string,
    novidadeId: string,
    estado: Estado,
  ): Promise<void> {
    await prisma.adminUserAnnouncement.upsert({
      where: { adminUserId_novidadeId: { adminUserId, novidadeId } },
      create: { adminUserId, storeId, novidadeId, estado },
      // `storeId` também no update: se o admin trocou de loja, o rastro
      // acompanha. `adminUserId` e `novidadeId` não são tocados — são a chave.
      update: { estado, storeId },
    });
  },
};
