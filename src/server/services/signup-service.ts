import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import {
  generateUniqueSlug,
  isDocumentTaken,
  isEmailTaken,
} from "../repositories/store-repository";
import { WEEKDAYS } from "../repositories/store-settings-repository";
import { getStarterCatalog } from "../catalog/starter-catalogs";
import { validateDocument } from "@/lib/document";

/**
 * A criacao da conta de loja, sem nada de HTTP.
 *
 * Mora fora do `signup.fn.ts` por um motivo concreto, e nao por organizacao: o
 * plugin do TanStack Start apaga do bundle do navegador o CORPO das funcoes
 * criadas com `createServerFn`, mas nao apaga os demais exports do mesmo
 * arquivo. Enquanto esta funcao viveu ao lado da server function, ela arrastava
 * `prisma` e `hashPassword` para o cliente — o chunk da rota de cadastro foi a
 * 167 KB com o PrismaClient e o bcrypt dentro, e a pagina morria na hidratacao
 * com "Buffer is not defined".
 *
 * Modulo separado resolve porque `signup.fn.ts` passa a importa-lo apenas de
 * dentro do handler, que e justamente a parte removida do bundle do navegador.
 */

/** Por quanto tempo uma loja nova usa o sistema antes de precisar pagar. */
export const TRIAL_DAYS = 14;

/** O que a pessoa digitou no cadastro, ja conferido pelo zod na casca HTTP. */
export type DadosDoCadastro = {
  storeName: string;
  adminName: string;
  email: string;
  password: string;
  whatsappNumber: string;
  businessType: string;
  document: string;
};

export type ResultadoDoCadastro =
  | {
      ok: true;
      slug: string;
      trialEndsAt: Date;
      trialDays: number;
      /**
       * Sai daqui para a casca abrir a sessao. Nao chega ao navegador: o
       * `createStoreAccountFn` o remove antes de responder, e nada na tela
       * precisa do id do usuario.
       */
      adminUserId: string;
    }
  | { ok: false; error: string };

/** O que dizer a quem digitou um documento que nao passa. */
const MENSAGEM_DO_ERRO = {
  VAZIO: "CPF ou CNPJ é obrigatório.",
  TAMANHO_INVALIDO: "Informe um CPF ou CNPJ válido.",
  DIGITOS_REPETIDOS: "Informe um CPF ou CNPJ válido.",
  VERIFICADOR_INVALIDO: "Informe um CPF ou CNPJ válido.",
} as const;

export const DOCUMENTO_DUPLICADO =
  "Este CPF/CNPJ já está cadastrado em outro estabelecimento.";

/** O que se diz quando a causa não interessa a quem está preenchendo o formulário. */
export const FALHA_GENERICA =
  "Não foi possível criar a conta. Tente novamente.";

/**
 * Identifica o erro sem citar seu conteúdo.
 *
 * `error.message` do Prisma inclui os argumentos da consulta — e um deles é o
 * documento. O nome da classe e o código (`P2002`, `P2025`) dizem o que
 * quebrou sem dizer com os dados de quem.
 */
function nomeDoErro(error: unknown): string {
  const e = error as { name?: string; code?: string };
  const nome = e?.name ?? "Error";
  return e?.code ? `${nome}(${e.code})` : nome;
}

/**
 * A resposta que a tela recebe, com ou sem sessão aberta.
 *
 * Existe separada da casca HTTP para poder ser testada: `startSessionFor` grava
 * cookie e só roda dentro do runtime do servidor, mas a DECISÃO de o que
 * responder quando ele falha é lógica pura.
 *
 * A regra é não mentir para os dois lados. A conta já foi criada e commitada;
 * dizer "não foi possível criar" faria a pessoa tentar de novo e bater em
 * "este CPF já está cadastrado", sem entender que a conta é dela. Então o
 * cadastro é `ok`, e o que muda é o aviso de que o login precisa ser feito à
 * mão.
 */
