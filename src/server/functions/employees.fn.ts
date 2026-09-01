// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { hashPassword } from "../auth/password";
import {
  createEmployee,
  deleteBenefitPlan,
  deleteEmployee,
  listBenefitPlans,
  consumoDosFuncionarios,
  listEmployees,
  saveBenefitPlan,
  setEmployeeActive,
  updateEmployee,
} from "../repositories/employee-repository";

const BENEFIT_TYPE = z.enum(["NONE", "PERCENTAGE", "FIXED_AMOUNT", "FIXED_PRICE"]);
const LIMIT_MODE = z.enum(["NONE", "ITEMS_PER_DAY", "AMOUNT_PER_DAY", "PER_CATEGORY"]);

/** Quatro dÃ­gitos, nem mais nem menos: Ã© o que o checkout pede na tela. */
const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "O PIN tem 4 dÃ­gitos.");

const employeeSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do funcionÃ¡rio.").max(80),
  jobTitle: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    // SÃ³ os dÃ­gitos, no mesmo formato em que o checkout grava o telefone do
    // cliente â€” Ã© essa igualdade que faz o reconhecimento funcionar.
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10, "Informe um telefone vÃ¡lido, com DDD."),
  planId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const listEmployeesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await exigirRecurso("FUNCIONARIOS");
  return listEmployees(storeId);
});

/**
 * O consumo dos funcionários num MÊS, para o fechamento da folha.
 *
 * O período é um mês inteiro, e não um intervalo livre de dias, porque é assim
 * que a folha fecha. Ano e mês entram separados para não depender de o cliente
 * e o servidor concordarem sobre o formato de uma data.
 *
 * As bordas seguem o RELÓGIO DO SERVIDOR, a mesma convenção que `lerUsoDoDia` e
 * o `dashboard-service` usam — e pelo mesmo motivo registrado lá: um mês
 * calculado num fuso e um faturamento calculado noutro discordariam na virada.
 *
 * `mes` é 1–12 na entrada porque é assim que uma pessoa escreve; o `-1` traduz
 * para o índice do `Date`, e `dia 0` do mês seguinte é o último dia deste.
 */
export const consumoDeFuncionariosFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ano: z.number().int().min(2000).max(2200),
      mes: z.number().int().min(1).max(12),
    }),
  )
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("FUNCIONARIOS");

    const inicio = new Date(data.ano, data.mes - 1, 1, 0, 0, 0, 0);
    const fim = new Date(data.ano, data.mes, 0, 23, 59, 59, 999);

    return consumoDosFuncionarios(storeId, inicio, fim);
  });

/**
 * Cadastra ou edita. O PIN Ã© obrigatÃ³rio no cadastro e opcional depois: sem
 * digitar nada, o que jÃ¡ estava continua valendo, e Ã© assim que o dono muda a
 * funÃ§Ã£o ou o plano de alguÃ©m sem precisar saber o PIN da pessoa.
 */
export const saveEmployeeFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().nullish(),
      data: employeeSchema,
      pin: pinSchema.nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("FUNCIONARIOS");
    const dados = data.data;

    if (!data.id && !data.pin) {
      return { ok: false as const, error: "Defina um PIN de 4 dÃ­gitos para o funcionÃ¡rio." };
    }

    try {
      if (data.id) {
        const pinHash = data.pin ? await hashPassword(data.pin) : undefined;
        const alterado = await updateEmployee(storeId, data.id, dados, pinHash);
        if (!alterado) return { ok: false as const, error: "FuncionÃ¡rio nÃ£o encontrado." };
      } else {
        await createEmployee(storeId, dados, await hashPassword(data.pin!));
      }
    } catch (erro) {
      // O Ã­ndice Ãºnico de (loja, telefone). A mensagem do banco nÃ£o serve para
      // o dono, e o telefone Ã© justamente o que ele acabou de digitar.
      if (erro instanceof Error && erro.message.includes("Employee_storeId_phone_key")) {
        return { ok: false as const, error: "JÃ¡ existe um funcionÃ¡rio com este telefone." };
      }
      throw erro;
    }
    return { ok: true as const };
  });

/**
 * Tira o benefÃ­cio sem apagar a ficha â€” fÃ©rias, afastamento, castigo. O
 * reconhecimento no checkout para no mesmo instante, porque a busca sÃ³ olha
 * quem estÃ¡ ativo.
 */
