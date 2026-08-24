import { createServerFn } from "@tanstack/react-start";
import { getCurrentAdmin } from "../auth/session";
import { cobrancaConfigurada } from "../billing/stripe";
import {
  criarCheckout,
  criarPortal,
  resumoDaAssinatura,
} from "../billing/subscription-service";

/**
 * Assinatura.
 *
 * Estas funÃ§Ãµes nÃ£o passam por requireAdminSession de propÃ³sito: aquela porta
 * recusa loja bloqueada, e Ã© exatamente a loja bloqueada que precisa chegar
 * atÃ© aqui para pagar. A checagem Ã© sÃ³ de identidade e de papel.
 *
 * SÃ³ o dono assina. Um gerente administra o cardÃ¡pio; colocar o cartÃ£o da
 * empresa e cancelar a conta nÃ£o Ã© trabalho dele.
 */
async function exigirDono() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  if (admin.role !== "OWNER") throw new Error("SOMENTE_O_DONO");
  return admin;
}

export const getAssinaturaFn = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await exigirDono();
  const resumo = await resumoDaAssinatura(admin.storeId);
  return { ...resumo, configurado: cobrancaConfigurada(), acesso: admin.store.acesso };
});

export const iniciarAssinaturaFn = createServerFn({ method: "POST" }).handler(async () => {
  const admin = await exigirDono();
  if (!cobrancaConfigurada()) {
    return { ok: false as const, error: "A cobranÃ§a ainda nÃ£o estÃ¡ configurada." };
  }
  try {
    return { ok: true as const, url: await criarCheckout(admin.storeId) };
  } catch (erro) {
    console.error("[stripe] falha ao abrir o checkout:", erro);
    return { ok: false as const, error: "NÃ£o foi possÃ­vel abrir o pagamento. Tente de novo." };
  }
});

export const abrirPortalFn = createServerFn({ method: "POST" }).handler(async () => {
  const admin = await exigirDono();
  try {
    return { ok: true as const, url: await criarPortal(admin.storeId) };
  } catch (erro) {
    console.error("[stripe] falha ao abrir o portal:", erro);
    return { ok: false as const, error: "NÃ£o foi possÃ­vel abrir a gestÃ£o da assinatura." };
  }
});
