import { createContext, ReactNode, useContext, useState } from "react";

export interface EstoqueContextType {
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  refreshTrigger: number;
  invalidate: () => void;
}

const EstoqueContext = createContext<EstoqueContextType | undefined>(undefined);

export function EstoqueProvider(props: { children: ReactNode }) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const invalidate = () => setRefreshTrigger((t) => t + 1);

  const value: EstoqueContextType = {
    selectedItemId,
    setSelectedItemId,
    refreshTrigger,
    invalidate,
  };

  return (
    <EstoqueContext.Provider value={value}>
      {props.children}
    </EstoqueContext.Provider>
  );
}

export function useEstoque() {
  const context = useContext(EstoqueContext);
  if (!context) {
    throw new Error("useEstoque must be used within EstoqueProvider");
  }
  return context;
}
