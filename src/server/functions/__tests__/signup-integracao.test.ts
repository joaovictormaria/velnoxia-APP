import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarContaDeLoja,
  respostaDeCadastro,
  type DadosDoCadastro,
} from "@/server/services/signup-service";
import { dentroDoLimite } from "@/server/security/rate-limit";

/*
 * Cadastro de ponta a ponta, contra o Postgres local.
 *
 * Cada cenario consulta o banco DEPOIS de rodar. O retorno da funcao diz o que
 * ela acha que fez; so a consulta diz o que ficou gravado — e e a diferenca
 * entre os dois que revela um rollback que nao desfez, ou uma unicidade que
 * nao segurou.
 *
 * A conexao passa pelo mesmo client da aplicacao, entao a trava de
 * src/server/db/client.ts vale aqui tambem: se a DATABASE_URL apontar para
 * qualquer host que nao seja local, nenhum destes testes chega a abrir conexao.
 */

/** Gerados pela propria conta de digito verificador. Numeros sinteticos. */
const CPF = "11144477735";
const CPF_2 = "52998224725";
const CNPJ = "11222333000181";
const CNPJ_2 = "11345678000122";
const CPF_INVALIDO = "11144477734"; // verificador errado
const CNPJ_INVALIDO = "11222333000182";

function dados(sobrescreve: Partial<DadosDoCadastro> = {}): DadosDoCadastro {
  return {
    storeName: "Lanchonete de Teste",
    businessType: "pizzaria",
    adminName: "Dono de Teste",
    email: `dono${Math.random().toString(36).slice(2)}@teste.com`,
    password: "senha-de-teste",
    whatsappNumber: "11999999999",
    document: CPF,
    ...sobrescreve,
  };
}

/**
 * Esvazia o banco inteiro, sem depender de como as tabelas se referenciam.
 *
 * A primeira versao apagava so `AdminUser` e `Store`, apostando que o cascade
 * a partir de Store levaria o resto. Nem todas as foreign keys sao cascade:
 * `CompositionItem_inventoryItemId_fkey` nao e, e bastava outro teste deixar
 * uma composicao no banco para o `deleteMany` de Store ser recusado — e todos
 * os cenarios daqui falharem no beforeEach, longe da causa.
 *
 * TRUNCATE com CASCADE nao tem esse problema: ele nao pergunta a ordem, e a
 * lista de tabelas vem do proprio catalogo, entao uma tabela nova no schema
 * entra sozinha. `_prisma_migrations` fica de fora — apagar o historico faria
 * o proximo `migrate deploy` querer recriar tudo.
 */
async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  if (tabelas.length === 0) return;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await prisma.$disconnect();
});

describe("ambiente", () => {
  it("esta falando com o banco local, e nao com producao", () => {
    const host = new URL(process.env.DATABASE_URL!).hostname;
    expect(["localhost", "127.0.0.1", "::1"]).toContain(host);
  });
});

describe("1. cadastro com CPF valido", () => {
  it("cria a loja e grava o documento normalizado", async () => {
    const r = await criarContaDeLoja(dados({ document: CPF }));
    expect(r.ok).toBe(true);

    const loja = await prisma.store.findFirstOrThrow();
    expect(loja.document).toBe(CPF);
    expect(loja.documentType).toBe("CPF");
    expect(loja.status).toBe("TRIAL");
    expect(await prisma.store.count()).toBe(1);
  });
});

describe("2. cadastro com CNPJ valido", () => {
  it("cria a loja e marca o tipo como CNPJ", async () => {
    const r = await criarContaDeLoja(dados({ document: CNPJ }));
    expect(r.ok).toBe(true);

    const loja = await prisma.store.findFirstOrThrow();
    expect(loja.document).toBe(CNPJ);
    expect(loja.documentType).toBe("CNPJ");
  });
});

