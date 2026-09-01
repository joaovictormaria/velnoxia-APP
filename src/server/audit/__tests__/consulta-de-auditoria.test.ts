import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { AuditService } from "../audit-service";
import { compararValores, valorLegivel } from "@/lib/auditoria/diferenca";

/*
 * A CONSULTA DE AUDITORIA — a metade que se vende.
 *
 * REGISTRAR não depende de plano e nunca dependerá: isso é travado em
 * `billing/__tests__/guarda-auditoria.test.ts`. Aqui se cobra o outro lado —
 * que a leitura só devolva o que é DESTA loja, que ela não carregue o log
 * inteiro de uma vez, e que o antes/depois chegue à tela do jeito que foi
 * gravado.
 *
 * O ISOLAMENTO É O TESTE MAIS IMPORTANTE DESTE ARQUIVO. O `AuditLog` guarda
 * e-mail de quem operou, IP e o valor anterior de cada mudança. Uma loja lendo
 * o log de outra não seria um relatório errado — seria vazamento de dado
 * pessoal.
 */

const LOJA_A = "auditoria-consulta-a";
const LOJA_B = "auditoria-consulta-b";

async function limpar() {
  await prisma.auditLog.deleteMany({});
  await prisma.store.deleteMany({});
}

async function criarLoja(slug: string, plan: "BASIC" | "PREMIUM" | null = "PREMIUM") {
  const loja = await prisma.store.create({
    data: {
      slug,
      name: `Loja ${slug}`,
      status: "ACTIVE",
      paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      plan,
    },
    select: { id: true },
  });
  return loja.id;
}