export function respostaDeCadastro(
  resultado: Extract<ResultadoDoCadastro, { ok: true }>,
  sessaoAberta: boolean,
) {
  return {
    ok: true as const,
    slug: resultado.slug,
    trialEndsAt: resultado.trialEndsAt,
    trialDays: resultado.trialDays,
    /**
     * `false` significa: conta criada, mas o cookie não foi gravado. A tela
     * manda para o login em vez de para o painel.
     */
    sessaoAberta,
  };
}

/**
 * Qual coluna estourou o índice único.
 *
 * `P2002` é violação de unicidade. Chega aqui quando duas pessoas mandam o
 * mesmo documento ao mesmo tempo: as duas passam pela checagem prévia antes de
 * qualquer uma gravar, e o banco recusa a segunda. É a rede que a aplicação
 * sozinha não tem.
 *
 * Olha em três lugares porque o nome da coluna muda de lugar conforme a versão
 * e o driver. A primeira escrita desta função só lia `meta.target`, que é onde
 * o Prisma clássico põe — e um teste mostrou que com o adapter `@prisma/adapter-pg`
 * do Prisma 7 aquele campo vem `undefined`, o que fazia a mensagem amigável
 * nunca aparecer e a pessoa levar o texto genérico de falha. Procurar em mais
 * de um lugar custa nada e não depende de o driver manter o formato.
 */
function violouUnicidadeDe(erro: unknown, campo: string): boolean {
  const e = erro as any;
  if (e?.code !== "P2002") return false;

  const candidatos: unknown[] = [
    // Prisma clássico, sem driver adapter.
    e.meta?.target,
    // Prisma 7 + @prisma/adapter-pg.
    e.meta?.driverAdapterError?.cause?.constraint?.fields,
    // Último recurso: a mensagem crua do Postgres, que nomeia o índice
    // (`Store_document_key`) mesmo quando os campos acima somem.
    e.meta?.driverAdapterError?.cause?.originalMessage,
    e.message,
  ];

  return candidatos.some((c) => {
    if (c == null) return false;
    const texto = Array.isArray(c) ? c.join(",") : String(c);
    return texto.includes(campo);
  });
}


/**
 * Cria o tenant e seu primeiro admin numa transação: uma loja sem dono, ou um
 * dono sem loja, seriam estados inúteis dos dois lados.
 *
 * Fica separada da server function de propósito. Tudo o que exige uma
 * requisição HTTP — o limite por origem e o cookie de sessão — mora na casca;
 * aqui só entra o que depende de dados e banco. Não é organização por gosto: a
 * server function do TanStack Start só roda dentro do runtime do servidor, com
 * o contexto no AsyncLocalStorage, e por isso não podia ser chamada de um
 * teste. Este recorte é o que torna o cadastro verificável.
 */
