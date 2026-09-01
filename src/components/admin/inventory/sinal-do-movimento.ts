/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  O SINAL DE UMA MOVIMENTAÇÃO DE ESTOQUE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `InventoryMovement.quantity` NÃO tem sinal uniforme no banco, e este módulo
 * existe só para dizer isso em voz alta e num lugar só.
 *
 * Quem manda é `InventoryService.calcularDelta`:
 *
 *   PURCHASE, RETURN, PRODUCTION  gravados POSITIVOS, somados
 *   ADJUSTMENT                    gravado com o sinal que o operador quis
 *   RESERVATION                   positivo, mas mexe em `reserved`, não no saldo
 *   CONSUMPTION                   gravado NEGATIVO, aplicado como veio
 *   REVERSAL                      gravado NEGATIVO, aplicado como veio
 *   LOSS                          gravado POSITIVO, e o serviço aplica
 *                                 `onHand: -Math.abs(quantity)`
 *
 * LOSS é o único que sai do estoque guardando um número positivo. É por isso
 * que a tela não pode ler `quantity` cru nem negar "tudo que é saída": até
 * 31/08/2026 o `AuditLog` negava LOSS **e** CONSUMPTION, e o consumo — que já
 * estava negativo — voltava a positivo. A tela mostrava "Consumo +0,1", uma
 * saída de estoque exibida como entrada.
 *
 * ⚠️ O SALDO NUNCA ESTEVE ERRADO. Quem calcula é o serviço, e ele já tratava
 * cada tipo certo. O que estava errado era só a leitura.
 *
 * Se um dia `calcularDelta` for uniformizado — LOSS passando a ser gravado
 * negativo como os outros —, este conjunto fica vazio e nada mais aqui muda.
 */
export const GRAVADO_POSITIVO_MAS_E_SAIDA = new Set(["LOSS"]);

/**
 * A quantidade com o sinal que a pessoa deve ler.
 *
 * Positivo entrou, negativo saiu — independente de como o tipo foi gravado.
 */
export function quantidadeComSinal(tipo: string, quantidade: unknown): number {
  const bruto = Number(quantidade ?? 0);
  if (!Number.isFinite(bruto)) return 0;
  return GRAVADO_POSITIVO_MAS_E_SAIDA.has(tipo) ? -Math.abs(bruto) : bruto;
}
