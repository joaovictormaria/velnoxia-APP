import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { ROTULO_DO_PLANO } from "@/lib/planos/catalogo";
import {
  cabeNoLimite,
  SUBSTANTIVO_DO_LIMITE,
  tetoDoEstado,
  type Limite,
} from "@/lib/planos/limites";
import { estadoComercialDaLoja, type LojaParaPlano } from "./plano-da-loja";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A GUARDA DE QUANTIDADE — um lugar só, para os dois limites
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── ISTO NÃO É A GUARDA DE RECURSO ────────────────────────────────────────
 *
 * `guarda-de-recurso.ts` responde "o plano TEM Cardápio?". Esta responde
 * "cabe mais um produto?". São perguntas diferentes sobre o mesmo módulo, e o
 * BASIC responde SIM à primeira e NÃO à segunda a partir do 51º produto.
 * Fundi-las obrigaria a dizer que o BASIC não tem cardápio, que é falso.
 *
 * ─── NENHUM NÚMERO MORA AQUI ───────────────────────────────────────────────
 *
 * Não há `50`, não há `10` e não há `if (plano === "BASIC")`. O teto vem de
 * `tetoDoEstado()`, o veredito de `cabeNoLimite()` e o nome do plano de
 * `ROTULO_DO_PLANO` — as mesmas fontes que a matriz comercial usa. Mudar o
 * plano vendido é editar `limites.ts`, e este arquivo não muda.
 *
 * ─── POR QUE EXIGE UMA TRANSAÇÃO ───────────────────────────────────────────
 *
 * Contar e depois inserir são duas operações. Entre uma e outra cabe outra
 * requisição fazendo a mesma coisa, e as duas veriam 49 — o teto de 50
 * viraria 51 com dois cliques simultâneos. Ver `travarLoja` abaixo.
 */

type Db = Prisma.TransactionClient;

/** As colunas que decidem o plano. Nenhuma a mais entra na consulta. */
const CAMPOS_DO_PLANO = {
  status: true,
  trialEndsAt: true,
  paidUntil: true,
  subscriptionStatus: true,
  plan: true,
} as const;

/**
 * COMO CADA LIMITE É CONTADO — e a regra não foi inventada aqui.
 *
 * `deletedAt: null` é o recorte do PRÓPRIO modelo: `Product` e `Category` têm
 * a coluna, e `SoftDeleteService` é quem a preenche. Hoje ela é sempre nula,
 * porque `deleteProductFn` e `deleteCategoryFn` apagam de verdade
 * (`prisma.product.delete`) — o soft delete existe no esquema e não está
 * ligado a nenhum botão. Escrever o filtro assim mesmo custa nada e faz a
 * contagem acompanhar a coluna no dia em que ela for ligada.
 *
 * NÃO se filtra por `isActive`. Um produto desligado continua ocupando o
 * cardápio: aparece na listagem do painel, é editável e volta com um clique.
 * Contar só os ativos daria ao BASIC um cardápio infinito — bastaria desligar
 * um produto para caber outro, e ligar os dois de volta depois.
 */
const CONTAGEM_DO_LIMITE: Readonly<
  Record<Limite, (db: Db, storeId: string) => Promise<number>>
> = {
  MAX_PRODUTOS: (db, storeId) => db.product.count({ where: { storeId, deletedAt: null } }),
  MAX_CATEGORIAS: (db, storeId) => db.category.count({ where: { storeId, deletedAt: null } }),
};

/**
 * O plano não cabe mais um.
 *
 * A mensagem é de produto, não de sistema: diz o plano, o teto e o que está
 * sendo contado. Nada de Prisma, SQL, stack nem nome de coluna.
 */
export class LimiteDoPlanoError extends Error {
  readonly teto: number;

  constructor(
    readonly limite: Limite,
    rotuloDoPlano: string,
    teto: number,
  ) {
    super(`Seu plano ${rotuloDoPlano} permite até ${teto} ${SUBSTANTIVO_DO_LIMITE[limite]}.`);
    this.name = "LimiteDoPlanoError";
    this.teto = teto;
  }
}

/**
 * Serializa as criações DESTA loja para ESTE limite, e só até o fim da
 * transação.
 *
 * `pg_advisory_xact_lock` foi escolhido em vez de `SELECT … FOR UPDATE` na
 * linha da loja porque não bloqueia ninguém que só queira ATUALIZAR a loja —
 * assinatura, configurações, o webhook do Stripe. Duas criações de produto da
 * mesma loja esperam uma pela outra; todo o resto do sistema segue.
 *
 * A chave tem duas metades: a loja e o limite. Criar um produto e criar uma
 * categoria ao mesmo tempo não disputam nada.
 *
 * O lock é liberado pelo COMMIT ou pelo ROLLBACK — não há o que soltar à mão,
 * e uma exceção no meio não deixa a loja travada.
 */
async function travarLoja(db: Db, storeId: string, limite: Limite): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storeId}), hashtext(${limite}))`;
}

/**
 * Cabe mais um? Se não couber, recusa com uma frase que o lojista entende.
 *
 * EXIGE UMA TRANSAÇÃO, e o tipo cobra isso: `Prisma.TransactionClient` não
 * aceita o cliente solto. Chamar isto fora de uma transação daria uma trava
 * que se solta no instante seguinte e uma contagem que envelhece antes da
 * inserção — a aparência da proteção, sem a proteção.
 *
 * TRÊS RESPOSTAS, e duas delas passam:
 *   CABE       → Premium, TRIAL (efetivo Premium) ou BASIC ainda com folga.
 *   INDEFINIDO → loja legada, `plan = null` e fora do teste. Passa, pela mesma
 *                regra transitória das features: não se classifica uma loja
 *                comercialmente por omissão. Ver `guarda-de-recurso.ts`.
 *   ESTOUROU   → recusa.
 */
export async function garantirLimite(
  db: Db,
  storeId: string,
  limite: Limite,
): Promise<void> {
  await travarLoja(db, storeId, limite);

  const loja = await db.store.findUniqueOrThrow({
    where: { id: storeId },
    select: CAMPOS_DO_PLANO,
  });

  const estado = estadoComercialDaLoja(loja as LojaParaPlano);
  const teto = tetoDoEstado(estado, limite);

  // Ilimitado e legado nem contam: a contagem só existe para comparar com um
  // número, e nos dois casos não há número com que comparar.
  if (teto === null || teto === "INDEFINIDO" || teto === "A_DEFINIR") return;

  const uso = await CONTAGEM_DO_LIMITE[limite](db, storeId);

  if (cabeNoLimite(teto, uso) === "ESTOUROU") {
    const plano = estado.efetivo;
    throw new LimiteDoPlanoError(
      limite,
      plano ? ROTULO_DO_PLANO[plano] : "atual",
      teto,
    );
  }
}

/**
 * Quanto desta loja já foi usado, e qual o teto — para quem quer MOSTRAR, não
 * recusar.
 *
 * Sem trava e fora de transação de propósito: é leitura para tela ("40 de
 * 50"). Decidir com isto seria decidir com um número que já pode ter mudado;
 * quem decide é `garantirLimite`.
 */
export async function usoDoLimite(storeId: string, limite: Limite) {
  const loja = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: CAMPOS_DO_PLANO,
  });

  const estado = estadoComercialDaLoja(loja as LojaParaPlano);
  const uso = await CONTAGEM_DO_LIMITE[limite](prisma as unknown as Db, storeId);
  const teto = tetoDoEstado(estado, limite);

  return { uso, teto, veredito: cabeNoLimite(teto, uso) };
}
