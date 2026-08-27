import { Decimal } from "@prisma/client/runtime/client";

/**
 * O mesmo formato, com `Decimal` trocado por `number`.
 *
 * O tipo precisa acompanhar a conversão: uma função genérica que devolvesse
 * `T` manteria `Decimal` na assinatura, e o compilador continuaria recusando o
 * handler mesmo com o valor já convertido em execução.
 */
export type Serializado<T> =
  T extends Decimal ? number :
  T extends Date ? Date :
  T extends Array<infer U> ? Array<Serializado<U>> :
  T extends object ? { [K in keyof T]: Serializado<T[K]> } :
  T;

/**
 * Decimal não atravessa a fronteira da server function.
 *
 * O TanStack Start serializa o retorno do handler, e um `Decimal` do Prisma não
 * é um valor serializável — o compilador recusa o handler inteiro, e o tipo que
 * chega ao cliente colapsa para `{}`. Foi essa a origem dos 29 erros do
 * CostAnalysis: não faltava tipagem no componente, faltava número no lugar de
 * objeto do outro lado do fio. E não era só tipo — o componente chamava
 * métodos de Decimal sobre valores que nunca chegariam como Decimal.
 *
 * Converter aqui, e não no componente, mantém o cálculo em Decimal onde ele
 * importa — dentro do serviço, somando centavos em laço — e entrega ao
 * navegador o que o navegador sabe formatar.
 */
export function numeros<T>(valor: T): Serializado<T> {
  if (valor === null || valor === undefined) return valor as Serializado<T>;
  if (typeof valor === "object") {
    const qualquer = valor as any;
    // Decimal do Prisma: tem toNumber() e não é Date nem array.
    if (typeof qualquer.toNumber === "function" && !(valor instanceof Date)) {
      return qualquer.toNumber();
    }
    if (Array.isArray(valor)) return valor.map(numeros) as Serializado<T>;
    if (valor instanceof Date) return valor as Serializado<T>;
    const saida: any = {};
    for (const [chave, v] of Object.entries(qualquer)) saida[chave] = numeros(v);
    return saida;
  }
  return valor as Serializado<T>;
}
