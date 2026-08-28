/**
 * Quais horas o gráfico de pedidos por hora deve mostrar.
 *
 * Fica separado do banco porque é a parte que erra calado: uma janela errada
 * não levanta exceção, só desenha um gráfico que some com pedido ou enche a
 * tela de horas em que a loja está fechada.
 */

export type HorarioDoDia = {
  isOpen: boolean;
  /** "HH:MM", como o banco guarda. */
  opensAt: string;
  closesAt: string;
};

/** A hora inteira em que "HH:MM" cai. Devolve null se vier lixo. */
function hora(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

/** Janela usada quando a loja não tem horário cadastrado para o dia. */
const PADRAO = { de: 8, ate: 23 };

/**
 * As horas do gráfico, em ordem de exibição.
 *
 * @param horario  O horário da loja no dia mostrado, ou null se não houver.
 * @param comPedido Horas que têm pedido de verdade. Elas sempre entram, mesmo
 *   fora do horário: um pedido feito às 3h da manhã existe, e um gráfico que
 *   o esconde passa a discordar do total de pedidos logo acima dele.
 */
export function horasDoGrafico(
  horario: HorarioDoDia | null,
  comPedido: readonly number[] = [],
): number[] {
  const abre = horario?.isOpen ? hora(horario.opensAt) : null;
  const fecha = horario?.isOpen ? hora(horario.closesAt) : null;

  const dentro = new Set<number>();

  if (abre !== null && fecha !== null) {
    /*
     * Fechar antes de abrir significa atravessar a meia-noite — um bar que
     * abre 18h e fecha 2h. Sem isto a janela sairia vazia ou invertida, e o
     * gráfico do bar mostraria justamente as horas em que ele está fechado.
     */
    let h = abre;
    dentro.add(h);
    while (h !== fecha) {
      h = (h + 1) % 24;
      dentro.add(h);
    }
  } else {
    for (let h = PADRAO.de; h <= PADRAO.ate; h++) dentro.add(h);
  }

  for (const h of comPedido) {
    if (Number.isInteger(h) && h >= 0 && h <= 23) dentro.add(h);
  }

  /*
   * A ordem é a da noite de trabalho, não a do relógio: quem abre 18h e fecha
   * 2h lê 18, 19, ..., 23, 0, 1, 2. Ordenar por número puro jogaria a
   * madrugada — o pico do bar — para o começo do gráfico.
   */
  const inicio = abre ?? PADRAO.de;
  return [...dentro].sort(
    (a, b) => ((a - inicio + 24) % 24) - ((b - inicio + 24) % 24),
  );
}

export const rotuloDaHora = (h: number) => `${String(h).padStart(2, "0")}h`;

/** "HH:MM" em minutos desde a meia-noite. Null se vier lixo. */
function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * A loja está atendendo NESTE momento?
 *
 * Mora aqui, e não num módulo novo, porque a parte difícil já estava resolvida
 * neste arquivo: a travessia da meia-noite. Um bar que abre 18h e fecha 2h está
 * aberto à 1h da manhã, e comparar `abre <= agora < fecha` diria que não.
 *
 * A PRECISÃO É DE MINUTO, e não de hora como em `horasDoGrafico`. Ali a unidade
 * é a coluna do gráfico; aqui é a diferença entre dizer "aberto" às 23h50 de uma
 * casa que fecha 23h30 — e alguém do outro lado do balcão acreditar.
 *
 * `opensAt === closesAt` conta como FECHADO. É um intervalo de duração zero, e
 * quase sempre um cadastro pela metade; ler como "24 horas" seria escolher a
 * interpretação que promete atendimento onde talvez não haja.
 */
export function estaAbertoAgora(
  horario: HorarioDoDia | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!horario || !horario.isOpen) return false;

  const abre = minutos(horario.opensAt);
  const fecha = minutos(horario.closesAt);
  // Horário ilegível não vira "aberto": na dúvida, não se promete atendimento.
  if (abre === null || fecha === null || abre === fecha) return false;

  const momento = agora.getHours() * 60 + agora.getMinutes();

  // Fechar depois de abrir é o dia normal; fechar antes atravessa a meia-noite.
  return abre < fecha
    ? momento >= abre && momento < fecha
    : momento >= abre || momento < fecha;
}
