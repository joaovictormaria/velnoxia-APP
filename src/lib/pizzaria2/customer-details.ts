/**
 * What the customer typed at checkout, kept on their own device so a second
 * order doesn't mean typing name, phone and address all over again.
 *
 * localStorage rather than sessionStorage on purpose: someone who orders on
 * Friday and again next week is the same person on the same phone, and closing
 * the tab shouldn't erase that. Scoped per store — the same device may order
 * from several lanchonetes, and each keeps its own address (a customer might
 * use the work address for one and home for another).
 *
 * Deliberately not sent to the server or tied to the admin session: this is a
 * convenience for the person ordering, not an account.
 */

export type CustomerDetails = {
  name: string;
  phone: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  type: "DELIVERY" | "PICKUP";
  paymentMethod: string;
};

const EMPTY: CustomerDetails = {
  name: "",
  phone: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  type: "DELIVERY",
  paymentMethod: "PIX",
};

function storageKey(storeSlug: string) {
  return `velnox:customer:${storeSlug}`;
}

export function loadCustomerDetails(storeSlug: string): CustomerDetails {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(storeSlug));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<CustomerDetails>;
    // Field by field so a stored shape from an older version can't inject
    // unexpected keys into the form state.
    return {
      name: parsed.name ?? "",
      phone: parsed.phone ?? "",
      street: parsed.street ?? "",
      number: parsed.number ?? "",
      complement: parsed.complement ?? "",
      neighborhood: parsed.neighborhood ?? "",
      city: parsed.city ?? "",
      type: parsed.type === "PICKUP" ? "PICKUP" : "DELIVERY",
      paymentMethod: parsed.paymentMethod ?? "PIX",
    };
  } catch {
    return EMPTY;
  }
}

export function saveCustomerDetails(storeSlug: string, details: CustomerDetails) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(storeSlug), JSON.stringify(details));
  } catch {
    // Private browsing or a full quota — remembering is a nicety, never a
    // reason to fail an order that already went through.
  }
}
