import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  Download,
  Search,
  ChevronUp,
  ChevronDown,
  Filter,
} from "lucide-react";
import { getTransactionHistory } from "@/server/functions/transaction-history.fn";

export const Route = createFileRoute("/admin/relatorios/historico")({
  component: TransactionHistoryPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type SortField = "date" | "type" | "amount" | "status";
type SortOrder = "asc" | "desc";
type FilterStatus = "all" | "PAID" | "PENDING" | "REFUNDED";

interface Transaction {
  id: string;
  orderId: string;
  orderNumber: number;
  type: "SALE" | "REFUND" | "ADJUSTMENT";
  amount: number;
  cost?: number;
  profit?: number;
  paymentMethod?: string;
  paymentStatus: "PAID" | "PENDING" | "REFUNDED";
  createdAt: Date;
  customerName?: string;
  notes?: string;
}

function TransactionHistoryPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [daysRange, setDaysRange] = useState(30);

  const { data: transactions = [], isPending } = useQuery({
    queryKey: ["transactionHistory", daysRange],
    queryFn: async () => {
      try {
        const result = await getTransactionHistory({ data: { days: daysRange } });
        return Array.isArray(result) ? result : [];
      } catch (err) {
        console.error("Erro ao carregar histórico:", err);
        return [];
      }
    },
  });

  const filtered = useMemo(() => {
    let result = transactions.filter((t) => {
      const matchesSearch =
        search === "" ||
        t.orderNumber.toString().includes(search) ||
        t.customerName?.toLowerCase().includes(search.toLowerCase()) ||
        t.paymentMethod?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = filterStatus === "all" || t.paymentStatus === filterStatus;

      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === "date") {
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [transactions, search, filterStatus, sortField, sortOrder]);

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const exportToCSV = () => {
    const headers = ["Data", "Pedido", "Cliente", "Tipo", "Valor", "Custo", "Lucro", "Status"];
    const rows = filtered.map((t) => [
      new Date(t.createdAt).toLocaleString("pt-BR"),
      t.orderNumber,
      t.customerName || "-",
      t.type,
      currency.format(t.amount),
      t.cost ? currency.format(t.cost) : "-",
      t.profit ? currency.format(t.profit) : "-",
      t.paymentStatus,
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `historico-transacoes-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="rounded-lg p-2 hover:bg-neutral-100"
          >
            <ArrowLeft className="size-5 text-neutral-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Histórico de Transações</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Registro detalhado de todas as movimentações financeiras
            </p>
          </div>
        </div>
      </header>

      {/* Filtros */}
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Buscar por pedido, cliente ou método..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg bg-white py-2.5 pl-10 pr-4 text-sm focus:border-[#E11D2E] focus:outline-none focus:ring-1 focus:ring-[#E11D2E]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="size-4 text-neutral-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="border border-neutral-200 rounded-lg bg-white px-3 py-2.5 text-sm focus:border-[#E11D2E] focus:outline-none focus:ring-1 focus:ring-[#E11D2E]"
            >
              <option value="all">Todos os status</option>
              <option value="PAID">Pago</option>
              <option value="PENDING">Pendente</option>
              <option value="REFUNDED">Reembolsado</option>
            </select>
          </div>

          <select
            value={daysRange}
            onChange={(e) => setDaysRange(Number(e.target.value))}
            className="border border-neutral-200 rounded-lg bg-white px-3 py-2.5 text-sm focus:border-[#E11D2E] focus:outline-none focus:ring-1 focus:ring-[#E11D2E]"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="365">Últimos 12 meses</option>
          </select>

          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
        </div>

        <div className="text-xs text-neutral-500">
          {filtered.length} transação(ções) encontrada(s)
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-200 bg-neutral-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">
                <button
                  onClick={() => handleToggleSort("date")}
                  className="flex items-center gap-2 hover:text-neutral-900"
                >
                  Data
                  {sortField === "date" && (
                    sortOrder === "asc" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Pedido</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">
                <button
                  onClick={() => handleToggleSort("type")}
                  className="flex items-center gap-2 hover:text-neutral-900"
                >
                  Tipo
                  {sortField === "type" && (
                    sortOrder === "asc" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">
                <button
                  onClick={() => handleToggleSort("amount")}
                  className="flex items-center justify-end gap-2 hover:text-neutral-900"
                >
                  Valor
                  {sortField === "amount" && (
                    sortOrder === "asc" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">Custo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700">Lucro</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">
                <button
                  onClick={() => handleToggleSort("status")}
                  className="flex items-center gap-2 hover:text-neutral-900"
                >
                  Status
                  {sortField === "status" && (
                    sortOrder === "asc" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />
                  )}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-neutral-500">
                  Carregando transações...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-neutral-500">
                  Nenhuma transação encontrada
                </td>
              </tr>
            ) : (
              filtered.map((transaction) => (
                <tr key={transaction.id} className="border-b border-neutral-200 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-neutral-900">
                    {new Date(transaction.createdAt).toLocaleDateString("pt-BR")}
                    <div className="text-xs text-neutral-500">
                      {new Date(transaction.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                    #{transaction.orderNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-700">
                    {transaction.customerName || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                        transaction.type === "SALE"
                          ? "bg-blue-100 text-blue-700"
                          : transaction.type === "REFUND"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {transaction.type === "SALE"
                        ? "Venda"
                        : transaction.type === "REFUND"
                          ? "Reembolso"
                          : "Ajuste"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-neutral-900">
                    {currency.format(transaction.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-neutral-700">
                    {transaction.cost ? currency.format(transaction.cost) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium">
                    <span
                      className={
                        transaction.profit && transaction.profit > 0
                          ? "text-emerald-700"
                          : transaction.profit && transaction.profit < 0
                            ? "text-red-700"
                            : "text-neutral-500"
                      }
                    >
                      {transaction.profit ? currency.format(transaction.profit) : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                        transaction.paymentStatus === "PAID"
                          ? "bg-emerald-100 text-emerald-700"
                          : transaction.paymentStatus === "PENDING"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {transaction.paymentStatus === "PAID"
                        ? "Pago"
                        : transaction.paymentStatus === "PENDING"
                          ? "Pendente"
                          : "Reembolsado"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        💡 Dica: Você pode ordenar clicando nos cabeçalhos das colunas e filtrar por período para acompanhar tendências.
      </p>
    </div>
  );
}