export const setEmployeeActiveFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("FUNCIONARIOS");
    const ok = await setEmployeeActive(storeId, data.id, data.isActive);
    return ok ? { ok: true as const } : { ok: false as const, error: "FuncionÃ¡rio nÃ£o encontrado." };
  });

export const deleteEmployeeFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("FUNCIONARIOS");
    const nome = await deleteEmployee(storeId, data.id);
    return nome
      ? { ok: true as const, name: nome }
      : { ok: false as const, error: "FuncionÃ¡rio nÃ£o encontrado." };
  });

// ---------- Planos ----------

const ruleSchema = z
  .object({
    categoryId: z.string().nullish().default(null),
    productId: z.string().nullish().default(null),
    type: BENEFIT_TYPE,
    value: z.number().min(0).default(0),
    dailyLimit: z.number().int().min(0).nullish().default(null),
  })
  .refine((r) => Boolean(r.categoryId) !== Boolean(r.productId), {
    message: "Cada exceÃ§Ã£o vale para uma categoria ou para um produto, nunca os dois.",
  });

const planSchema = z.object({
  name: z.string().trim().min(2, "DÃª um nome ao plano.").max(40),
  defaultType: BENEFIT_TYPE,
  defaultValue: z.number().min(0),
  limitMode: LIMIT_MODE,
  limitValue: z.number().min(0).nullish(),
  allowPayroll: z.boolean(),
  isActive: z.boolean(),
});

export const listBenefitPlansFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await exigirRecurso("BENEFICIOS");
  return listBenefitPlans(storeId);
});

export const saveBenefitPlanFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().nullish(),
      data: planSchema,
      rules: z.array(ruleSchema).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("BENEFICIOS");
    const d = data.data;

    if (d.defaultType === "PERCENTAGE" && d.defaultValue > 100) {
      return { ok: false as const, error: "Um desconto em porcentagem nÃ£o passa de 100%." };
    }
    const percentualInvalido = data.rules.find((r) => r.type === "PERCENTAGE" && r.value > 100);
    if (percentualInvalido) {
      return { ok: false as const, error: "Uma das exceÃ§Ãµes tem porcentagem acima de 100%." };
    }
    /*
     * Um limite sem nÃºmero Ã© um limite que nÃ£o limita: a tela mostraria "cota
     * de hoje" sem cota nenhuma, e o dono acharia que configurou algo.
     */
    if ((d.limitMode === "ITEMS_PER_DAY" || d.limitMode === "AMOUNT_PER_DAY") && !d.limitValue) {
      return { ok: false as const, error: "Informe o valor do limite diÃ¡rio." };
    }
    if (d.limitMode === "PER_CATEGORY" && !data.rules.some((r) => r.categoryId && r.dailyLimit)) {
      return {
        ok: false as const,
        error: "No limite por categoria, ao menos uma categoria precisa de um nÃºmero por dia.",
      };
    }

    try {
      const planId = await saveBenefitPlan(
        storeId,
        data.id ?? null,
        {
          ...d,
          // SÃ³ o modo que usa o campo o guarda preenchido; senÃ£o o nÃºmero
          // antigo ficaria escondido no banco esperando para reaparecer.
          limitValue:
            d.limitMode === "ITEMS_PER_DAY" || d.limitMode === "AMOUNT_PER_DAY"
              ? (d.limitValue ?? null)
              : null,
        },
        data.rules.map((r) => ({
          categoryId: r.categoryId ?? null,
          productId: r.productId ?? null,
          type: r.type,
          value: r.value,
          dailyLimit: r.dailyLimit ?? null,
        })),
      );
      if (!planId) return { ok: false as const, error: "Plano nÃ£o encontrado." };
      return { ok: true as const, id: planId };
    } catch (erro) {
      if (erro instanceof Error && erro.message.includes("EmployeeBenefitPlan_storeId_name_key")) {
        return { ok: false as const, error: "JÃ¡ existe um plano com este nome." };
      }
      throw erro;
    }
  });

export const deleteBenefitPlanFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("BENEFICIOS");
    const ok = await deleteBenefitPlan(storeId, data.id);
    // Quem estava nele fica sem benefÃ­cio, mas continua cadastrado.
    return ok ? { ok: true as const } : { ok: false as const, error: "Plano nÃ£o encontrado." };
  });

