import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { NovidadesService } from "@/server/services/novidades-service";
import { hashPassword } from "@/server/auth/password";

/*
 * O ESTADO DAS NOVIDADES NO BANCO.
 *
 * O que estes testes existem para impedir, acima de tudo: que o estado de uma
 * pessoa alcance a de outra. Antes isto vivia no `localStorage`, onde o
 * isolamento era consequência de a chave carregar o id do usuário; agora é
 * consequência do `where`, e um `where` errado é uma linha que ninguém percebe
 * até alguém ver o aviso sumir sem ter fechado.
 *
 * A segunda asserção mais importante é a de concorrência (teste 09): o duplo
 * clique não pode produzir duas linhas nem estourar violação de unique.
 */

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function criarLoja(prefixo: string) {
  const slug = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const loja = await prisma.store.create({ data: { slug, name: "Lanche" } });
  await prisma.storeSettings.create({
    data: { storeId: loja.id, whatsappNumber: "11999999999" },
  });
  return loja.id;
}

async function criarAdmin(storeId: string, apelido: string) {
  return prisma.adminUser.create({
    data: {
      storeId,
      name: apelido,
      email: `${apelido}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@t.com`,
      passwordHash: await hashPassword("senha-de-teste-123"),
    },
  });
}

let lojaA = "";
let lojaB = "";

beforeEach(async () => {
  await limparBanco();
  lojaA = await criarLoja("loja-a");
  lojaB = await criarLoja("loja-b");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("NovidadesService", () => {
  it("01 · CONCLUIDA cria o registro e volta na leitura", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    expect(await NovidadesService.ler(u.id)).toEqual([
      { novidadeId: "n1", estado: "CONCLUIDA" },
    ]);
  });

  it("02 · DISPENSADA cria o registro e volta na leitura", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "DISPENSADA");
    expect(await NovidadesService.ler(u.id)).toEqual([
      { novidadeId: "n1", estado: "DISPENSADA" },
    ]);
  });

  it("03 · marcar duas vezes → UMA linha, não duas", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    const linhas = await prisma.adminUserAnnouncement.findMany({
      where: { adminUserId: u.id },
    });
    expect(linhas).toHaveLength(1);
  });

  it("04 · CONCLUIDA → DISPENSADA atualiza, sem duplicar", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    await NovidadesService.marcar(u.id, lojaA, "n1", "DISPENSADA");
    const linhas = await prisma.adminUserAnnouncement.findMany({
      where: { adminUserId: u.id },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].estado).toBe("DISPENSADA");
  });

  it("05 · novidades diferentes do mesmo usuário não se atropelam", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    await NovidadesService.marcar(u.id, lojaA, "n2", "DISPENSADA");
    const r = await NovidadesService.ler(u.id);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.novidadeId === "n1")?.estado).toBe("CONCLUIDA");
    expect(r.find((x) => x.novidadeId === "n2")?.estado).toBe("DISPENSADA");
  });

  it("06 · dois usuários da MESMA loja têm estados independentes", async () => {
    // O caso real: o dono e o gerente do mesmo restaurante.
    const dono = await criarAdmin(lojaA, "dono");
    const gerente = await criarAdmin(lojaA, "gerente");

    await NovidadesService.marcar(dono.id, lojaA, "n1", "CONCLUIDA");

    expect(await NovidadesService.ler(dono.id)).toHaveLength(1);
    expect(await NovidadesService.ler(gerente.id)).toEqual([]);
  });

  it("07 · usuário de OUTRA LOJA não enxerga o registro do primeiro", async () => {
    const daLojaA = await criarAdmin(lojaA, "dono-a");
    const daLojaB = await criarAdmin(lojaB, "dono-b");

    await NovidadesService.marcar(daLojaA.id, lojaA, "n1", "CONCLUIDA");

    expect(await NovidadesService.ler(daLojaB.id)).toEqual([]);
  });

  it("08 · a leitura devolve SOMENTE as linhas do usuário pedido", async () => {
    const a = await criarAdmin(lojaA, "a");
    const b = await criarAdmin(lojaA, "b");
    const c = await criarAdmin(lojaB, "c");

    await NovidadesService.marcar(a.id, lojaA, "n1", "CONCLUIDA");
    await NovidadesService.marcar(b.id, lojaA, "n1", "DISPENSADA");
    await NovidadesService.marcar(c.id, lojaB, "n1", "CONCLUIDA");

    // Três linhas no banco, uma por pessoa; cada leitura vê só a sua.
    expect(await prisma.adminUserAnnouncement.count()).toBe(3);
    expect(await NovidadesService.ler(a.id)).toEqual([
      { novidadeId: "n1", estado: "CONCLUIDA" },
    ]);
  });

  it("09 · DUPLO CLIQUE CONCORRENTE → uma linha, sem violação de unique", async () => {
    const u = await criarAdmin(lojaA, "dono");

    /*
     * O teste que justifica o `upsert` em vez de "consultar, depois criar".
     * As duas chamadas partem juntas e disputam o índice
     * `@@unique([adminUserId, novidadeId])`. Quem perde a inserção atualiza a
     * linha do outro — o banco decide, e nenhuma das duas estoura.
     */
    const resultados = await Promise.allSettled([
      NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA"),
      NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA"),
    ]);

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
    expect(
      await prisma.adminUserAnnouncement.count({ where: { adminUserId: u.id } }),
    ).toBe(1);
  });

  it("10 · seis chamadas simultâneas continuam produzindo uma linha só", async () => {
    const u = await criarAdmin(lojaA, "dono");
    const resultados = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA"),
      ),
    );
    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
    expect(
      await prisma.adminUserAnnouncement.count({ where: { adminUserId: u.id } }),
    ).toBe(1);
  });

  it("11 · o storeId gravado é o que o serviço recebeu, para auditoria", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    const linha = await prisma.adminUserAnnouncement.findFirstOrThrow({
      where: { adminUserId: u.id },
    });
    expect(linha.storeId).toBe(lojaA);
  });

  it("12 · a leitura NÃO devolve adminUserId, storeId nem id da linha", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    const [registro] = await NovidadesService.ler(u.id);
    // O que não é selecionado não vaza, mesmo que a rota o repasse inteiro.
    expect(Object.keys(registro).sort()).toEqual(["estado", "novidadeId"]);
  });

  it("13 · id de novidade com dois-pontos é gravado inteiro", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "recurso:2026:v2", "CONCLUIDA");
    expect(await NovidadesService.ler(u.id)).toEqual([
      { novidadeId: "recurso:2026:v2", estado: "CONCLUIDA" },
    ]);
  });

  it("14 · apagar a conta leva o registro junto (CASCADE)", async () => {
    const u = await criarAdmin(lojaA, "dono");
    await NovidadesService.marcar(u.id, lojaA, "n1", "CONCLUIDA");
    await prisma.adminUser.delete({ where: { id: u.id } });
    expect(await prisma.adminUserAnnouncement.count()).toBe(0);
  });

  it("15 · usuário sem registro nenhum → lista vazia, não erro", async () => {
    const u = await criarAdmin(lojaA, "dono");
    expect(await NovidadesService.ler(u.id)).toEqual([]);
  });
});