describe("3. CPF invalido", () => {
  it("recusa e nao deixa nada no banco", async () => {
    const r = await criarContaDeLoja(dados({ document: CPF_INVALIDO }));
    expect(r).toEqual({ ok: false, error: "Informe um CPF ou CNPJ válido." });

    expect(await prisma.store.count()).toBe(0);
    expect(await prisma.adminUser.count()).toBe(0);
  });

  it("recusa sequencia repetida", async () => {
    const r = await criarContaDeLoja(dados({ document: "11111111111" }));
    expect(r.ok).toBe(false);
    expect(await prisma.store.count()).toBe(0);
  });
});

describe("4. CNPJ invalido", () => {
  it("recusa e nao deixa nada no banco", async () => {
    const r = await criarContaDeLoja(dados({ document: CNPJ_INVALIDO }));
    expect(r).toEqual({ ok: false, error: "Informe um CPF ou CNPJ válido." });
    expect(await prisma.store.count()).toBe(0);
  });
});

describe("5. documento duplicado", () => {
  it("recusa o segundo e mantem apenas uma loja", async () => {
    const primeiro = await criarContaDeLoja(dados({ document: CPF }));
    expect(primeiro.ok).toBe(true);

    const segundo = await criarContaDeLoja(dados({ document: CPF }));
    expect(segundo).toEqual({
      ok: false,
      error: "Este CPF/CNPJ já está cadastrado em outro estabelecimento.",
    });

    expect(await prisma.store.count()).toBe(1);
    expect(await prisma.adminUser.count()).toBe(1);
  });

  it("reconhece o duplicado mesmo vindo com mascara", async () => {
    await criarContaDeLoja(dados({ document: CPF }));
    const r = await criarContaDeLoja(dados({ document: "111.444.777-35" }));
    expect(r.ok).toBe(false);
    expect(await prisma.store.count()).toBe(1);
  });
});

describe("6. e-mail duplicado", () => {
  it("recusa o segundo e nao cria loja nem admin novos", async () => {
    const email = "mesmo@teste.com";
    await criarContaDeLoja(dados({ email, document: CPF }));

    const r = await criarContaDeLoja(dados({ email, document: CNPJ }));
    expect(r).toEqual({ ok: false, error: "Já existe uma conta com este e-mail." });

    expect(await prisma.store.count()).toBe(1);
    expect(await prisma.adminUser.count()).toBe(1);
  });
});

describe("7. normalizacao para somente digitos", () => {
  it("grava so numeros, venha como vier", async () => {
    const entradas: Array<[string, string]> = [
      ["111.444.777-35", CPF],
      [" 529 982 247 25 ", CPF_2],
      ["11.222.333/0001-81", CNPJ],
      ["11a345b678c0001d22", CNPJ_2],
    ];

    for (const [digitado, esperado] of entradas) {
      await limparBanco();
      const r = await criarContaDeLoja(dados({ document: digitado }));
      expect(r.ok).toBe(true);

      const loja = await prisma.store.findFirstOrThrow();
      expect(loja.document).toBe(esperado);
      expect(loja.document).toMatch(/^[0-9]+$/);
    }
  });
});

describe("8. documentType derivado do documento", () => {
  it("11 digitos viram CPF e 14 viram CNPJ, sem o cliente opinar", async () => {
    await criarContaDeLoja(dados({ document: CPF }));
    expect((await prisma.store.findFirstOrThrow()).documentType).toBe("CPF");

    await limparBanco();
    await criarContaDeLoja(dados({ document: CNPJ }));
    expect((await prisma.store.findFirstOrThrow()).documentType).toBe("CNPJ");
  });

  it("documento e tipo nunca discordam no banco", async () => {
    await criarContaDeLoja(dados({ document: CNPJ }));
    const loja = await prisma.store.findFirstOrThrow();
    expect(loja.documentType === "CNPJ" && loja.document!.length === 14).toBe(true);
  });
});