describe("com o banco — a consulta enxerga uma loja só", () => {
  let lojaA = "";
  let lojaB = "";

  beforeEach(async () => {
    await limpar();
    lojaA = await criarLoja(LOJA_A);
    lojaB = await criarLoja(LOJA_B);

    await AuditService.log({
      storeId: lojaA,
      userId: "admin-a",
      userEmail: "dona@lojaa.com",
      action: "UPDATE",
      resource: "Product",
      resourceId: "prod-a",
      oldValue: { price: 25 },
      newValue: { price: 29.9 },
      reason: "ajuste de preço",
      ipAddress: "10.0.0.1",
    });

    await AuditService.log({
      storeId: lojaB,
      userId: "admin-b",
      userEmail: "dono@lojab.com",
      action: "DELETE",
      resource: "Employee",
      resourceId: "emp-b",
      oldValue: { name: "Fulano", salary: 3000 },
      reason: "segredo da loja B",
    });
  });

  afterAll(limpar);

  it("a loja A não vê nenhum evento da loja B", async () => {
    const eventos = await AuditService.query({ storeId: lojaA });

    expect(eventos).toHaveLength(1);
    expect(eventos[0].resourceId).toBe("prod-a");

    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toContain("emp-b");
    expect(serializado).not.toContain("dono@lojab.com");
    expect(serializado).not.toContain("segredo da loja B");
  });

  /*
   * O FILTRO NÃO É UMA PORTA DOS FUNDOS. Pedir uma ação, um recurso ou um
   * usuário que só existem na outra loja tem de devolver vazio — e não o
   * registro da outra loja, que é o que aconteceria se o `storeId` fosse
   * apenas mais um filtro opcional entre iguais.
   */
  it("filtrar por algo que só existe na loja B não traz nada para a A", async () => {
    expect(await AuditService.query({ storeId: lojaA, action: "DELETE" })).toHaveLength(0);
    expect(await AuditService.query({ storeId: lojaA, resource: "Employee" })).toHaveLength(0);
    expect(await AuditService.query({ storeId: lojaA, userId: "admin-b" })).toHaveLength(0);
  });

  it("cada loja continua vendo o que é dela", async () => {
    const deB = await AuditService.query({ storeId: lojaB, action: "DELETE" });
    expect(deB).toHaveLength(1);
    expect(deB[0].userEmail).toBe("dono@lojab.com");
  });

  it("o período recorta sem atravessar a loja", async () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(await AuditService.query({ storeId: lojaA, fromDate: amanha })).toHaveLength(0);

    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(await AuditService.query({ storeId: lojaA, fromDate: ontem })).toHaveLength(1);
  });

  /*
   * As OPÇÕES de filtro vazam tanto quanto os dados: a lista de e-mails de
   * quem opera na loja B é, por si só, informação da loja B.
   */
  it("as opções de filtro também são por loja", async () => {
    const opcoes = await AuditService.filterOptions(lojaA);

    expect(opcoes.actions).toEqual(["UPDATE"]);
    expect(opcoes.resources).toEqual(["Product"]);
    expect(opcoes.users).toEqual([{ userId: "admin-a", userEmail: "dona@lojaa.com" }]);
    expect(JSON.stringify(opcoes)).not.toContain("lojab.com");
  });

  it("o antes e o depois chegam à tela do jeito que foram gravados", async () => {
    const [evento] = await AuditService.query({ storeId: lojaA });

    expect(evento.oldValue).toEqual({ price: 25 });
    expect(evento.newValue).toEqual({ price: 29.9 });
    expect(evento.reason).toBe("ajuste de preço");
    expect(evento.ipAddress).toBe("10.0.0.1");
    expect(evento.userEmail).toBe("dona@lojaa.com");
    expect(evento.status).toBe("SUCCESS");
  });

  /*
   * Os dois campos que a consulta passou a devolver. Sem `isSystem`, um evento
   * de webhook aparece sem autor; sem `errorMessage`, uma linha FAILED mostra
   * o fracasso e esconde o motivo dele.
   */
  it("a consulta devolve isSystem e errorMessage", async () => {
    await AuditService.logError(
      {
        storeId: lojaA,
        isSystem: true,
        action: "WEBHOOK",
        resource: "Subscription",
        resourceId: "sub-1",
      },
      new Error("assinatura recusada"),
    );

    const eventos = await AuditService.query({ storeId: lojaA, action: "WEBHOOK" });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].isSystem).toBe(true);
    expect(eventos[0].status).toBe("FAILED");
    expect(eventos[0].errorMessage).toBe("assinatura recusada");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGINAÇÃO — a tela nunca carrega o log inteiro
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `AuditLog` só cresce: é a tabela que nunca é editada nem apagada. Uma tela
 * sem recorte funcionaria por seis meses e derrubaria a loja no sétimo.
 *
 * A paginação é a que o serviço já tinha (`limit`/`offset`). A server function
 * pede UM registro a mais que a página para saber se há próxima — é o que
 * evita um `count()` a cada abertura. Estes testes reproduzem exatamente essa
 * conta.
 */
describe("com o banco — paginação", () => {
  const POR_PAGINA = 25;
  let loja = "";

  beforeEach(async () => {
    await limpar();
    loja = await criarLoja("auditoria-paginacao");
    for (let i = 0; i < 30; i++) {
      await AuditService.log({
        storeId: loja,
        userEmail: "dona@loja.com",
        action: "UPDATE",
        resource: "Product",
        resourceId: `prod-${i}`,
        newValue: { posicao: i },
      });
    }
  });

  afterAll(limpar);

  const pagina = (n: number) =>
    AuditService.query({
      storeId: loja,
      limit: POR_PAGINA + 1,
      offset: n * POR_PAGINA,
    });

  it("a primeira página entrega 25 e avisa que há mais", async () => {
    const linhas = await pagina(0);
    expect(linhas.length).toBe(POR_PAGINA + 1);
    expect(linhas.slice(0, POR_PAGINA)).toHaveLength(25);
  });

  it("a última página entrega o resto e não promete uma próxima", async () => {
    const linhas = await pagina(1);
    expect(linhas.length).toBe(5);
    expect(linhas.length > POR_PAGINA).toBe(false);
  });

  it("as páginas não se repetem nem perdem evento", async () => {
    const primeira = (await pagina(0)).slice(0, POR_PAGINA).map((l) => l.id);
    const segunda = (await pagina(1)).slice(0, POR_PAGINA).map((l) => l.id);
    const todos = new Set([...primeira, ...segunda]);

    expect(primeira).toHaveLength(25);
    expect(segunda).toHaveLength(5);
    expect(todos.size).toBe(30);
  });

  it("uma página além do fim é vazia, e não um erro", async () => {
    expect(await pagina(9)).toHaveLength(0);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O ANTES E O DEPOIS, CAMPO A CAMPO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("a comparação que a tela mostra", () => {
  it("mostra só o que mudou", () => {
    const mudancas = compararValores(
      { price: 25, name: "Pizza", active: true },
      { price: 29.9, name: "Pizza", active: true },
    );
    expect(mudancas).toEqual([{ campo: "price", antes: "25", depois: "29.9" }]);
  });

  it("um campo que nasceu, e um que sumiu", () => {
    const mudancas = compararValores({ antigo: 1 }, { novo: 2 });
    expect(mudancas).toEqual([
      { campo: "antigo", antes: "1", depois: "—" },
      { campo: "novo", antes: "—", depois: "2" },
    ]);
  });

  it("criação e exclusão: um dos lados é vazio", () => {
    expect(compararValores(null, { name: "Novo" })).toEqual([
      { campo: "name", antes: "—", depois: "Novo" },
    ]);
    expect(compararValores({ name: "Antigo" }, null)).toEqual([
      { campo: "name", antes: "Antigo", depois: "—" },
    ]);
  });

  it("nada mudou, nada a mostrar", () => {
    expect(compararValores({ price: 10 }, { price: 10 })).toEqual([]);
    expect(compararValores(null, null)).toEqual([]);
  });

  /*
   * Nem todo valor gravado é um objeto de campos. Fingir uma tabela de
   * "campo / antes / depois" para um array seria inventar estrutura onde não
   * há — mostra-se uma linha só.
   */
  it("valor que não é objeto vira uma linha só", () => {
    expect(compararValores([1, 2], [1, 2, 3])).toEqual([
      { campo: "valor", antes: "[1,2]", depois: "[1,2,3]" },
    ]);
  });

  it("booleano é lido em português, não como true/false", () => {
    expect(valorLegivel(true)).toBe("sim");
    expect(valorLegivel(false)).toBe("não");
    expect(valorLegivel(null)).toBe("—");
    expect(valorLegivel(undefined)).toBe("—");
  });

  it("objeto aninhado grande não vira uma parede na célula", () => {
    const texto = valorLegivel({ lixo: "x".repeat(500) });
    expect(texto.length).toBeLessThanOrEqual(161);
    expect(texto.endsWith("…")).toBe(true);
  });

  it("o antes/depois real do estoque é legível", () => {
    expect(
      compararValores({ quantityOnHand: 10 }, { quantityOnHand: 4 }),
    ).toEqual([{ campo: "quantityOnHand", antes: "10", depois: "4" }]);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CONTRATO DO CÓDIGO — a fonte, lida
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("contrato da superfície de auditoria", () => {
  const fonte = (caminho: string) =>
    readFileSync(resolve(__dirname, "../../..", caminho), "utf8");

  const porta = fonte("server/functions/auditoria.fn.ts");
  const rota = fonte("routes/admin/auditoria/index.tsx");
  const sidebar = fonte("components/admin/layout/AdminSidebar.tsx");

  /** O corpo de uma server function, para a asserção não pegar a vizinha. */
  function bloco(codigo: string, nome: string) {
    const i = codigo.indexOf(`export const ${nome} = createServerFn`);
    expect(i, nome).toBeGreaterThan(-1);
    const f = codigo.indexOf("export const ", i + 10);
    return f < 0 ? codigo.slice(i) : codigo.slice(i, f);
  }

  it("as duas funções de consulta exigem AUDITORIA", () => {
    expect(bloco(porta, "listarAuditoriaFn")).toContain('exigirRecurso("AUDITORIA")');
    expect(bloco(porta, "filtrosDeAuditoriaFn")).toContain('exigirRecurso("AUDITORIA")');
  });

  it("não existe nenhuma outra server function no arquivo", () => {
    const criadas = [...porta.matchAll(/export const (\w+) = createServerFn/g)].map(
      (m) => m[1],
    );
    expect(criadas.sort()).toEqual(["filtrosDeAuditoriaFn", "listarAuditoriaFn"]);
  });

  /*
   * O RECORTE DE LOJA NÃO PODE VIR DO CLIENTE. Não basta o handler usar
   * `admin.storeId`: se o validador aceitasse um `storeId`, bastaria alguém
   * repassá-lo adiante um dia. O campo não existe.
   */
  it("o cliente não tem como pedir outra loja", () => {
    expect(porta).not.toMatch(/storeId:\s*z\./);
    expect(porta).toContain("storeId: admin.storeId");
  });

  /*
   * A asserção mira a CHAMADA, e não o texto: o cabeçalho do arquivo cita
   * `AuditService.log` justamente para explicar que ele NÃO é chamado aqui.
   * Casar com o nome solto reprovaria o comentário que documenta a regra.
   */
  it("a porta não escreve nada", () => {
    expect(porta).not.toMatch(/AuditService\.log(Error)?\s*\(/);
    expect(porta).toMatch(/AuditService\.query\s*\(/);
  });

  it("a rota é paga por AUDITORIA", () => {
    expect(rota).toContain('rotaPremium("AUDITORIA"');
    // A guarda substitui a definição crua: não pode sobrar um `component:`
    // solto que renderize a tela paga sem passar por ela.
    expect(rota).not.toMatch(/createFileRoute\([^)]*\)\(\{\s*component:/);
  });

  it("a barra lateral tem o item, e ele não traz regra própria", () => {
    expect(sidebar).toContain('to: "/admin/auditoria"');
    expect(sidebar).toContain('label: "Auditoria"');
    expect(sidebar).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });

  it("nem a porta nem a tela comparam plano na mão", () => {
    for (const [nome, codigo] of [
      ["auditoria.fn.ts", porta],
      ["routes/admin/auditoria", rota],
    ] as const) {
      expect(codigo, nome).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
      expect(codigo, nome).not.toContain("RECURSOS_DO_PLANO");
    }
  });

  it("a comparação do antes/depois mora fora da tela, e só uma vez", () => {
    expect(rota).toContain('from "@/lib/auditoria/diferenca"');
    expect(rota).not.toContain("function compararValores");
  });
});
