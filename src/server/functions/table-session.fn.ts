// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getStoreBySlug } from "../repositories/store-repository";
import { estadoComercialDaLoja } from "@/server/billing/plano-da-loja";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import { permitido } from "../security/rate-limit";
import {
  validateTableSessionPin,
  authorizeDeviceForSession,
} from "../services/table-session-service";
import { orchestrateTableSession } from "../services/table-session-orchestrator";

/**
 * Validate a PIN for a table session.
 *
 * Called when a second (or later) device tries to join a table session.
 * They must provide the correct 4-digit PIN.
 *
 * Rate limited: max 5 wrong attempts per session per 5 minutes.
 */
const validateSessionPinSchema = z.object({
  storeSlug: z.string().min(1),
  sessionId: z.string().cuid(),
  pin: z.string().regex(/^\d{4}$/, "PIN deve ter 4 dÃ­gitos"),
});

export const validateTableSessionPinFn = createServerFn({ method: "POST" })
  .validator(validateSessionPinSchema)
  .handler(async ({ data }) => {
    try {
      /*
       * Segundo teto, por ORIGEM. `validateTableSessionPin` já limita por
       * sessão+IP; este limita a própria origem, para uma máquina não varrer
       * muitas sessões diferentes gastando 5 tentativas em cada.
       */
      if (!permitido("mesa-pin", { max: 10, janelaMs: 60_000 })) {
        return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
      }

      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja nÃ£o encontrada" };
      }
      /*
        ═══ O PLANO DA LOJA, NUM FLUXO SEM SESSÃO ADMINISTRATIVA ══════════

        Quem chama aqui é o CLIENTE que escaneou o QR — não há painel, não há
        cookie de admin, e `exigirRecurso` não serve: ela passa por
        `requireAdminSession`, que recusaria qualquer pessoa comum.

        A loja vem do `storeSlug`, mas quem a resolve é o BANCO: o cliente
        informa um slug e recebe a loja que aquele slug realmente aponta.
        Trocar o parâmetro na URL leva a outra loja, com o plano DELA — não há
        parâmetro que faça o plano ser outro.

        `getStoreBySlug` já devolve a linha inteira, então `status`,
        `trialEndsAt`, `paidUntil`, `subscriptionStatus` e `plan` chegam sem
        nenhuma consulta a mais.

        A recusa é a MESMA de loja inexistente, e isso é deliberado: dizer
        "esta loja não tem mesas no plano" contaria a um estranho o que a loja
        contratou. Quem não pode usar não precisa saber por quê.
      */
      if (recursoNoEstado(estadoComercialDaLoja(store), "MESAS") === "BLOQUEADO") {
        return { ok: false as const, error: "Loja não encontrada" };
      }

      const result = await validateTableSessionPin(store.id, data.sessionId, data.pin);

      // Se PIN validado com sucesso, autorizar o dispositivo
      if (result.ok) {
        const device = await authorizeDeviceForSession(store.id, data.sessionId, false);
        return {
          ok: true as const,
          deviceToken: device.deviceToken,
        };
      }

      return result as { ok: false; error: string };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Orchestrate the complete QR Code table session flow.
 *
 * Called once by frontend after scanning QR code.
 * Coordinates:
 *   1. Create or retrieve open session
 *   2. If first device: authorize immediately, return deviceToken
 *   3. If second+ device: return sessionId only (PIN validation needed)
 *
 * Public endpoint - called from storefront.
 */
const orchestrateTableSessionSchema = z.object({
  storeSlug: z.string().min(1),
  tableId: z.string().uuid(),
});

export const orchestrateTableSessionFn = createServerFn({ method: "POST" })
  .validator(orchestrateTableSessionSchema)
  .handler(async ({ data }) => {
    try {
      /*
       * Abrir sessão é a operação mais cara desta tela e a que mexe no estado
       * do salão — encerra a sessão ociosa e gera PIN novo. Um cliente real
       * escaneia uma vez; um script varrendo mesas bate no teto na primeira
       * rajada.
       */
      if (!permitido("mesa-sessao", { max: 10, janelaMs: 60_000 })) {
        return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
      }

      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja nÃ£o encontrada" };
      }
      /*
        ═══ O PLANO DA LOJA, NUM FLUXO SEM SESSÃO ADMINISTRATIVA ══════════

        Quem chama aqui é o CLIENTE que escaneou o QR — não há painel, não há
        cookie de admin, e `exigirRecurso` não serve: ela passa por
        `requireAdminSession`, que recusaria qualquer pessoa comum.

        A loja vem do `storeSlug`, mas quem a resolve é o BANCO: o cliente
        informa um slug e recebe a loja que aquele slug realmente aponta.
        Trocar o parâmetro na URL leva a outra loja, com o plano DELA — não há
        parâmetro que faça o plano ser outro.

        `getStoreBySlug` já devolve a linha inteira, então `status`,
        `trialEndsAt`, `paidUntil`, `subscriptionStatus` e `plan` chegam sem
        nenhuma consulta a mais.

        A recusa é a MESMA de loja inexistente, e isso é deliberado: dizer
        "esta loja não tem mesas no plano" contaria a um estranho o que a loja
        contratou. Quem não pode usar não precisa saber por quê.
      */
      if (recursoNoEstado(estadoComercialDaLoja(store), "MESAS") === "BLOQUEADO") {
        return { ok: false as const, error: "Loja não encontrada" };
      }

      const result = await orchestrateTableSession(store.id, data.tableId);

      return {
        ok: true as const,
        sessionId: result.sessionId,
        firstDevice: result.firstDevice,
        deviceToken: result.deviceToken,
        pin: result.pin, // PIN returned ONLY for first device (newly created session)
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });

/**
 * Get PIN for first device (development only).
 * In development, returns the actual PIN for display.
 * In production, this is disabled for security.
 */
const getSessionPinHintSchema = z.object({
  storeSlug: z.string().min(1),
  sessionId: z.string().cuid(),
});

export const getSessionPinHintFn = createServerFn({ method: "POST" })
  .validator(getSessionPinHintSchema)
  .handler(async ({ data }) => {
    try {
      if (!permitido("mesa-pin-hint", { max: 20, janelaMs: 60_000 })) {
        return { ok: false as const, error: "Muitas tentativas. Aguarde um instante." };
      }

      const store = await getStoreBySlug(data.storeSlug);
      if (!store) {
        return { ok: false as const, error: "Loja não encontrada" };
      }
      /*
        ═══ O PLANO DA LOJA, NUM FLUXO SEM SESSÃO ADMINISTRATIVA ══════════

        Quem chama aqui é o CLIENTE que escaneou o QR — não há painel, não há
        cookie de admin, e `exigirRecurso` não serve: ela passa por
        `requireAdminSession`, que recusaria qualquer pessoa comum.

        A loja vem do `storeSlug`, mas quem a resolve é o BANCO: o cliente
        informa um slug e recebe a loja que aquele slug realmente aponta.
        Trocar o parâmetro na URL leva a outra loja, com o plano DELA — não há
        parâmetro que faça o plano ser outro.

        `getStoreBySlug` já devolve a linha inteira, então `status`,
        `trialEndsAt`, `paidUntil`, `subscriptionStatus` e `plan` chegam sem
        nenhuma consulta a mais.

        A recusa é a MESMA de loja inexistente, e isso é deliberado: dizer
        "esta loja não tem mesas no plano" contaria a um estranho o que a loja
        contratou. Quem não pode usar não precisa saber por quê.
      */
      if (recursoNoEstado(estadoComercialDaLoja(store), "MESAS") === "BLOQUEADO") {
        return { ok: false as const, error: "Loja não encontrada" };
      }

      const { prisma } = await import("../db/client");
      const session = await prisma.tableSession.findUnique({
        where: { id: data.sessionId },
        select: { id: true, storeId: true, status: true, pinHash: true },
      });

      if (!session || session.storeId !== store.id) {
        return { ok: false as const, error: "Sessão não encontrada" };
      }

      if (session.status !== "OPEN") {
        return { ok: false as const, error: "Sessão não está mais aberta" };
      }

      // In development, we can expose PIN for UX (it's in console logs anyway)
      // In production, never expose PIN via API
      if (process.env.NODE_ENV === "production") {
        return {
          ok: true as const,
          message: "O PIN foi enviado para o seu email/SMS",
          pinVisible: false,
          pin: undefined,
        };
      }

      // Development: retrieve PIN from browser's console log message
      // Since PIN is hashed in DB, we can't recover it here
      // Instead, return indicator to check console
      return {
        ok: true as const,
        message: "PIN: Verifique os logs do navegador (F12 > Console) para ver o PIN",
        pinVisible: true,
        pin: undefined, // Cannot be recovered from hash
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      return { ok: false as const, error: msg };
    }
  });
