import { RecebimentosService } from "./recebimentos-service";
import { transitionOrderStatus } from "./order-service";

/**
 * "Pagamento outro dia" = aceitar o pedido, pôr na fila e deixar a cobrança em
 * aberto — os três num gesto só.
 *
 * SÃO DUAS OPERAÇÕES, COMPOSTAS AQUI E SÓ AQUI.
 *
 *   1. `RecebimentosService.abrirFiado` — puramente financeiro, não escreve em
 *      `Order.status` nem encosta no razão de estoque.
 *   2. `transitionOrderStatus(..., "PREPARING")` — o MESMO caminho do botão
 *      "Colocar na fila" do quadro.
 *
 * A composição não entrou no `RecebimentosService` porque é uma decisão de
 * PRODUTO ("quem fia, aceita") e não uma regra de dinheiro: o serviço continua
 * servindo a quem precisar só marcar o fiado.
 *
 * ⚠️ POR QUE ELA MORA NUM ARQUIVO PRÓPRIO, E NÃO DENTRO DE `recebimentos.fn.ts`.
 *
 * Ela nasceu lá, no corpo da server function, e depois foi extraída para o
 * balcão poder chamá-la. Extraída para o MESMO arquivo, virou um `export`
 * comum num `.fn.ts` — e isso quebrou o painel inteiro.
 *
 * O motivo é o empacotamento. Um `*.fn.ts` que exporta SÓ server functions é
 * substituído no navegador por um stub de duzentos bytes: o cliente recebe
 * apenas a URL de cada função. Um `export` comum no meio delas não pode ser
 * substituído — o bundler tem de mantê-lo, e junto vêm os imports do arquivo:
 * repositórios, Prisma, `node:crypto`. O navegador então carrega o cliente do
 * banco e morre em `ReferenceError: Buffer is not defined`, derrubando toda
 * tela que importe aquele módulo.
 *
 * A REGRA, e ela vale para qualquer arquivo `.fn.ts`: só server functions e
 * tipos. Qualquer função de verdade mora num módulo de serviço, como esta.
 *
 * SÓ DE RECEIVED. Um pedido que já está em preparo ou na rua não é empurrado —
 * marcar fiado não pode fazer quem já andou andar mais.
 *
 * ⚠️ O ESTOQUE BAIXA AQUI, e isso é intencional: PREPARING é onde a reserva
 * vira consumo em qualquer venda. Não é o pagamento que consome — é o pedido
 * entrar na fila, exatamente como se o operador tivesse clicado no botão.
 *
 * DUPLO CLIQUE É SEGURO, por três travas que já existiam:
 *   · `abrirFiado` devolve cedo se o pedido já está OPEN;
 *   · `transitionOrderStatus` devolve `ok` se o status já é o pedido;
 *   · o consumo usa `idempotencyKey` com índice único, então a segunda
 *     tentativa reconhece o que a primeira gravou em vez de descontar de novo.
 */
export async function aceitarComPagamentoEmAberto(
  storeId: string,
  orderId: string,
  autor: { id?: string | null; name?: string | null; email?: string | null },
  opcoes: { note?: string | null; dueAt?: Date | null } = {},
) {
  const r = await RecebimentosService.abrirFiado(storeId, orderId, autor, {
    note: opcoes.note ?? null,
    dueAt: opcoes.dueAt ?? null,
  });
  if (!r.ok) return { ok: false as const, error: r.erro };

  /*
   * A fila anda DEPOIS de o fiado estar gravado. Se a transição falhar — um
   * pedido cancelado por outra pessoa no meio do caminho, por exemplo — a
   * dívida já está registrada e não se perde; o operador vê o aviso e move o
   * pedido à mão.
   */
  let aviso: string | null = null;
  if (r.dados.statusAtual === "RECEIVED") {
    const t = await transitionOrderStatus(storeId, orderId, "PREPARING", {
      authorType: "ADMIN",
      authorName: autor.name ?? undefined,
      note: "Aceito com pagamento em aberto",
    } as any);
    if (!t.ok) aviso = t.error;
  }

  return { ok: true as const, dados: r.dados, aviso };
}
