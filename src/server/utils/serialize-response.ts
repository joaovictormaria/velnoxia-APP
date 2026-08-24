/**
 * Serializa respostas removendo Decimal (não é JSON-serializable)
 * Converte recursivamente Decimal → number
 */
export function serializeResponse<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (typeof data === 'object') {
    // Check if it's a Decimal
    if ('toFixed' in data && 'toNumber' in data) {
      return (data as any).toNumber() as T;
    }

    if (Array.isArray(data)) {
      return data.map(item => serializeResponse(item)) as T;
    }

    // Process object properties
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === 'object') {
        // Handle Decimal
        if ('toFixed' in value && 'toNumber' in value) {
          result[key] = (value as any).toNumber();
        } else if (Array.isArray(value)) {
          result[key] = value.map(item => serializeResponse(item));
        } else {
          result[key] = serializeResponse(value);
        }
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  return data;
}
