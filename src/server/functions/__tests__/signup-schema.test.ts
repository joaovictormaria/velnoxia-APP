import { describe, it, expect } from "vitest";
import { signupSchema } from "@/server/functions/signup.fn";

/*
 * As regras do zod na porta de entrada do cadastro.
 *
 * Testadas pelo schema, e nao pela server function: aquela so roda dentro do
 * runtime do TanStack Start, com o contexto da requisicao no AsyncLocalStorage.
 * O schema e o mesmo objeto que o `.validator()` usa, entao o que passa aqui e
 * exatamente o que passa em producao.
 */

const CPF = "11144477735";
const CNPJ = "11222333000181";

function base(sobrescreve: Record<string, unknown> = {}) {
  return {
    storeName: "Lanchonete de Teste",
    businessType: "pizzaria",
    adminName: "Dono de Teste",
    email: "dono@teste.com",
    password: "senha-de-teste",
    whatsappNumber: "11999999999",
    document: CPF,
    ...sobrescreve,
  };
}

describe("signupSchema — campo document", () => {
  it("aceita CPF sem mascara", () => {
    const r = signupSchema.safeParse(base({ document: CPF }));
    expect(r.success).toBe(true);
    expect(r.success && r.data.document).toBe(CPF);
  });

  it("aceita CPF com mascara — normalizar e trabalho do servidor, nao do zod", () => {
    const r = signupSchema.safeParse(base({ document: "111.444.777-35" }));
    expect(r.success).toBe(true);
    expect(r.success && r.data.document).toBe("111.444.777-35");
  });

  it("aceita CNPJ sem mascara", () => {
    const r = signupSchema.safeParse(base({ document: CNPJ }));
    expect(r.success).toBe(true);
    expect(r.success && r.data.document).toBe(CNPJ);
  });

  it("aceita CNPJ com mascara (18 caracteres, dentro do teto de 20)", () => {
    const formatado = "11.222.333/0001-81";
    expect(formatado.length).toBe(18);
    expect(signupSchema.safeParse(base({ document: formatado })).success).toBe(true);
  });

  it("recusa documento vazio", () => {
    const r = signupSchema.safeParse(base({ document: "" }));
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]?.message).toBe(
      "Informe o CPF ou CNPJ.",
    );
  });

  it("recusa string so de espacos — o trim roda antes do min", () => {
    expect(signupSchema.safeParse(base({ document: "     " })).success).toBe(false);
  });

  it("recusa documento acima de 20 caracteres", () => {
    const r = signupSchema.safeParse(base({ document: "1".repeat(21) }));
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]?.message).toBe(
      "Informe um CPF ou CNPJ válido.",
    );
  });

  it("recusa carga grande sem processa-la", () => {
    // O teto existe para isto: sem ele, um megabyte passaria pelo zod e so
    // seria recusado depois de percorrer regex e normalizacao.
    expect(signupSchema.safeParse(base({ document: "9".repeat(1_000_000) })).success).toBe(
      false,
    );
  });

  it("aceita exatamente 20 caracteres, o limite", () => {
    expect(signupSchema.safeParse(base({ document: "1".repeat(20) })).success).toBe(true);
  });

  it("recusa quando o campo nem vem", () => {
    const semDocumento = base();
    delete (semDocumento as Record<string, unknown>).document;
    expect(signupSchema.safeParse(semDocumento).success).toBe(false);
  });
});

describe("signupSchema — os demais campos seguem como estavam", () => {
  it("nao ganhou teto: storeName longo continua aceito", () => {
    expect(signupSchema.safeParse(base({ storeName: "x".repeat(500) })).success).toBe(
      true,
    );
  });

  it("email invalido continua recusado", () => {
    expect(signupSchema.safeParse(base({ email: "sem-arroba" })).success).toBe(false);
  });

  it("senha curta continua recusada", () => {
    expect(signupSchema.safeParse(base({ password: "1234567" })).success).toBe(false);
  });
});
