import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import type { PlanoDeBeneficio, UsoDoDia } from "../services/employee-benefit";

/**
 * Aceita tanto o cliente normal quanto o de dentro de uma transação: a cota do
 * dia é lida duas vezes — na prévia do carrinho e outra vez dentro da
 * transação que cria o pedido — e a segunda leitura precisa enxergar o mesmo
 * que a escrita que vem logo em seguida.
 */
type ClientePrisma = typeof prisma | Prisma.TransactionClient;

/*
 * O dia é o dia do relógio do servidor, como no dashboard
 * (`dashboard-service.ts`). Não é um detalhe indiferente — uma cota "do dia"
 * calculada num fuso e um faturamento "do dia" calculado noutro discordariam
 * na virada —, e por isso a regra é a mesma dos dois lados.
 */
function inicioDoDia(referencia = new Date()): Date {
  const d = new Date(referencia);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(referencia = new Date()): Date {
  const d = new Date(referencia);
  d.setHours(23, 59, 59, 999);
  return d;
}

const PLANO_COMPLETO = {
  select: {
    id: true,
    name: true,
    defaultType: true,
    defaultValue: true,
    limitMode: true,
    limitValue: true,
    allowPayroll: true,
    isActive: true,
    rules: {
      select: {
        categoryId: true,
        productId: true,
        type: true,
        value: true,
        dailyLimit: true,
      },
    },
  },
} as const;

export type FuncionarioReconhecido = {
  id: string;
  name: string;
  pinHash: string;
  plano: (PlanoDeBeneficio & { id: string; allowPayroll: boolean }) | null;
};

/**
 * Quem é o dono daquele telefone nesta loja, se for funcionário.
 *
 * Só quem está ativo: desligar alguém tem de tirar o benefício no mesmo
 * instante, sem depender de apagar a ficha. Um plano desativado também não
 * vale — é assim que o dono suspende o benefício de um grupo inteiro sem
 * mexer em cada pessoa.
 */
export async function findEmployeeForCheckout(
  client: ClientePrisma,
  storeId: string,
  phone: string,
): Promise<FuncionarioReconhecido | null> {
  const funcionario = await client.employee.findFirst({
    where: { storeId, phone, isActive: true },
    select: { id: true, name: true, pinHash: true, plan: PLANO_COMPLETO },
  });
  if (!funcionario) return null;

  const plano = funcionario.plan;
  return {
    id: funcionario.id,
    name: funcionario.name,
    pinHash: funcionario.pinHash,
    plano: plano && plano.isActive ? plano : null,
  };
}

/**
 * Quanto da cota de hoje já foi gasto.
 *
 * Sai dos próprios pedidos — não existe tabela de consumo. Isso é de propósito:
 * o funcionário compra como cliente, o dinheiro entra pelo pedido, e um segundo
 * registro paralelo só criaria a chance de os dois discordarem. Cancelado não
 * conta: o que ele desistiu de comprar não pode ter comido a cota do dia.
 */
export async function lerUsoDoDia(
  client: ClientePrisma,
  storeId: string,
  employeeId: string,
  referencia = new Date(),
): Promise<UsoDoDia> {
  const itens = await client.orderItem.findMany({
    where: {
      benefitQuantity: { gt: 0 },
      order: {
        storeId,
        employeeId,
        status: { not: "CANCELLED" },
        createdAt: { gte: inicioDoDia(referencia), lte: fimDoDia(referencia) },
      },
    },
    select: {
      benefitQuantity: true,
      unitPrice: true,
      product: { select: { categoryId: true } },
    },
  });

  const uso: UsoDoDia = { itens: 0, valor: 0, porCategoria: {} };
  for (const item of itens) {
    uso.itens += item.benefitQuantity;
    uso.valor += item.unitPrice * item.benefitQuantity;
    // O produto pode ter sido apagado depois (SetNull). O consumo continua
    // contando nos totais; só não há mais categoria a que atribuí-lo.
    const categoria = item.product?.categoryId;
    if (categoria) {
      uso.porCategoria[categoria] = (uso.porCategoria[categoria] ?? 0) + item.benefitQuantity;
    }
  }
  uso.valor = Math.round(uso.valor * 100) / 100;
  return uso;
}

// ---------- Painel ----------

export type FuncionarioDaLista = {
  id: string;
  name: string;
  jobTitle: string | null;
  phone: string;
  isActive: boolean;
  createdAt: Date;
  plano: { id: string; name: string } | null;
  /** Pedidos com benefício feitos hoje — é o que o dono olha no dia a dia. */
  pedidosHoje: number;
  /** Quanto de benefício ele já teve no mês corrente. */
  descontoNoMes: number;
};

export async function listEmployees(storeId: string): Promise<FuncionarioDaLista[]> {
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const funcionarios = await prisma.employee.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      jobTitle: true,
      phone: true,
      isActive: true,
      createdAt: true,
      plan: { select: { id: true, name: true } },
    },
  });

  const doMes = await prisma.order.groupBy({
    by: ["employeeId"],
    where: {
      storeId,
      employeeId: { not: null },
      status: { not: "CANCELLED" },
      createdAt: { gte: inicioDoMes },
    },
    _sum: { employeeDiscount: true },
  });
  const descontos = new Map(doMes.map((l) => [l.employeeId, l._sum.employeeDiscount ?? 0]));

  const deHoje = await prisma.order.groupBy({
    by: ["employeeId"],
    where: {
      storeId,
      employeeId: { not: null },
      status: { not: "CANCELLED" },
      createdAt: { gte: inicioDoDia(), lte: fimDoDia() },
    },
    _count: { _all: true },
  });
  const hoje = new Map(deHoje.map((l) => [l.employeeId, l._count._all]));

  return funcionarios.map((f) => ({
    id: f.id,
    name: f.name,
    jobTitle: f.jobTitle,
    phone: f.phone,
    isActive: f.isActive,
    createdAt: f.createdAt,
    plano: f.plan,
    pedidosHoje: hoje.get(f.id) ?? 0,
    descontoNoMes: Math.round((descontos.get(f.id) ?? 0) * 100) / 100,
  }));
}

