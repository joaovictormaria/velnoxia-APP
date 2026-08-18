import { useEffect, useState } from "react";

const STORAGE_KEY = "velnox:onboarding";

export const DEFAULT_BUSINESS_TYPE = "Pizzaria";
export const DEFAULT_BUSINESS_NAME = "Bella Pizza";
export const DEFAULT_BUSINESS_PHONE = "(11) 99999-9999";
export const DEFAULT_BUSINESS_EMAIL = "";

type OnboardingData = {
  businessType: string;
  businessName: string;
  businessPhone: string;
  businessEmail: string;
};

const defaults: OnboardingData = {
  businessType: DEFAULT_BUSINESS_TYPE,
  businessName: DEFAULT_BUSINESS_NAME,
  businessPhone: DEFAULT_BUSINESS_PHONE,
  businessEmail: DEFAULT_BUSINESS_EMAIL,
};

/** Reads the business info the client entered in the "Criar meu site" onboarding
 * form (stored client-side in sessionStorage), falling back to the demo defaults
 * when someone opens /$storeSlug directly without going through that flow. */
export function usePizzariaOnboarding(): OnboardingData {
  const [data, setData] = useState<OnboardingData>(defaults);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<OnboardingData>;
      setData({
        businessType: parsed.businessType?.trim() || DEFAULT_BUSINESS_TYPE,
        businessName: parsed.businessName?.trim() || DEFAULT_BUSINESS_NAME,
        businessPhone: parsed.businessPhone?.trim() || DEFAULT_BUSINESS_PHONE,
        businessEmail: parsed.businessEmail?.trim() || DEFAULT_BUSINESS_EMAIL,
      });
    } catch {
      // Malformed session data — keep defaults.
    }
  }, []);

  return data;
}

export function whatsappLink(phone: string, message?: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${withCountryCode}${query}`;
}
