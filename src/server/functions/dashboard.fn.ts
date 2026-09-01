import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "../auth/session";
import { getDashboardData } from "../services/dashboard-service";
import { recursoNoEstado } from "@/lib/planos/resolucao";

/**
 * O painel inicial — dados BASIC sempre, dados de fiado só com o recurso.
 *
 * O DASHBOARD INTEIRO NÃO É PAGO. Pedidos de hoje, em preparo, saindo para
 * entrega, esgotados, mesas abertas e o ranking de produtos são do plano
 * básico, e gatear esta função derrubaria a primeira tela que o lojista vê.
 *
 * O que é pago é uma fatia: quanto a loja tem A RECEBER e em quantas
 * contas. Ela sai da resposta quando o plano não inclui FIADO — não é
 * zerada, é OMITIDA: um zero diria "você não tem nada a receber", que é uma
 * afirmação sobre o negócio, e não sobre o plano. Ausente, a barra não
 * desenha o cartão.
 */
export const getDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await requireAdminSession();
  const dados = await getDashboardData(admin.storeId);

  if (recursoNoEstado(admin.store.plano, "FIADO") !== "BLOQUEADO") return dados;

  const { pagamentosEmAberto: _q, valorEmAberto: _v, ...operacao } = dados.operacao;
  return { ...dados, operacao };
});