describe("9. rollback completo", () => {
  it("nao deixa resto nenhum quando a transacao falha no ultimo passo", async () => {
    /*
     * O AdminUser e o ultimo INSERT da transacao. Fazer a colisao acontecer ali
     * — e nao antes — e o unico jeito de observar se o rollback desfaz TUDO, e
     * nao apenas o comando que falhou.
     *
     * A primeira versao deste teste criava o AdminUser obstaculo antes de
     * chamar o cadastro, e passava sem provar nada: o `isEmailTaken` pegava a
     * colisao em 14ms e a transacao nunca chegava a rodar. "Nada sobrou" era
     * verdade porque nada tinha sido criado. O teste media o proprio vazio.
     *
     * Agora o obstaculo entra DEPOIS que o cadastro ja passou pela checagem
     * previa. As medidas: a checagem previa termina por volta de 14ms e a
     * transacao inteira leva ~460ms, entao 100ms cai com folga no meio — bem
     * depois do `isEmailTaken`, bem antes do `adminUser.create`.
     *
     * Timing sozinho seria frágil, e por isso o teste se audita: se voltar a
     * falhar cedo demais, ele acusa em vez de passar em silencio.
     */
    const email = `rollback-${Date.now()}@teste.com`;

    // Se ninguem com este e-mail existe agora, a checagem previa por forca tem
    // de passar — e qualquer recusa depois so pode ter vindo de dentro da
    // transacao.
    expect(await prisma.adminUser.count({ where: { email } })).toBe(0);

    const lojaObstaculo = await prisma.store.create({
      data: { slug: "obstaculo", name: "Obstaculo" },
    });

    const inicio = Date.now();
    const promessa = criarContaDeLoja(dados({ email, document: CNPJ }));

    await new Promise((r) => setTimeout(r, 100));
    await prisma.adminUser.create({
      data: {
        storeId: lojaObstaculo.id,
        name: "Chegou primeiro",
        email,
        passwordHash: "hash",
      },
    });

    const r = await promessa;
    const duracao = Date.now() - inicio;

    /*
     * A auto-auditoria. Se o cadastro tivesse sido recusado pela checagem
     * previa, teria voltado em dezenas de milissegundos e este teste estaria
     * medindo o nada de novo.
     */
    expect(
      duracao,
      "recusa rapida demais: a transacao nao chegou a rodar, e este teste nao " +
        "esta provando rollback nenhum",
    ).toBeGreaterThan(200);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("Já existe uma conta com este e-mail.");

    // Da loja nova nao sobrou nada: nem ela, nem nenhum dos registros que a
    // transacao criou antes de quebrar.
    expect(await prisma.store.count()).toBe(1); // so o obstaculo
    expect((await prisma.store.findFirstOrThrow()).id).toBe(lojaObstaculo.id);
    expect(await prisma.adminUser.count()).toBe(1); // so o que colidiu

    expect(await prisma.storeSettings.count()).toBe(0);
    expect(await prisma.openingHour.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.categorySize.count()).toBe(0);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.productSize.count()).toBe(0);
    expect(await prisma.promotion.count()).toBe(0);
    expect(await prisma.extra.count()).toBe(0);
  });
});

