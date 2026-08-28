import { describe, it, expect } from "vitest";
import { estaAbertoAgora } from "@/server/services/janela-do-grafico";

/*
 * "ABERTO AGORA" NO PAINEL.
 *
 * O dashboard diz ao dono se o restaurante está atendendo neste momento. Errar
 * para o lado do "aberto" é o erro caro: alguém do outro lado do balcão lê a
 * tela e responde que dá tempo de pedir.
 *
 * A travessia da meia-noite e a precisão de minuto são o assunto. Um bar que
 * abre 18h e fecha 2h está aberto à 1h da manhã, e a comparação ingênua
 * `abre <= agora < fecha` diria que não.
 */

/** Um instante do dia, sem depender do dia real. */
const as = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2026, 0, 15, h, m, 0, 0);
  return d;
};

const horario = (opensAt: string, closesAt: string, isOpen = true) => ({
  isOpen,
  opensAt,
  closesAt,
});

describe("dia normal, sem virar a meia-noite", () => {
  const comercial = horario("11:00", "23:00");

  it("01 · dentro da janela está aberto", () => {
    expect(estaAbertoAgora(comercial, as("14:30"))).toBe(true);
  });

  it("02 · antes de abrir está fechado", () => {
    expect(estaAbertoAgora(comercial, as("10:59"))).toBe(false);
  });

  it("03 · depois de fechar está fechado", () => {
    expect(estaAbertoAgora(comercial, as("23:01"))).toBe(false);
  });

  it("04 · o minuto de abrir JÁ conta como aberto", () => {
    expect(estaAbertoAgora(comercial, as("11:00"))).toBe(true);
  });

  it("05 · o minuto de fechar JÁ conta como fechado", () => {
    /*
     * A fronteira escolhida: `< fecha`, e não `<=`. Às 23:00 a casa fechou —
     * dizer "aberto" no minuto exato do fechamento convida um pedido que não
     * vai ser preparado.
     */
    expect(estaAbertoAgora(comercial, as("23:00"))).toBe(false);
  });

  it("06 · precisão de MINUTO, não de hora", () => {
    /*
     * `horasDoGrafico` trabalha em horas inteiras porque a unidade dele é a
     * coluna do gráfico. Aqui não: uma casa que fecha 23h30 está fechada às
     * 23h50, e arredondar para a hora diria que ainda está aberta.
     */
    const ateMeia = horario("18:00", "23:30");
    expect(estaAbertoAgora(ateMeia, as("23:29"))).toBe(true);
    expect(estaAbertoAgora(ateMeia, as("23:50"))).toBe(false);
  });
});

describe("atravessando a meia-noite", () => {
  const bar = horario("18:00", "02:00");

  it("07 · à 1h da manhã o bar que fecha 2h está ABERTO", () => {
    // O caso que a comparação ingênua erra.
    expect(estaAbertoAgora(bar, as("01:00"))).toBe(true);
  });

  it("08 · às 23h está aberto", () => {
    expect(estaAbertoAgora(bar, as("23:00"))).toBe(true);
  });

  it("09 · às 3h da manhã já fechou", () => {
    expect(estaAbertoAgora(bar, as("03:00"))).toBe(false);
  });

  it("10 · às 10h da manhã, no meio do vão, está fechado", () => {
    expect(estaAbertoAgora(bar, as("10:00"))).toBe(false);
  });

  it("11 · a meia-noite exata está dentro", () => {
    expect(estaAbertoAgora(bar, as("00:00"))).toBe(true);
  });
});

describe("o que não deve virar 'aberto'", () => {
  it("12 · dia marcado como fechado", () => {
    expect(estaAbertoAgora(horario("11:00", "23:00", false), as("14:00"))).toBe(false);
  });

  it("13 · sem horário cadastrado", () => {
    // Ausência de dado não é permissão para prometer atendimento.
    expect(estaAbertoAgora(null, as("14:00"))).toBe(false);
    expect(estaAbertoAgora(undefined, as("14:00"))).toBe(false);
  });

  it("14 · horário ilegível", () => {
    expect(estaAbertoAgora(horario("", "23:00"), as("14:00"))).toBe(false);
    expect(estaAbertoAgora(horario("11:00", "abc"), as("14:00"))).toBe(false);
    expect(estaAbertoAgora(horario("25:00", "26:00"), as("14:00"))).toBe(false);
    expect(estaAbertoAgora(horario("11:70", "23:00"), as("14:00"))).toBe(false);
  });

  it("15 · abrir e fechar no mesmo minuto conta como FECHADO", () => {
    /*
     * Intervalo de duração zero, quase sempre cadastro pela metade. Ler como
     * "24 horas" seria escolher justamente a interpretação que promete
     * atendimento onde talvez não haja.
     */
    expect(estaAbertoAgora(horario("00:00", "00:00"), as("14:00"))).toBe(false);
    expect(estaAbertoAgora(horario("18:00", "18:00"), as("18:00"))).toBe(false);
  });
});
