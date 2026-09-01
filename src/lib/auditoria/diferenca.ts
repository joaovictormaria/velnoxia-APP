/**
 * O ANTES E O DEPOIS DE UM EVENTO DE AUDITORIA, CAMPO A CAMPO.
 *
 * O `AuditLog` guarda dois objetos JSON inteiros. Despejá-los crus na tela
 * devolveria ao lojista exatamente o trabalho que ele veio evitar: achar a
 * diferença. Aqui se comparam as chaves e se mostram só as que mudaram.
 *
 * ─── POR QUE FORA DA TELA ──────────────────────────────────────────────────
 *
 * Módulo puro: sem React, sem Prisma, sem import de rota. É o que permite
 * testá-lo com valores reais do banco sem montar o painel — e o que impede que
 * a regra de comparação seja reescrita de outro jeito na próxima tela que
 * precisar dela.
 */

export type Mudanca = {
  /** O nome do campo como ele foi gravado. Não é traduzido de propósito. */
  campo: string;
  antes: string;
  depois: string;
};

/**
 * As diferenças entre dois valores gravados.
 *
 * Quando o valor não é um objeto de campos — um array, um número, uma string —,
 * não há campo a comparar: devolve-se uma linha só, em vez de fingir uma
 * tabela. Quando nada mudou, devolve lista vazia, e a tela não oferece o
 * "ver o que mudou" que não mostraria nada.
 */
export function compararValores(antes: unknown, depois: unknown): Mudanca[] {
  const a = comoRegistro(antes);
  const d = comoRegistro(depois);

  if (!a && !d) {
    const umLado = valorLegivel(antes);
    const outroLado = valorLegivel(depois);
    if (umLado === outroLado) return [];
    return [{ campo: "valor", antes: umLado, depois: outroLado }];
  }

  const chaves = [...new Set([...Object.keys(a ?? {}), ...Object.keys(d ?? {})])].sort();

  return chaves
    .map((campo) => ({
      campo,
      antes: valorLegivel(a?.[campo]),
      depois: valorLegivel(d?.[campo]),
    }))
    .filter((m) => m.antes !== m.depois);
}

function comoRegistro(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Um valor de campo, legível.
 *
 * Objetos aninhados viram JSON curto, e não uma parede: o corte em 160
 * caracteres existe para uma linha da tabela continuar sendo uma linha.
 */
export function valorLegivel(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string" || typeof v === "number") return String(v);
  const json = JSON.stringify(v);
  return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}
