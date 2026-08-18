import { createHash, randomInt } from "node:crypto";

/**
 * Geração e conferência do código de convite do entregador.
 *
 * Mora fora dos arquivos `.fn.ts` de propósito. Ali, o corpo das server
 * functions é removido do pacote do navegador, mas uma função comum exportada
 * precisa sobreviver — e sobreviveria trazendo `node:crypto` junto, que no
 * navegador quebra o módulo inteiro e derruba qualquer tela que o importe.
 */

/** Sem 0/O e 1/I: o código é lido em voz alta ou copiado de um papel. */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAMANHO = 8;

export function newInviteCode() {
  let s = "";
  for (let i = 0; i < TAMANHO; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/**
 * O código nunca é guardado — só o hash. Quem ler o banco não consegue usar um
 * convite pendente. Como o código tem entropia suficiente e vida curta, o hash
 * simples basta aqui; não é uma senha escolhida por humano.
 */
export const hashInviteCode = (code: string) =>
  createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
