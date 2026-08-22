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

  const invalidate = () => {
    console.log("[EstoqueContext] invalidate() called, incrementing refreshTrigger");
    setRefreshTrigger((t) => {
      const newValue = t + 1;
      console.log("[EstoqueContext] refreshTrigger updated from", t, "to", newValue);
      return newValue;
    });
  };

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
