/**
 * Address lookup by CEP through ViaCEP — public, no key, CORS enabled, so it
 * runs straight from the browser without a server round trip of our own.
 *
 * Every failure path returns null rather than throwing: a lookup that does not
 * answer must never block someone from typing the address by hand and
 * finishing the order.
 */

export type CepAddress = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

export function normalizeCep(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function formatCep(value: string) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function isCompleteCep(value: string) {
  return normalizeCep(value).length === 8;
}

export async function lookupCep(
  value: string,
  signal?: AbortSignal,
): Promise<CepAddress | null> {
  const cep = normalizeCep(value);
  if (cep.length !== 8) return null;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      erro?: boolean | string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    // ViaCEP answers 200 with { "erro": true } for a well-formed but
    // non-existent CEP — the status code alone is not enough.
    if (data.erro) return null;

    return {
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    };
  } catch {
    // Offline, blocked, or aborted because a newer CEP was typed.
    return null;
  }
}
