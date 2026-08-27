import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { numeros } from "./serializar";
import {
  criarReceitaDePreparadoSchema,
  atualizarReceitaDePreparadoSchema,
} from "@/lib/estoque-schemas";

/**
 * A porta de entrada da aba Preparados.
 *
 * Camada fina de propósito: cada handler autentica, valida a forma e delega. A
 * regra de negócio mora nos serviços das Etapas 5, 6 e 8 — duplicá-la aqui
 * criaria um segundo lugar para ela divergir, e é exatamente o que o motor
 * velho fazia antes de sair na Etapa 5.
 *
 * Todo retorno passa por `numeros()`: Decimal não atravessa a fronteira da
 * server function, e o tipo que chega ao cliente colapsa para `{}` se ele
 * atravessar.
 */

/** Preparados da loja, com saldo, disponível, custo e a receita que vale. */
export const adminListarPreparados = createServerFn({ method: "POST" }).handler(
  async () => {
    const admin = await requireAdminSession();
    const { prisma } = await import("@/server/db/client");

    const itens = await prisma.inventoryItem.findMany({
      where: { storeId: admin.storeId, itemType: "PREPARED", isActive: true },
      orderBy: { name: "asc" },
      include: {
        baseUnit: true,
        receitas: {
          where: { isActive: true },
          orderBy: { version: "desc" },
          take: 1,
          include: {
            yieldUnit: true,
            items: { include: { inventoryItem: true, unit: true }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });

    return numeros(
      itens.map((item) => {
        const receita = item.receitas[0] ?? null;
        return {
          id: item.id,
          nome: item.name,
          sku: item.sku,
          unidade: item.baseUnit.code,
          baseUnitId: item.baseUnitId,
          emEstoque: item.quantityOnHand,
          reservado: item.quantityReserved,
          // O que ainda pode ser prometido a um pedido novo.
          disponivel: Number(item.quantityOnHand) - Number(item.quantityReserved),
          custo: item.cost,
          receita: receita
            ? {
                id: receita.id,
                versao: receita.version,
                rendimento: receita.yieldQuantity,
                unidadeDoRendimento: receita.yieldUnit?.code ?? null,
                yieldUnitId: receita.yieldUnitId,
                insumos: receita.items.map((i) => ({
                  id: i.id,
                  inventoryItemId: i.inventoryItemId,
                  nome: i.inventoryItem.name,
                  quantidade: i.quantity,
                  unitId: i.unitId,
                  unidade: i.unit.code,
                })),
              }
            : null,
        };
      }),
    );
  },
);

/** Insumos que podem entrar numa ficha, e as unidades disponíveis. */
export const adminOpcoesDePreparado = createServerFn({ method: "POST" }).handler(
  async () => {
    const admin = await requireAdminSession();
    const { prisma } = await import("@/server/db/client");

    const [itens, unidades] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { storeId: admin.storeId, isActive: true },
        orderBy: { name: "asc" },
        include: { baseUnit: true },
      }),
      prisma.inventoryUnit.findMany({ orderBy: { code: "asc" } }),
    ]);

    return numeros({
      insumos: itens.map((i) => ({
        id: i.id,
        nome: i.name,
        tipo: i.itemType,
        unidade: i.baseUnit.code,
        baseUnitId: i.baseUnitId,
        custo: i.cost,
      })),
      unidades: unidades.map((u) => ({ id: u.id, code: u.code, name: u.name })),
    });
  },
);

export const adminCriarPreparado = createServerFn({ method: "POST" })
  .validator(
    z.object({
      nome: z.string().min(1).max(255),
      baseUnitId: z.string().min(1),
      sku: z.string().max(50).nullish(),
      receita: criarReceitaDePreparadoSchema,
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const { CompositionService } = await import("@/server/services/composition-service");
    return numeros(await CompositionService.criarPreparadoComReceita(admin.storeId, data));
  });

export const adminAtualizarReceitaDePreparado = createServerFn({ method: "POST" })
  .validator(
    z.object({
      compositionId: z.string().min(1),
      dados: atualizarReceitaDePreparadoSchema,
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const { CompositionService } = await import("@/server/services/composition-service");
    return numeros(
      await CompositionService.atualizarReceitaDePreparado(
        admin.storeId,
        data.compositionId,
        data.dados,
      ),
    );
  });

export const adminProduzir = createServerFn({ method: "POST" })
  .validator(
    z.object({
      compositionId: z.string().min(1),
      plannedQuantity: z.number().positive(),
      producedQuantity: z.number().positive(),
      lossQuantity: z.number().nonnegative().optional(),
      /**
       * Gerado pelo NAVEGADOR, uma vez por clique em "Produzir".
       *
       * É o que separa "a mesma produção, repetida por falha de rede" de "uma
       * segunda panela, de propósito" — os dois casos chegam aqui com payloads
       * idênticos, e nenhum valor derivável no servidor os distingue.
       */
      runToken: z.string().min(8).max(100),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const { ProducaoService } = await import("@/server/services/producao-service");
    return numeros(
      await ProducaoService.produzir(admin.storeId, {
        ...data,
        autor: { authorType: "ADMIN", authorId: admin.id, authorName: admin.name },
      }),
    );
  });

export const adminHistoricoDeProducao = createServerFn({ method: "POST" })
  .validator(
    z.object({
      inventoryItemId: z.string().min(1).optional(),
      limite: z.number().int().positive().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const { ProducaoService } = await import("@/server/services/producao-service");
    return numeros(await ProducaoService.historico(admin.storeId, data));
  });

export const adminReverterProducao = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();
    const { ProducaoService } = await import("@/server/services/producao-service");
    return numeros(await ProducaoService.reverter(admin.storeId, data.runId, admin.id));
  });
