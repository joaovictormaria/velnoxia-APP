import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AvisoDoCarrinho } from "@/components/site/pizzaria2/AvisoDoCarrinho";
import type { LucideIcon } from "lucide-react";

export type CartLineExtra = { id: string; label: string; price: number };

export type CartLine = {
  id: string;
  name: string;
  sizeLabel?: string;
  image?: string;
  icon?: LucideIcon;
  unitPrice: number;
  extras: CartLineExtra[];
  note?: string;
  qty: number;
  /**
   * Identifiers the checkout sends to the server, which re-prices every line
   * from the database — the displayed unitPrice above is never trusted.
   */
  productSlug: string;
  sizeId?: string;
  optionIds?: string[];
  secondProductSlug?: string;
};

type CartContextValue = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "id">) => void;
  removeLine: (id: string) => void;
  incrementQty: (id: string) => void;
  decrementQty: (id: string) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
  deliveryFee: number;
  total: number;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "velnox:pizzaria2:cart";
const DELIVERY_FEE = 6;

function readInitialLines(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Starts empty so the very first client render matches the server (which
  // has no access to sessionStorage) — the real cart loads right after, in
  // this effect, instead of in the initializer where it would run during
  // hydration itself and trigger a mismatch.
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLines(readInitialLines());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      // `icon` holds a component reference (Lucide forwardRef object), not
      // plain data — JSON.stringify silently collapses it to `{}`, which then
      // crashes React on the next reload when re-rendered as an element type.
      // Drop it before persisting; MenuThumb falls back to a blank tinted
      // tile for icon-only items after a hard refresh, which is harmless.
      const serializable = lines.map(({ icon: _icon, ...rest }) => rest);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // sessionStorage indisponível, carrinho segue apenas em memória
    }
  }, [lines]);

  const [avisando, setAvisando] = useState(false);
  const relogioDoAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLine = useCallback((line: Omit<CartLine, "id">) => {
    setLines((prev) => [
      ...prev,
      { ...line, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    ]);
    /*
     * Adicionar dois itens seguidos reinicia a contagem em vez de somar dois
     * avisos: o segundo toque não deve fazer o aviso do primeiro sumir na
     * cara de quem acabou de tocar.
     */
    if (relogioDoAviso.current) clearTimeout(relogioDoAviso.current);
    setAvisando(true);
    relogioDoAviso.current = setTimeout(() => setAvisando(false), 1800);
  }, []);

  useEffect(() => () => {
    if (relogioDoAviso.current) clearTimeout(relogioDoAviso.current);
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const incrementQty = useCallback((id: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l)));
  }, []);

  const decrementQty = useCallback((id: string) => {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.id !== id) return [l];
        if (l.qty <= 1) return [];
        return [{ ...l, qty: l.qty - 1 }];
      }),
    );
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (l.unitPrice + l.extras.reduce((s, e) => s + e.price, 0)) * l.qty,
        0,
      ),
    [lines],
  );
  const itemCount = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);
  const deliveryFee = lines.length > 0 ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;

  const value: CartContextValue = {
    lines,
    addLine,
    removeLine,
    incrementQty,
    decrementQty,
    clearCart,
    subtotal,
    itemCount,
    deliveryFee,
    total,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      <AvisoDoCarrinho visivel={avisando} />
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de <CartProvider>");
  return ctx;
}
