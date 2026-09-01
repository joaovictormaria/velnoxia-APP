import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { InventoryCostService } from "@/server/services/inventory-cost-service";

/**
 * A série diária de faturamento, custo e lucro.
 *
 * TRÊS DEFEITOS MORAVAM AQUI, E OS TRÊS ERAM INVISÍVEIS NA TELA.
 *
 * 1. `totalCost` era declarado, inicializado em zero e NUNCA somado. A linha de
 *    Custos do gráfico ficava colada no eixo para sempre.
 *
 * 2. `totalProfit += orderTotal` — o lucro recebia a receita. A linha de Lucro
 *    ficava exatamente sobre a de Faturamento, e ninguém estranhava porque as
 *    duas se moviam juntas.
 *
 * Os dois juntos faziam a tela se contradizer sozinha: os cards no topo vinham
 * de outra função e mostravam custo real, enquanto o gráfico logo abaixo jurava
 * que o custo era zero.
 *
 * 3. A chave do dia saía de `toLocaleString` seguido de `new Date` e
 *    `toISOString` — três conversões que reaplicavam o fuso da MÁQUINA. Em
 *    UTC−3 quase se cancelavam; num servidor em UTC deslocavam o agrupamento em
 *    três horas, jogando pedidos da noite para o dia seguinte.
 *
 * Agora os números vêm do mesmo carregador que alimenta os KPIs, então gráfico
 * e cards não têm como discordar. O dia é calculado com `en-CA`, que formata
 * como `AAAA-MM-DD` direto no fuso pedido, sem ida e volta por Date.
 */

const FUSO = "America/Sao_Paulo";

/** O dia civil de um instante, no fuso da loja. */
function diaLocal(momento: Date): string {
  return momento.toLocaleDateString("en-CA", { timeZone: FUSO });
}

/** Soma um dia a uma chave `AAAA-MM-DD` sem passar por fuso nenhum. */
function proximoDia(chave: string): string {
  const [ano, mes, dia] = chave.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return d.toISOString().slice(0, 10);
}

export const getFinancialTimeline = createServerFn({ method: "POST" })
  .validator(
    z.object({
      days: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await exigirRecurso("FINANCEIRO");
    if (!store) {
      throw new Error("Not authenticated");
    }

    const days = data.days || 30;
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - days);

    const pedidos = await InventoryCostService.pedidosReconhecidos(store.storeId, inicio, fim);
    if (pedidos.length === 0) return [];

    type Dia = {
      date: string;
      totalSales: number;
      totalCost: number;
      totalProfit: number;
      orderCount: number;
      /** Fatia do dia com custo integralmente conhecido. */
      receitaApurada: number;
      custoApurado: number;
    };

    const porDia = new Map<string, Dia>();

    for (const pedido of pedidos) {
      // A data é a de COMPETÊNCIA: quando a venda foi reconhecida.
      const chave = diaLocal(pedido.competencia);
      let dia = porDia.get(chave);
      if (!dia) {
        dia = {
          date: chave,
          totalSales: 0,
          totalCost: 0,
          totalProfit: 0,
          orderCount: 0,
          receitaApurada: 0,
          custoApurado: 0,
        };
        porDia.set(chave, dia);
      }

      dia.totalSales += pedido.receita;
      dia.totalCost += pedido.custoConhecido;
      dia.orderCount += 1;

      /*
       * O lucro do dia é medido só sobre os pedidos apurados, e não sobre a
       * receita cheia menos o custo conhecido. Aquela conta trataria como lucro
       * toda venda cujo custo ninguém mediu — a margem de 100% voltando pelo
       * gráfico depois de ter sido expulsa dos cards.
       */
      /*
       * A fatia apurada de CADA pedido, não os pedidos inteiramente apurados.
       * Um pedido misto contribui com as linhas que foram medidas.
       */
      dia.receitaApurada += pedido.receitaApurada;
      dia.custoApurado += pedido.custoApurado;
      dia.totalProfit += pedido.receitaApurada - pedido.custoApurado;
    }

    /*
     * Preenche os dias sem venda e ORDENA.
     *
     * A ordenação não é enfeite: a versão anterior tomava `timeline[0]` e
     * `timeline[length-1]` como primeira e última data, mas isso era a ordem de
     * chegada do banco — sem `orderBy` na consulta. Bastava o banco devolver
     * fora de ordem para o preenchimento não rodar e o eixo X do gráfico sair
     * embaralhado.
     */
    const chaves = [...porDia.keys()].sort();
    const serie: Dia[] = [];
    for (let chave = chaves[0]; chave <= chaves[chaves.length - 1]; chave = proximoDia(chave)) {
      serie.push(
        porDia.get(chave) ?? {
          date: chave,
          totalSales: 0,
          totalCost: 0,
          totalProfit: 0,
          orderCount: 0,
          receitaApurada: 0,
          custoApurado: 0,
        },
      );
    }

    return serie;
  });
