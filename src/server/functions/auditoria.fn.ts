import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { AuditService } from "@/server/audit/audit-service";

/**
 * A PORTA HTTP DA CONSULTA DE AUDITORIA.
 *
 * ─── AS DUAS METADES DO MÓDULO ─────────────────────────────────────────────
 *
 * REGISTRAR é o sistema anotando o que aconteceu, e não depende de plano:
 * `AuditService.log` continua sendo chamado de dentro das operações, sem
 * sessão em mãos e sem entitlement. Um registro que só existe para quem paga
 * é um registro em que não se pode confiar.
 *
 * CONSULTAR é o que se vende, e é só isto que este arquivo expõe — as duas
 * funções abaixo, ambas exigindo AUDITORIA.
 *
 * ─── O RECORTE DE LOJA VEM DA SESSÃO ───────────────────────────────────────
 *
 * Nenhuma das duas aceita `storeId` do cliente: não há campo para isso no
 * validador. É a mesma regra do financeiro, e aqui ela pesa mais — o AuditLog
 * guarda e-mail de quem operou, IP e o valor antes e depois de cada mudança.
 * Uma loja lendo o log de outra seria vazamento de dado pessoal, não só de
 * número.
 *
 * ─── NENHUMA CONSULTA NOVA ─────────────────────────────────────────────────
 *
 * A listagem é `AuditService.query()`, que já existia com todos os filtros de
 * que a tela precisa (ação, recurso, usuário, período) e com `limit`/`offset`.
 * Não há segunda consulta ao `AuditLog` aqui dentro.
 */

/** Página curta de propósito: o log cresce sozinho e ninguém lê 500 linhas. */
const POR_PAGINA = 25;

const FILTROS = z.object({
  /** Janela em dias. `null` = desde sempre. */
  dias: z.number().int().min(1).max(365).nullable().default(30),
  acao: z.string().max(60).optional(),
  recurso: z.string().max(60).optional(),
  usuarioId: z.string().max(64).optional(),
  pagina: z.number().int().min(0).max(400).default(0),
});

/**
 * A lista de eventos, filtrada e paginada.
 *
 * A PAGINAÇÃO É A DO SERVIÇO. `query()` já recebe `limit` e `offset`; aqui se
 * pede UM registro a mais que a página e se devolve `temMais` — é o que evita
 * um `count()` numa tabela que só cresce, e é a menor forma segura de nunca
 * carregar o log inteiro no navegador.
 */
export const listarAuditoriaFn = createServerFn({ method: "POST" })
  .validator(FILTROS)
  .handler(async ({ data }) => {
    const admin = await exigirRecurso("AUDITORIA");

    const desde = data.dias
      ? new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000)
      : undefined;

    const linhas = await AuditService.query({
      storeId: admin.storeId,
      // String vazia é "sem filtro", e não "campo igual a vazio".
      action: data.acao || undefined,
      resource: data.recurso || undefined,
      userId: data.usuarioId || undefined,
      fromDate: desde,
      limit: POR_PAGINA + 1,
      offset: data.pagina * POR_PAGINA,
    });

    return {
      eventos: linhas.slice(0, POR_PAGINA),
      pagina: data.pagina,
      porPagina: POR_PAGINA,
      temMais: linhas.length > POR_PAGINA,
    };
  });

/**
 * As opções de filtro que ESTA loja consegue responder.
 *
 * `action` e `resource` são texto livre no modelo — o código já grava mais de
 * vinte valores distintos. Uma lista fixa na tela ofereceria filtros vazios e
 * esconderia eventos novos; esta vem do que a loja registrou de fato.
 */
export const filtrosDeAuditoriaFn = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    const admin = await exigirRecurso("AUDITORIA");
    return AuditService.filterOptions(admin.storeId);
  });
