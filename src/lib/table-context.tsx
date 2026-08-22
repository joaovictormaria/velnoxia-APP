import { createContext, useContext, useEffect, useState } from "react";

interface TableContextType {
  tableId: string | null;
  tableNumber: number | null;
  setTableId: (id: string | null, number?: number) => void;
  clearTable: () => void;
}

const TableContext = createContext<TableContextType | undefined>(undefined);

const STORAGE_KEY = "velnox_table_id";
const STORAGE_NUMBER_KEY = "velnox_table_number";

export function TableProvider({ children }: { children: React.ReactNode }) {
  const [tableId, setTableIdState] = useState<string | null>(null);
  const [tableNumber, setTableNumberState] = useState<number | null>(null);

  // Recupera do localStorage na montagem
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      const storedNumber = localStorage.getItem(STORAGE_NUMBER_KEY);
      if (stored) {
        setTableIdState(stored);
        if (storedNumber) {
          setTableNumberState(parseInt(storedNumber));
        }
      }
    }
  }, []);

  const setTableId = (id: string | null, number?: number) => {
    if (id) {
      setTableIdState(id);
      setTableNumberState(number || null);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, id);
        if (number) {
          localStorage.setItem(STORAGE_NUMBER_KEY, number.toString());
        }
      }
    } else {
      clearTable();
    }
  };

  const clearTable = () => {
    setTableIdState(null);
    setTableNumberState(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_NUMBER_KEY);
    }
  };

  return (
    <TableContext.Provider value={{ tableId, tableNumber, setTableId, clearTable }}>
      {children}
    </TableContext.Provider>
  );
}

export function useTable() {
  const context = useContext(TableContext);
  if (!context) {
    throw new Error("useTable must be used within TableProvider");
  }
  return context;
}
