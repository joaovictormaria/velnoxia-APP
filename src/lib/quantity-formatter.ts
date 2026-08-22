export function formatQuantity(quantity: number | string, unitCode?: string): string {
  const num = typeof quantity === "string" ? parseFloat(quantity) : quantity;

  if (isNaN(num)) return "0";

  const code = (unitCode || "").toLowerCase();

  if (code === "g" || code === "mg" || code === "un") {
    // Sem casas decimais para gramas, miligramas e unidades
    return Math.round(num).toLocaleString("pt-BR");
  }

  if (code === "kg" || code === "l" || code === "ml") {
    // 2 casas decimais com vírgula
    return num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Padrão: 2 casas decimais
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getQuantityStep(unitCode?: string): number {
  const code = (unitCode || "").toLowerCase();

  if (code === "g" || code === "mg" || code === "un") {
    return 1; // Números inteiros
  }

  return 0.1; // Decimais para kg, l, ml
}