describe("10. concorrencia", () => {
  it("dois cadastros simultaneos com o mesmo CPF criam exatamente uma loja", async () => {
    const [a, b] = await Promise.all([
      criarContaDeLoja(dados({ document: CPF })),
      criarContaDeLoja(dados({ document: CPF })),
    ]);

    const sucessos = [a, b].filter((r) => r.ok);
    const recusas = [a, b].filter((r) => !r.ok);

    expect(sucessos).toHaveLength(1);
    expect(recusas).toHaveLength(1);

    // A recusa fala a lingua da pessoa, nao a do Prisma.
    const erro = (recusas[0] as { ok: false; error: string }).error;
    expect(erro).toBe("Este CPF/CNPJ já está cadastrado em outro estabelecimento.");
    expect(erro).not.toMatch(/Unique constraint|P2002|Prisma/i);

    // E o banco confirma: uma loja, um dono.
    expect(await prisma.store.count()).toBe(1);
    expect(await prisma.adminUser.count()).toBe(1);
  });

  it("o mesmo vale para CNPJ", async () => {
    const rs = await Promise.all([
      criarContaDeLoja(dados({ document: CNPJ })),
      criarContaDeLoja(dados({ document: CNPJ })),
      criarContaDeLoja(dados({ document: CNPJ })),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.store.count()).toBe(1);
  });
});

describe("11. rate limit", () => {
  /*
   * A funcao `permitido` do signup le a origem da requisicao, que so existe
   * dentro do runtime do servidor. O que da para exercitar aqui e a contagem
   * em si, com a mesma janela e o mesmo maximo que o cadastro usa.
   */
  it("deixa passar 5 e barra o 6o, com a configuracao do signup", () => {
    const chave = `signup-teste-${Math.random()}`;
    const resultados = Array.from({ length: 6 }, () =>
      dentroDoLimite(chave, 5, 60_000),
    );
    expect(resultados).toEqual([true, true, true, true, true, false]);
  });

  it("chaves diferentes nao gastam o limite uma da outra", () => {
    const a = `origem-a-${Math.random()}`;
    const b = `origem-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) dentroDoLimite(a, 5, 60_000);

    expect(dentroDoLimite(a, 5, 60_000)).toBe(false);
    expect(dentroDoLimite(b, 5, 60_000)).toBe(true);
  });

  it("a janela expira e o limite volta a permitir", () => {
    const chave = `janela-${Math.random()}`;
    expect(dentroDoLimite(chave, 1, 1)).toBe(true);
    expect(dentroDoLimite(chave, 1, 1)).toBe(false);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(dentroDoLimite(chave, 1, 1)).toBe(true);
        resolve();
      }, 20);
    });
  });
});

describe("12. estrutura completa da loja", () => {
  it("cria settings, os sete horarios, o catalogo e o dono OWNER", async () => {
    const r = await criarContaDeLoja(
      dados({ storeName: "Pizzaria Completa", document: CNPJ }),
    );
    expect(r.ok).toBe(true);

    const loja = await prisma.store.findFirstOrThrow({
      include: {
        settings: { include: { openingHours: true } },
        categories: { include: { sizes: true, products: { include: { sizes: true } } } },
        promotions: true,
        extras: true,
        admins: true,
      },
    });

    expect(loja.settings).not.toBeNull();
    expect(loja.settings!.storeName).toBe("Pizzaria Completa");
    expect(loja.settings!.whatsappNumber).toBe("11999999999");

    // Sete dias, um registro por dia, sem repetir.
    expect(loja.settings!.openingHours).toHaveLength(7);
    const dias = loja.settings!.openingHours.map((h) => h.weekday);
    expect(new Set(dias).size).toBe(7);

    /*
     * A ESTRUTURA NASCE, O CARDÁPIO NÃO. A asserção era o contrário até
     * 30/08/2026 — decisão do João, opção (b): a loja nova recebe categorias e
     * nenhum produto.
     *
     * A loja vinha com dez a vinte e cinco produtos que ninguém pediu, e o
     * preço disso só apareceu quando o controle de estoque passou a nascer
     * ligado: cada produto fictício virava uma pendência exigindo receita ou
     * item de estoque para uma mercadoria que talvez nem exista na casa. O dono
     * começava apagando um cardápio que não era dele.
     */
    expect(loja.categories.length).toBeGreaterThan(0);
    const produtos = loja.categories.flatMap((c) => c.products);
    expect(produtos).toHaveLength(0);
    expect(loja.extras).toHaveLength(0);
    expect(loja.promotions).toHaveLength(0);

    /*
     * Os TAMANHOS ficam, e não são detalhe: eles pertencem à CATEGORIA, e é o
     * que faz uma pizza meia a meia casar "Grande" com "Grande" entre dois
     * sabores que o dono ainda vai cadastrar.
     */
    expect(loja.categories.some((c) => c.sizes.length > 0)).toBe(true);

    /*
     * O ESTOQUE NASCE LIGADO. Só faz sentido junto com o cardápio vazio: com
     * produtos fictícios, ligá-lo produziria uma tela de pendências no primeiro
     * login. Sem eles, não há pendência nenhuma.
     */
    expect(loja.settings!.inventoryControlEnabled).toBe(true);

    expect(loja.admins).toHaveLength(1);
    expect(loja.admins[0].role).toBe("OWNER");
    expect(loja.admins[0].name).toBe("Dono de Teste");

    // Tudo pendura na loja certa — nada de registro orfao ou de outra loja.
    const idDaLoja = loja.id;
    for (const c of loja.categories) expect(c.storeId).toBe(idDaLoja);
    for (const p of produtos) expect(p.storeId).toBe(idDaLoja);
    for (const p of loja.promotions) expect(p.storeId).toBe(idDaLoja);
    for (const e of loja.extras) expect(e.storeId).toBe(idDaLoja);
    expect(loja.admins[0].storeId).toBe(idDaLoja);
    expect(loja.settings!.storeId).toBe(idDaLoja);
  });

  it("o preco de cada tamanho aponta para um tamanho da propria categoria", async () => {
    await criarContaDeLoja(dados({ document: CPF }));
    const categorias = await prisma.category.findMany({
      include: { sizes: true, products: { include: { sizes: true } } },
    });

    for (const categoria of categorias) {
      const idsDaCategoria = new Set(categoria.sizes.map((s) => s.id));
      for (const produto of categoria.products) {
        for (const preco of produto.sizes) {
          expect(idsDaCategoria.has(preco.categorySizeId)).toBe(true);
        }
      }
    }
  });

  it("a loja nasce em TRIAL com prazo no futuro", async () => {
    const r = await criarContaDeLoja(dados({ document: CPF }));
    expect(r.ok && r.trialDays).toBe(14);

    const loja = await prisma.store.findFirstOrThrow();
    expect(loja.status).toBe("TRIAL");
    expect(loja.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("13. adminUserId para a sessao", () => {
  it("devolve um id que existe de verdade e serve para abrir sessao", async () => {
    const r = await criarContaDeLoja(dados({ document: CPF }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.adminUserId).toBeTruthy();

    /*
     * `startSessionFor` le exatamente estes dois campos para montar o cookie.
     * O cookie em si depende do contexto da requisicao e so pode ser conferido
     * num navegador; o que da para garantir aqui e que o id existe e que a
     * conta esta pronta para receber a sessao.
     */
    const dono = await prisma.adminUser.findUnique({
      where: { id: r.adminUserId },
      select: { id: true, sessionVersion: true, role: true, storeId: true },
    });
    expect(dono).not.toBeNull();
    expect(dono!.sessionVersion).toBe(0);
    expect(dono!.role).toBe("OWNER");

    const loja = await prisma.store.findFirstOrThrow();
    expect(dono!.storeId).toBe(loja.id);
    expect(r.slug).toBe(loja.slug);
  });

  it("a senha nao e gravada em texto puro", async () => {
    const r = await criarContaDeLoja(dados({ password: "senha-de-teste" }));
    expect(r.ok).toBe(true);

    const dono = await prisma.adminUser.findFirstOrThrow();
    expect(dono.passwordHash).not.toBe("senha-de-teste");
    expect(dono.passwordHash.length).toBeGreaterThan(20);
  });
});

describe("15. conta criada quando a sessao falha", () => {
  it("responde ok com sessaoAberta=false, sem desfazer a conta", async () => {
    const r = await criarContaDeLoja(dados({ document: CNPJ }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // O que a casca HTTP responderia se o startSessionFor tivesse lancado.
    const resposta = respostaDeCadastro(r, false);

    expect(resposta.ok).toBe(true);
    expect(resposta.sessaoAberta).toBe(false);
    expect(resposta.slug).toBe(r.slug);
    expect(resposta.trialDays).toBe(14);

    // A conta continua no banco — nada foi desfeito.
    expect(await prisma.store.count()).toBe(1);
    expect(await prisma.adminUser.count()).toBe(1);
    const dono = await prisma.adminUser.findFirstOrThrow();
    expect(dono.role).toBe("OWNER");

    // E o adminUserId nao desce para o navegador.
    expect(Object.keys(resposta)).not.toContain("adminUserId");
  });

  it("o caminho normal continua identico, com sessaoAberta=true", async () => {
    const r = await criarContaDeLoja(dados({ document: CPF }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const resposta = respostaDeCadastro(r, true);
    expect(resposta).toEqual({
      ok: true,
      slug: r.slug,
      trialEndsAt: r.trialEndsAt,
      trialDays: 14,
      sessaoAberta: true,
    });
  });
});
