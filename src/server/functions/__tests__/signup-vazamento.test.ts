import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/*
 * O cadastro nao pode deixar dado pessoal escapar quando algo quebra antes da
 * transacao.
 *
 * Isto aconteceu de verdade nesta base: o Prisma Client ficou dessincronizado
 * do schema e o `isDocumentTaken` lancou um erro de validacao. Erros de
 * validacao do Prisma imprimem os ARGUMENTOS da consulta, e o CPF de quem
 * estava se cadastrando apareceu por extenso no console do navegador:
 *
 *     where: { document: "52998224725", ~~~~~~~~ }
 *
 * A falha e injetada por mock, e nao provocada derrubando o banco. Uma primeira
 * versao deste teste usava `prisma.$disconnect()` e passava sem provar nada: o
 * Prisma reconecta sozinho na consulta seguinte, nenhum erro acontecia, e
 * "nada vazou" era verdade porque nada tinha dado errado. Mock e deterministico
 * e deixa a mensagem do erro ser exatamente a que se quer barrar.
 */

const CPF = "52998224725";
const CPF_FORMATADO = "529.982.247-25";
const EMAIL = "vazamento@teste.com";
const NOME = "Nome Que Nao Pode Vazar";
const SENHA = "senha-que-nao-pode-vazar";

/** Imita a forma do erro de validacao do Prisma, com os argumentos impressos. */
function erroDoPrismaComOsDados(): Error {
  const e = new Error(
    "\nInvalid `prisma.store.findUnique()` invocation in\n" +
      "  src/server/repositories/store-repository.ts:119:6\n\n" +
      "  where: {\n" +
      `    document: "${CPF}",\n` +
      "    ~~~~~~~~\n" +
      "  }\n\nUnknown argument `document`.",
  );
  e.name = "PrismaClientValidationError";
  return e;
}

vi.mock("@/server/repositories/store-repository", async (original) => {
  const real = await original<typeof import("@/server/repositories/store-repository")>();
  return {
    ...real,
    isEmailTaken: vi.fn(async () => false),
    isDocumentTaken: vi.fn(async () => {
      throw erroDoPrismaComOsDados();
    }),
  };
});

const dados = {
  storeName: "Lanchonete de Teste",
  businessType: "pizzaria",
  adminName: NOME,
  email: EMAIL,
  password: SENHA,
  whatsappNumber: "11999999999",
  document: CPF,
};

let capturado: string[] = [];
let originalError: typeof console.error;

beforeEach(() => {
  capturado = [];
  originalError = console.error;
  console.error = (...args: unknown[]) => {
    capturado.push(args.map((a) => String(a)).join(" "));
  };
});

afterEach(() => {
  console.error = originalError;
});

describe("falha antes da transacao", () => {
  it("nao devolve nem loga CPF, e-mail, nome ou senha", async () => {
    const { criarContaDeLoja } = await import("@/server/services/signup-service");
    const r = await criarContaDeLoja(dados);

    // Auto-auditoria: se a falha nao aconteceu, este teste nao esta provando
    // nada. Sem isto, um mock que parasse de funcionar faria tudo passar.
    expect(r.ok, "o mock deveria ter feito a operacao falhar").toBe(false);

    const tudoQueSaiu = JSON.stringify(r) + " " + capturado.join(" ");

    for (const segredo of [CPF, CPF_FORMATADO, EMAIL, NOME, SENHA]) {
      expect(
        tudoQueSaiu.includes(segredo),
        `vazou "${segredo.slice(0, 6)}..." na resposta ou no log`,
      ).toBe(false);
    }
  });

  it("nao expoe detalhes internos do Prisma", async () => {
    const { criarContaDeLoja } = await import("@/server/services/signup-service");
    const r = await criarContaDeLoja(dados);
    const tudoQueSaiu = JSON.stringify(r) + " " + capturado.join(" ");

    for (const interno of [
      "Invalid `",
      "findUnique",
      "store-repository",
      "Unknown argument",
      "where:",
      "prisma.",
    ]) {
      expect(tudoQueSaiu.includes(interno), `vazou "${interno}"`).toBe(false);
    }
  });

  it("devolve a mensagem amigavel, nao a do erro", async () => {
    const { criarContaDeLoja, FALHA_GENERICA } = await import(
      "@/server/services/signup-service"
    );
    const r = await criarContaDeLoja(dados);
    expect(r).toEqual({ ok: false, error: FALHA_GENERICA });
    expect(FALHA_GENERICA).toBe("Não foi possível criar a conta. Tente novamente.");
  });

  it("registra a etapa no log, mas so o nome do erro", async () => {
    const { criarContaDeLoja } = await import("@/server/services/signup-service");
    await criarContaDeLoja(dados);

    expect(capturado.length).toBeGreaterThan(0);
    const log = capturado.join(" ");
    expect(log).toContain("[signup]");
    expect(log).toContain("PrismaClientValidationError");
    // Linha curta: o nome do erro, nao a mensagem inteira com os argumentos.
    for (const linha of capturado) expect(linha.length).toBeLessThan(120);
  });

  it("a conta nao e criada quando a checagem previa falha", async () => {
    const { prisma } = await import("@/server/db/client");
    const antes = await prisma.store.count();

    const { criarContaDeLoja } = await import("@/server/services/signup-service");
    await criarContaDeLoja(dados);

    expect(await prisma.store.count()).toBe(antes);
  });
});
