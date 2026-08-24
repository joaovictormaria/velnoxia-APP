// @ts-nocheck
/**
 * UTILITÃRIO: ConversÃ£o Decimal â†’ number/string
 *
 * Prisma retorna valores monetÃ¡rios como Decimal objects.
 * Frontend espera number ou string para cÃ¡lculos/renderizaÃ§Ã£o.
 *
 * Este mÃ³dulo converte de forma segura com zero perda de precisÃ£o.
 */

/**
 * Converter Decimal para number (seguro para valores < 2^53)
 * CUIDADO: SÃ³ use para valores < Number.MAX_SAFE_INTEGER
 */
export function decimalToNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;

  // Se for Decimal object (tem mÃ©todo toString)
  if (value && typeof value.toString === "function") {
    return parseFloat(value.toString());
  }

  return parseFloat(String(value));
}

/**
 * Converter Decimal para string (preserva precisÃ£o completa)
 * PREFERIDO para valores monetÃ¡rios que serÃ£o exibidos
 */
export function decimalToString(value: any): string {
  if (value === null || value === undefined) return "0.00";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toFixed(2);

  // Se for Decimal object
  if (value && typeof value.toString === "function") {
    return value.toString();
  }

  return String(value);
}

/**
 * Converter array de objetos com valores Decimal
 * Ãštil para server functions que retornam dados do Prisma
 *
 * Exemplo:
 * const orders = await prisma.order.findMany();
 * const converted = convertDecimalFields(orders, ['total', 'subtotal']);
 */
export function convertDecimalFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[],
  format: "number" | "string" = "number"
): T {
  if (!obj) return obj;

  const converted = { ...obj };
  for (const field of fields) {
    if (field in converted) {
      converted[field] =
        format === "string"
          ? decimalToString(converted[field])
          : decimalToNumber(converted[field]);
    }
  }

  return converted;
}

/**
 * Converter array de objetos (batch conversion)
 */
export function convertDecimalFieldsArray<T extends Record<string, any>>(
  items: T[],
  fields: (keyof T)[],
  format: "number" | "string" = "number"
): T[] {
  return items.map((item) => convertDecimalFields(item, fields, format));
}

/**
 * Tipo de retorno de server function com conversÃ£o automÃ¡tica
 * Use em server functions que retornam dados com Decimal
 *
 * Exemplo:
 * export const getOrderFn = createServerFn(...)
 *   .handler(async () => {
 *     const order = await prisma.order.findUnique(...);
 *     return convertOrderForClient(order);
 *   });
 */
export function convertOrderForClient(order: any) {
  return convertDecimalFields(
    order,
    ["subtotal", "deliveryFee", "discount", "total", "employeeDiscount"],
    "number"
  );
}

export function convertProductForClient(product: any) {
  return convertDecimalFields(product, ["basePrice"], "number");
}

export function convertProductSizeForClient(size: any) {
  return convertDecimalFields(size, ["price"], "number");
}

export function convertExtraForClient(extra: any) {
  return convertDecimalFields(extra, ["price"], "number");
}

export function convertCouponForClient(coupon: any) {
  return convertDecimalFields(coupon, ["discountValue", "minOrderValue"], "number");
}

export function convertPromotionForClient(promo: any) {
  return convertDecimalFields(promo, ["price", "originalPrice"], "number");
}

export function convertStoreSettingsForClient(settings: any) {
  return convertDecimalFields(
    settings,
    ["deliveryFee", "freeDeliveryMinOrder", "minOrderValue"],
    "number"
  );
}