export async function criarContaDeLoja(
  data: DadosDoCadastro,
): Promise<ResultadoDoCadastro> {
  {
    /*
     * Validar aqui, e não confiar na máscara do formulário: o cliente é só a
     * primeira porta. Quem chama a função direto, ou desliga o JavaScript,
     * chega neste ponto com qualquer string.
     */
    const documento = validateDocument(data.document);
    if (!documento.valido) {
      return { ok: false as const, error: MENSAGEM_DO_ERRO[documento.erro] };
    }

    /*
     * As quatro operações abaixo tocam banco ou criptografia, e qualquer uma
     * pode lançar. Ficavam fora de try/catch, e o preço disso foi observado:
     * quando o Prisma Client ficou dessincronizado do schema, o
     * `isDocumentTaken` lançou um erro de validação que imprime os ARGUMENTOS
     * da consulta — e o CPF de quem estava se cadastrando apareceu por extenso
     * no console do navegador e no log do servidor.
     *
     * O catch aqui não distingue causas de propósito: falha de conexão, cliente
     * dessincronizado ou bcrypt indisponível são todas "não deu para criar a
     * conta agora" para quem está do outro lado da tela. O que não pode é a
     * mensagem crua vazar — ela carrega valores de consulta, caminho de arquivo
     * e nome de tabela.
     */
    let slug: string;
    let passwordHash: string;
    let catalog: ReturnType<typeof getStarterCatalog>;
    let trialEndsAt: Date;
    try {
      if (await isEmailTaken(data.email)) {
        return { ok: false as const, error: "Já existe uma conta com este e-mail." };
      }

      /*
       * A checagem prévia existe para a mensagem, não para a garantia — quem
       * garante é o índice único, tratado no catch da transação. Sem ela, o
       * duplicado só apareceria depois de a transação inteira rodar e ser
       * desfeita.
       */
      if (await isDocumentTaken(documento.documento)) {
        return { ok: false as const, error: DOCUMENTO_DUPLICADO };
      }

      // Derived from the store name plus a verifier code, so the owner never has
      // to pick an address and two lanchonetes with the same name never clash.
      slug = await generateUniqueSlug(data.storeName);

      catalog = getStarterCatalog(data.businessType);
      trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      passwordHash = await hashPassword(data.password);
    } catch (error) {
      /*
       * Só o nome da operação. Nem `error.message`, nem stack: a mensagem do
       * Prisma traz os argumentos da consulta, e um deles é o documento.
       */
      console.error("[signup] falha antes da transação:", nomeDoErro(error));
      return { ok: false as const, error: FALHA_GENERICA };
    }

    let adminUserId: string;
    try {
      const admin = await prisma.$transaction(
        async (tx) => {
          const store = await tx.store.create({
          data: {
            slug,
            name: data.storeName,
            businessType: data.businessType,
            /*
             * Só dígitos, e o tipo deduzido do tamanho — nunca o texto que
             * veio do formulário. O CHECK do banco recusaria a máscara de
             * qualquer forma, mas quem normaliza é esta linha.
             */
            document: documento.documento,
            documentType: documento.tipo,
            status: "TRIAL",
            trialEndsAt,
            settings: {
              create: {
                storeName: data.storeName,
                tagline: catalog.tagline,
                description: catalog.description,
                whatsappNumber: data.whatsappNumber,
                openingHours: { create: WEEKDAYS.map((weekday) => ({ weekday })) },
                /*
                 * O ESTOQUE NASCE LIGADO, e a mudança acompanha o catálogo
                 * vazio — as duas só fazem sentido juntas.
                 *
                 * Enquanto a loja nova vinha com vinte produtos que ninguém
                 * cadastrou, ligar o controle produzia vinte pendências no
                 * primeiro login: cada produto fictício exigindo receita ou
                 * item de estoque para uma mercadoria que talvez nem exista na
                 * casa. Desligado era o único default suportável, e o custo era
                 * que o controle ficava escondido atrás de uma configuração que
                 * o dono nunca ia procurar.
                 *
                 * Sem produtos, não há pendência nenhuma: a loja abre com o
                 * estoque ativo e vazio, e cada produto é classificado no
                 * momento em que é cadastrado — que é quando o dono sabe a
                 * resposta.
                 *
                 * Continua sendo reversível num clique nas Configurações. Isto
                 * é um default, não uma obrigação.
                 *
                 * SÓ VALE PARA LOJA NOVA. Nenhuma loja existente é tocada: a
                 * coluna mantém o default `false` do banco para quem já está
                 * cadastrado.
                 */
                inventoryControlEnabled: true,
              },
            },
          },
        });


        // Starter menu, in the same transaction: a store whose catalog failed
        // halfway would show a broken cardápio on its very first visit.
        for (const [i, category] of catalog.categories.entries()) {
          /**
           * A categoria e seus tamanhos nascem primeiro: o preço de cada
           * produto aponta para um tamanho da categoria, então eles precisam
           * existir antes — e é isso que garante que dois sabores de pizza
           * compartilhem exatamente o mesmo "Grande".
           */
          const created = await tx.category.create({
            data: {
              storeId: store.id,
              name: category.name,
              slug: category.slug,
              badge: category.badge ?? null,
              headline: category.headline ?? null,
              subhead: category.subhead ?? null,
              icon: category.icon,
              kind: category.kind,
              sortOrder: i + 1,
              sizes: category.sizes
                ? {
                    create: category.sizes.map((label, k) => ({ label, sortOrder: k + 1 })),
                  }
                : undefined,
            },
            include: { sizes: true },
          });

          const sizeIdByLabel = new Map(created.sizes.map((s) => [s.label, s.id]));

          for (const [j, product] of category.products.entries()) {
            await tx.product.create({
              data: {
                storeId: store.id,
                categoryId: created.id,
                name: product.name,
                slug: slugifyProduct(product.name),
                description: product.description,
                basePrice: product.basePrice,
                tag: product.tag ?? null,
                allowHalfAndHalf: product.allowHalfAndHalf ?? false,
                sortOrder: j + 1,
                sizes: product.sizes
                  ? {
                      create: product.sizes.flatMap((s) => {
                        const categorySizeId = sizeIdByLabel.get(s.label);
                        // Preço de um tamanho que a categoria não oferece é
                        // erro de catálogo; ignorar é melhor que gravar órfão.
                        return categorySizeId ? [{ categorySizeId, price: s.price }] : [];
                      }),
                    }
                  : undefined,
              },
            });
          }
        }

        if (catalog.promotions.length) {
          await tx.promotion.createMany({
            data: catalog.promotions.map((p, i) => ({
              storeId: store.id,
              eyebrow: p.eyebrow,
              title: p.title,
              description: p.description,
              discount: p.discount ?? null,
              sortOrder: i + 1,
            })),
          });
        }

        if (catalog.extras.length) {
          await tx.extra.createMany({
            data: catalog.extras.map((e) => ({ storeId: store.id, ...e })),
          });
        }

        return tx.adminUser.create({
          data: {
            storeId: store.id,
            name: data.adminName,
            email: data.email,
            passwordHash,
            role: "OWNER",
          },
          select: { id: true },
        });
        },
        { timeout: 30000 }  // 30 segundos para a transação
      );
      adminUserId = admin.id;
    } catch (error) {
      /*
       * O caso da corrida: outra requisição gravou o mesmo documento entre a
       * checagem lá em cima e este INSERT. A pessoa vê a mesma frase que veria
       * pelo caminho normal — o texto cru do Prisma não diz nada a ela, e
       * expõe nome de coluna e de índice.
       */
      if (violouUnicidadeDe(error, "document")) {
        return { ok: false as const, error: DOCUMENTO_DUPLICADO };
      }
      if (violouUnicidadeDe(error, "email")) {
        return { ok: false as const, error: "Já existe uma conta com este e-mail." };
      }

      /*
       * Só o nome e o código do erro. `error.message` do Prisma inclui os
       * argumentos da consulta — o documento entre eles — e o log do Railway
       * fica gravado. O código (`P2002`, `P2025`) basta para saber o que
       * quebrou; com quem quebrou não ajuda a depurar e é dado pessoal.
       */
      console.error("[signup] transação falhou:", nomeDoErro(error));

      return { ok: false as const, error: FALHA_GENERICA };
    }

    return {
      ok: true as const,
      slug,
      trialEndsAt,
      trialDays: TRIAL_DAYS,
      adminUserId,
    };
  }
}

/**
 * A casca HTTP do cadastro: só o que precisa da requisição.
 *
 * O limite por origem e o cookie de sessão vivem aqui porque os dois leem o
 * contexto da chamada. O resto — validação, duplicidade, transação — está em
 * `criarContaDeLoja`, que roda em qualquer lugar.
 */

/** Product slugs are unique per store, so the plain name is enough. */
function slugifyProduct(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
