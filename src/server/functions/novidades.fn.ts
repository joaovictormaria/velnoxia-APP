import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { NovidadesService } from "@/server/services/novidades-service";
import { CATALOGO } from "@/lib/novidades/catalogo";
import type { Novidade, Papel } from "@/lib/novidades/tipos";

/**
 * A PORTA HTTP DO ESTADO DAS NOVIDADES.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ NENHUMA FUNÇÃO DESTE ARQUIVO ACEITA IDENTIDADE DO CLIENTE.            │
 * │                                                                       │
 * │ Não há campo `adminUserId` nem `storeId` em validador nenhum — não é  │
 * │ que eles sejam ignorados, é que não existem. Um payload que os traga  │
 * │ é recusado pelo Zod antes de qualquer lógica rodar.                   │
 * │                                                                       │
 * │ Os dois saem de `requireAdminSession()`, que lê o cookie selado e     │
 * │ RELÊ a conta do banco a cada request. É a mesma regra do resto do     │
 * │ painel, e aqui ela é o que separa "esconder um aviso meu" de          │
 * │ "escrever no registro de outra pessoa".                               │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * `requireAdminSession` também entrega três recusas de graça, sem uma linha
 * a mais aqui: COURIER (papel errado), conta desativada e loja suspensa ou
 * vencida.
 */

/** Os dois estados que ENCERRAM uma novidade. Enum, nunca string livre. */
const ESTADO = z.enum(["CONCLUIDA", "DISPENSADA"]);

/**
 * A novidade existe, está publicada e é para este papel?
 *
 * A mesma pergunta que `escolherNovidade` faz no cliente — refeita aqui porque
 * o cliente não é fonte de autoridade. Sem esta checagem, uma requisição
 * montada à mão populava a tabela com ids arbitrários, ou marcava como vista
 * uma novidade que ainda não foi lançada.
 */
function novidadeUtilizavel(novidadeId: string, papel: Papel): Novidade | null {
  const novidade = CATALOGO.find((n) => n.id === novidadeId);
  if (!novidade) return null;
  if (!novidade.publicada) return null;
  if (novidade.papeis && !novidade.papeis.includes(papel)) return null;
  return novidade;
}

/**
 * O que o usuário da sessão já concluiu ou dispensou.
 *
 * Sem parâmetro nenhum, de propósito: não há o que pedir. Quem pergunta é
 * sempre a própria sessão, e a resposta é sempre só a dela.
 */
export const listarEstadoDasNovidadesFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const admin = await requireAdminSession();
    const registros = await NovidadesService.ler(admin.id);
    /*
     * A resposta carrega só `novidadeId` e `estado`. Nem `adminUserId`, nem
     * `storeId`, nem o `id` da linha: o cliente não precisa de nenhum dos três
     * para desenhar, e o que não é enviado não vaza.
     */
    return registros;
  },
);

/** Grava CONCLUIDA ou DISPENSADA para o usuário da sessão. */
export const marcarNovidadeFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      novidadeId: z.string().min(1).max(120),
      estado: ESTADO,
    }),
  )
  .handler(async ({ data }) => {
    // Autenticação e autorização ANTES de qualquer coisa relacionada à
    // novidade. Um COURIER não chega nem a ter o id dele validado.
    const admin = await requireAdminSession();

    if (!novidadeUtilizavel(data.novidadeId, admin.role)) {
      return { ok: false as const, error: "Novidade indisponível." };
    }

    await NovidadesService.marcar(admin.id, admin.storeId, data.novidadeId, data.estado);

    // O eco do que foi gravado, e nada além.
    return { ok: true as const, novidadeId: data.novidadeId, estado: data.estado };
  });
