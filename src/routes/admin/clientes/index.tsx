import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { listCustomersFn } from "@/server/functions/customers.fn";

export const Route = createFileRoute("/admin/clientes/")({
  component: CustomersPage,
});

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Stored as digits only; shown the way a person reads a phone. */
function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function CustomersPage() {
  const [search, setSearch] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => listCustomersFn({ data: { search: search || undefined } }),
  });

  const total = data?.length ?? 0;
  const recorrentes = data?.filter((c) => c.orderCount > 1).length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-neutral-900">Clientes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Quem já pediu na sua loja. A ficha nasce sozinha no primeiro pedido.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="w-full rounded-xl border border-neutral-300 py-2.5 pl-9 pr-3 text-sm text-neutral-900"
          />
        </div>
        {!isPending && (
          <p className="text-sm text-neutral-500">
            {total} {total === 1 ? "cliente" : "clientes"}
            {recorrentes > 0 && ` · ${recorrentes} com mais de um pedido`}
          </p>
        )}
      </div>

      {isPending ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : !data?.length ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {search
            ? "Ninguém encontrado com esse nome ou telefone."
            : "Nenhum cliente ainda. A ficha é criada sozinha quando alguém faz o primeiro pedido."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 text-right font-medium">Pedidos</th>
                <th className="px-4 py-3 text-right font-medium">Total gasto</th>
                <th className="px-4 py-3 font-medium">Último pedido</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      cliente desde {dateFormat.format(new Date(c.createdAt))}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://wa.me/55${c.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-700 hover:text-[#E11D2E] hover:underline"
                    >
                      {formatPhone(c.phone)}
                    </a>
                    {c.email && <p className="text-xs text-neutral-500">{c.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-neutral-900">{c.orderCount}</span>
                    {c.orderCount > 1 && (
                      <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        volta sempre
                      </span>
                    )}
                  </td>
                  {/* Cancelled orders are left out of the total — money that
                      never arrived should not look like money spent. */}
                  <td className="px-4 py-3 text-right font-medium text-neutral-900">
                    {money(c.totalSpent)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.lastOrderAt ? dateFormat.format(new Date(c.lastOrderAt)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