export function findEmployeeById(storeId: string, id: string) {
  return prisma.employee.findFirst({ where: { id, storeId }, select: { id: true, name: true } });
}

export type DadosDoFuncionario = {
  name: string;
  jobTitle: string | null;
  phone: string;
  planId: string | null;
};

export function createEmployee(storeId: string, dados: DadosDoFuncionario, pinHash: string) {
  return prisma.employee.create({ data: { storeId, ...dados, pinHash } });
}

export async function updateEmployee(
  storeId: string,
  id: string,
  dados: DadosDoFuncionario,
  pinHash?: string,
) {
  // O storeId entra pelo updateMany: um id de outra loja simplesmente não é
  // encontrado, em vez de ser alterado.
  const r = await prisma.employee.updateMany({
    where: { id, storeId },
    data: { ...dados, ...(pinHash ? { pinHash } : {}) },
  });
  return r.count > 0;
}

export async function setEmployeeActive(storeId: string, id: string, isActive: boolean) {
  const r = await prisma.employee.updateMany({ where: { id, storeId }, data: { isActive } });
  return r.count > 0;
}

/**
 * Apaga a ficha de vez.
 *
 * Os pedidos ficam: a relação é SetNull e o nome já está copiado neles desde o
 * momento da compra, então o relatório do mês passado continua dizendo quem
 * pegou o quê depois que a pessoa deixa de existir no cadastro. A cópia é
 * refeita aqui por segurança, antes de não haver mais de onde tirá-la.
 */
export async function deleteEmployee(storeId: string, id: string) {
  const alvo = await findEmployeeById(storeId, id);
  if (!alvo) return null;

  await prisma.order.updateMany({
    where: { storeId, employeeId: alvo.id, employeeNameSnapshot: null },
    data: { employeeNameSnapshot: alvo.name },
  });
  await prisma.employee.delete({ where: { id: alvo.id } });
  return alvo.name;
}

// ---------- Planos ----------

export function listBenefitPlans(storeId: string) {
  return prisma.employeeBenefitPlan.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
    select: {
      ...PLANO_COMPLETO.select,
      createdAt: true,
      rules: {
        select: {
          id: true,
          categoryId: true,
          productId: true,
          type: true,
          value: true,
          dailyLimit: true,
        },
      },
      _count: { select: { employees: true } },
    },
  });
}

export type DadosDoPlano = {
  name: string;
  defaultType: PlanoDeBeneficio["defaultType"];
  defaultValue: number;
  limitMode: PlanoDeBeneficio["limitMode"];
  limitValue: number | null;
  allowPayroll: boolean;
  isActive: boolean;
};

export type RegraDoPlano = {
  categoryId: string | null;
  productId: string | null;
  type: PlanoDeBeneficio["defaultType"];
  value: number;
  dailyLimit: number | null;
};

/**
 * Grava o plano e as exceções dele de uma vez.
 *
 * As regras são reescritas inteiras em vez de comparadas uma a uma: a tela
 * manda o conjunto que o dono está vendo, e apagar-e-recriar dentro da mesma
 * transação é mais simples de entender do que um diff que pode deixar uma
 * regra órfã se errar um caso.
 */
export async function saveBenefitPlan(
  storeId: string,
  id: string | null,
  dados: DadosDoPlano,
  regras: RegraDoPlano[],
) {
  return prisma.$transaction(async (tx) => {
    let planId = id;

    if (planId) {
      const r = await tx.employeeBenefitPlan.updateMany({
        where: { id: planId, storeId },
        data: dados,
      });
      if (r.count === 0) return null;
      await tx.employeeBenefitRule.deleteMany({ where: { planId } });
    } else {
      const criado = await tx.employeeBenefitPlan.create({
        data: { storeId, ...dados },
        select: { id: true },
      });
      planId = criado.id;
    }

    if (regras.length) {
      await tx.employeeBenefitRule.createMany({
        data: regras.map((r) => ({ ...r, planId: planId! })),
      });
    }
    return planId;
  });
}

export async function deleteBenefitPlan(storeId: string, id: string) {
  // Os funcionários não vão junto: a relação é SetNull, e eles voltam ao
  // estado de "cadastrado, sem benefício" em vez de sumirem do cadastro.
  const r = await prisma.employeeBenefitPlan.deleteMany({ where: { id, storeId } });
  return r.count > 0;
}
