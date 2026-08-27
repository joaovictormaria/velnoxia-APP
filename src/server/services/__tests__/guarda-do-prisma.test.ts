import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — modulo .mjs de ferramenta de dev, sem tipos
import { avaliarSchema, conferirAgora } from "../../../../scripts/guarda-do-prisma.mjs";

/*
 * O guarda que impede o servidor de dev rodar com um Prisma Client velho.
 *
 * DOIS ERROS REAIS, A MESMA FAMILIA. `undefined.findMany`, quando um MODELO
 * nasceu com o servidor no ar; e `Unknown argument purchasePackSize`, quando um
 * CAMPO nasceu com o servidor no ar. A checagem antiga, que le
 * `Prisma.ModelName`, pegou o primeiro e passou verde no segundo.
 */

const T0 = Date.parse("2026-08-27T11:37:00Z");
const T1 = Date.parse("2026-08-27T11:49:00Z");

const SCHEMA_ANTES = `
model InventoryItem {
  id     String  @id
  name   String
  cost   Decimal?
}
`;
const SCHEMA_DEPOIS = `
model InventoryItem {
  id               String  @id
  name             String
  cost             Decimal?
  purchasePackSize Decimal?
}
`;

describe("o veredito, isolado", () => {
  it("01 · schema mais ANTIGO que o client passa", () => {
    const r = avaliarSchema({
      schemaMtimeMs: T0, clientMtimeMs: T1,
      schemaConteudo: SCHEMA_ANTES, clientConteudo: SCHEMA_ANTES,
    });
    expect(r.ok).toBe(true);
  });

  it("02 · schema mais NOVO que o client reprova", () => {
    const r = avaliarSchema({
      schemaMtimeMs: T1, clientMtimeMs: T0,
      schemaConteudo: SCHEMA_DEPOIS, clientConteudo: SCHEMA_ANTES,
    });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/desatualizado em relação ao schema/);
    expect(r.mensagem).toMatch(/npx prisma generate/);
    expect(r.mensagem).toMatch(/REINICIE/);
  });

  it("03 · timestamps IGUAIS passam", () => {
    const r = avaliarSchema({
      schemaMtimeMs: T0, clientMtimeMs: T0,
      schemaConteudo: SCHEMA_ANTES, clientConteudo: SCHEMA_ANTES,
    });
    expect(r.ok).toBe(true);
  });

  it("04 · MODELO ausente no client continua sendo detectado", () => {
    const r = avaliarSchema({
      schemaMtimeMs: T1, clientMtimeMs: T0,
      schemaConteudo: SCHEMA_ANTES + "\nmodel ProductionRun {\n  id String @id\n}\n",
      clientConteudo: SCHEMA_ANTES,
    });
    expect(r.ok).toBe(false);
    expect(r.diferencas).toContain("modelo ProductionRun");
  });

  it("05 · CAMPO novo apos a geracao e detectado e NOMEADO", () => {
    // O caso que a checagem por `Prisma.ModelName` deixava passar: o modelo
    // existe nos dois lados, so o campo e novo.
    const r = avaliarSchema({
      schemaMtimeMs: T1, clientMtimeMs: T0,
      schemaConteudo: SCHEMA_DEPOIS, clientConteudo: SCHEMA_ANTES,
    });
    expect(r.ok).toBe(false);
    expect(r.diferencas).toContain("InventoryItem.purchasePackSize");
  });

  it("06 · a mensagem diz as duas datas e que precisa reiniciar", () => {
    const r = avaliarSchema({
      schemaMtimeMs: T1, clientMtimeMs: T0,
      schemaConteudo: SCHEMA_DEPOIS, clientConteudo: SCHEMA_ANTES,
    });
    expect(r.mensagem).toMatch(/schema alterado em: 2026-08-27 11:49/);
    expect(r.mensagem).toMatch(/client gerado em:   2026-08-27 11:37/);
    expect(r.mensagem).toMatch(/segura o client antigo em memória/);
  });

  it("07 · client ausente reprova, sem fingir que esta tudo bem", () => {
    const r = avaliarSchema({
      schemaMtimeMs: T1, clientMtimeMs: null,
      schemaConteudo: SCHEMA_DEPOIS, clientConteudo: null,
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem-client");
  });

  it("08 · o mtime e o veredito: schema tocado sem mudar conteudo reprova", () => {
    /*
     * De proposito. `prisma generate` e idempotente e custa segundos; um falso
     * positivo custa isso. Um falso negativo custa a tarde perseguindo um erro
     * do Prisma que nao tem nada a ver com o codigo.
     */
    const r = avaliarSchema({
      schemaMtimeMs: T1, clientMtimeMs: T0,
      schemaConteudo: SCHEMA_ANTES, clientConteudo: SCHEMA_ANTES,
    });
    expect(r.ok).toBe(false);
    expect(r.diferencas).toEqual([]);
  });
});

describe("contra o filesystem, reproduzindo o erro real", () => {
  const criados: string[] = [];
  afterEach(() => { criados.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });

  const montar = (schema: string, copia: string | null) => {
    const raiz = mkdtempSync(join(tmpdir(), "guarda-"));
    criados.push(raiz);
    mkdirSync(join(raiz, "prisma"), { recursive: true });
    writeFileSync(join(raiz, "prisma/schema.prisma"), schema);
    if (copia !== null) {
      const d = join(raiz, "node_modules/.prisma/client");
      mkdirSync(d, { recursive: true });
      const p = join(d, "schema.prisma");
      writeFileSync(p, copia);
      // client gerado ANTES; schema tocado DEPOIS
      utimesSync(p, new Date(T0), new Date(T0));
      utimesSync(join(raiz, "prisma/schema.prisma"), new Date(T1), new Date(T1));
    }
    return raiz;
  };

  it("09 · purchasePackSize no schema, ausente no client gerado", () => {
    // Exatamente o que aconteceu: o servidor subiu 11:37, o campo nasceu 11:49,
    // e o `create()` morreu em "Unknown argument purchasePackSize".
    const r = conferirAgora(montar(SCHEMA_DEPOIS, SCHEMA_ANTES));
    expect(r.ok).toBe(false);
    expect(r.diferencas).toContain("InventoryItem.purchasePackSize");
    expect(r.mensagem).toMatch(/REINICIE o servidor de desenvolvimento/);
  });

  it("10 · schema e client iguais e em dia: passa", () => {
    const raiz = montar(SCHEMA_ANTES, SCHEMA_ANTES);
    utimesSync(join(raiz, "prisma/schema.prisma"), new Date(T0), new Date(T0));
    expect(conferirAgora(raiz).ok).toBe(true);
  });

  it("11 · sem client gerado, reprova", () => {
    expect(conferirAgora(montar(SCHEMA_DEPOIS, null)).ok).toBe(false);
  });

  it("12 · o projeto de verdade esta em dia", () => {
    // Se este quebrar, o client do repo precisa de `npx prisma generate`.
    expect(conferirAgora(process.cwd()).ok).toBe(true);
  });
});
