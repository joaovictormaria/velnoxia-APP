import { createFileRoute, Link } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import {
  deleteBenefitPlanFn,
  listBenefitPlansFn,
  saveBenefitPlanFn,
} from "@/server/functions/employees.fn";
import { listProductsFn } from "@/server/functions/products.fn";
import { toNumber } from "@/lib/decimal-utils";

/*
  MÓDULO PAGO — BENEFICIOS.

  O BENEFÍCIO: desconto por cargo, exceções por categoria e produto, cota mensal.
  Módulo próprio — ter funcionário cadastrado não implica ter programa de benefício.

  As server functions desta tela já exigem o recurso; a guarda de rota evita
  que digitar a URL renda um painel de erros.
*/
export const Route = createFileRoute("/admin/funcionarios/planos")(
  rotaPremium("BENEFICIOS", PlanosPage),
);

type Tipo = "NONE" | "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
type Limite = "NONE" | "ITEMS_PER_DAY" | "AMOUNT_PER_DAY" | "PER_CATEGORY";

type RegraRascunho = {
  /** "categoria:<id>" ou "produto:<id>" — um alvo só, como no banco. */
  alvo: string;
  type: Tipo;
  value: string;
  dailyLimit: string;
};

type Rascunho = {
  id: string | null;
  name: string;
  defaultType: Tipo;
  defaultValue: string;
  limitMode: Limite;
  limitValue: string;
  allowPayroll: boolean;
  isActive: boolean;
  rules: RegraRascunho[];
};

const VAZIO: Rascunho = {
  id: null,
  name: "",
  defaultType: "PERCENTAGE",
  defaultValue: "30",
  limitMode: "ITEMS_PER_DAY",
  limitValue: "1",
  allowPayroll: false,
  isActive: true,
  rules: [],
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Como cada regra fica escrita na lista, em uma linha. */
function descreverRegra(type: Tipo, value: number): string {
  if (type === "NONE") return "sem desconto";
  if (type === "PERCENTAGE") return `${value}% de desconto`;
  if (type === "FIXED_AMOUNT") return `${moeda.format(value)} de desconto`;
  return `sai por ${moeda.format(value)}`;
}

function PlanosPage() {
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const { data: planos } = useQuery({
    queryKey: ["benefit-plans"],
    queryFn: () => listBenefitPlansFn(),
  });
  // Uma chamada só traz produtos e categorias — é a mesma que a tela de
  // cardápio usa, e não vale inventar outra para repetir a pergunta.
  const { data: cardapio } = useQuery({
    queryKey: ["products", "para-planos"],
    queryFn: () => listProductsFn({ data: {} }),
  });

  const categorias = (cardapio as any)?.categories ?? [];
  const produtos = (cardapio as any)?.products ?? [];

  const nomeDoAlvo = (alvo: string) => {
    const [tipo, id] = alvo.split(":");
    return tipo === "categoria"
      ? (categorias.find((c: any) => c.id === id)?.name ?? "categoria apagada")
      : (produtos.find((p: any) => p.id === id)?.name ?? "produto apagado");
  };

  const salvar = useMutation({
    mutationFn: () => {
      const r = rascunho!;
      return saveBenefitPlanFn({
        data: {
          id: r.id,
          data: {
            name: r.name.trim(),
            defaultType: r.defaultType,
            defaultValue: Number(r.defaultValue.replace(",", ".")) || 0,
            limitMode: r.limitMode,
            limitValue: r.limitValue ? Number(r.limitValue.replace(",", ".")) : null,
            allowPayroll: r.allowPayroll,
            isActive: r.isActive,
          },
          rules: r.rules
            // Uma linha sem alvo é uma que o dono começou e não terminou;
            // mandá-la ao servidor só renderia um erro que ele não pediu.
            .filter((regra) => regra.alvo)
            .map((regra) => {
              const [tipo, id] = regra.alvo.split(":");
              return {
                categoryId: tipo === "categoria" ? id! : null,
                productId: tipo === "produto" ? id! : null,
                type: regra.type,
                value: Number(regra.value.replace(",", ".")) || 0,
                dailyLimit: regra.dailyLimit ? Number(regra.dailyLimit) : null,
              };
            }),
        },
      });
    },
    onSuccess: async (res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      setRascunho(null);
      await queryClient.invalidateQueries({ queryKey: ["benefit-plans"] });
    },
    onError: () => setError("Não foi possível salvar o plano."),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => deleteBenefitPlanFn({ data: { id } }),
    onSuccess: async (res) => {
      setConfirmando(null);
      if (!res.ok) return setError(res.error);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["benefit-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Planos de benefício</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Cada plano diz quanto de desconto o funcionário tem e quanto pode pegar por dia. A regra
            padrão vale para o cardápio inteiro; as exceções mandam mais que ela, e uma exceção de
            produto manda mais que a da categoria.
          </p>
        </div>
        <Link
          to="/admin/funcionarios"
          className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:border-neutral-400"
        >
          Ver funcionários
        </Link>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      {rascunho ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-neutral-900">
              {rascunho.id ? `Editando ${rascunho.name}` : "Novo plano"}
            </h2>
            <button
              type="button"
              onClick={() => setRascunho(null)}
              className="text-neutral-400 hover:text-neutral-700"
              aria-label="Fechar"
            >
              <X className="size-5" />
            </button>
          </div>

          <form
            className="mt-4 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (rascunho.name.trim().length >= 2) salvar.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Nome do plano">
                <input
                  value={rascunho.name}
                  onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })}
                  placeholder="Ex.: Cozinha"
                  className={ENTRADA}
                />
              </Campo>

              <Campo rotulo="Desconto padrão">
                <select
                  value={rascunho.defaultType}
                  onChange={(e) =>
                    setRascunho({ ...rascunho, defaultType: e.target.value as Tipo })
                  }
                  className={ENTRADA}
                >
                  <option value="PERCENTAGE">Porcentagem em tudo</option>
                  <option value="FIXED_AMOUNT">Valor fixo por item</option>
                  <option value="NONE">Nenhum — só nas exceções</option>
                </select>
              </Campo>

              {rascunho.defaultType !== "NONE" && (
                <Campo
                  rotulo={rascunho.defaultType === "PERCENTAGE" ? "Quanto (%)" : "Quanto (R$)"}
                >
                  <input
                    value={rascunho.defaultValue}
                    onChange={(e) => setRascunho({ ...rascunho, defaultValue: e.target.value })}
                    inputMode="decimal"
                    className={ENTRADA}
                  />
                </Campo>
              )}

              <Campo rotulo="Limite do dia">
                <select
                  value={rascunho.limitMode}
                  onChange={(e) =>
                    setRascunho({ ...rascunho, limitMode: e.target.value as Limite })
                  }
                  className={ENTRADA}
                >
                  <option value="ITEMS_PER_DAY">Por número de itens</option>
                  <option value="AMOUNT_PER_DAY">Por valor em reais</option>
                  <option value="PER_CATEGORY">Por categoria</option>
                  <option value="NONE">Sem limite</option>
                </select>
              </Campo>

              {(rascunho.limitMode === "ITEMS_PER_DAY" ||
                rascunho.limitMode === "AMOUNT_PER_DAY") && (
                <Campo
                  rotulo={
                    rascunho.limitMode === "ITEMS_PER_DAY" ? "Itens por dia" : "Reais por dia"
                  }
                >
                  <input
                    value={rascunho.limitValue}
                    onChange={(e) => setRascunho({ ...rascunho, limitValue: e.target.value })}
                    inputMode="decimal"
                    className={ENTRADA}
                  />
                  <span className="mt-1 block text-xs text-neutral-500">
                    {rascunho.limitMode === "AMOUNT_PER_DAY"
                      ? "Conta o preço de cardápio do que ele pegar com desconto."
                      : "Passou disso, o resto do pedido sai por preço cheio."}
                  </span>
                </Campo>
              )}

              {rascunho.limitMode === "PER_CATEGORY" && (
                <p className="self-end text-xs text-neutral-500 sm:col-span-2">
                  No limite por categoria, o número por dia vai em cada exceção de categoria abaixo.
                  Categoria sem número fica sem limite.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-5">
              <Marcador
                marcado={rascunho.allowPayroll}
                onMudar={(v) => setRascunho({ ...rascunho, allowPayroll: v })}
                rotulo="Permitir desconto em folha"
                ajuda="Aparece como forma de pagamento no checkout dele, e o pedido fica em aberto até você quitar."
              />
              <Marcador
                marcado={rascunho.isActive}
                onMudar={(v) => setRascunho({ ...rascunho, isActive: v })}
                rotulo="Plano ativo"
                ajuda="Desativar suspende o benefício de todo mundo que está neste plano."
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-neutral-800">
                  Exceções ({rascunho.rules.length})
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setRascunho({
                      ...rascunho,
                      rules: [
                        ...rascunho.rules,
                        { alvo: "", type: "PERCENTAGE", value: "0", dailyLimit: "" },
                      ],
                    })
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                >
                  <Plus className="size-4" />
                  Adicionar
                </button>
              </div>

              {rascunho.rules.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">
                  Sem exceções, o desconto padrão vale para o cardápio inteiro.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {rascunho.rules.map((regra, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-1 gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
                    >
                      <Campo rotulo="Onde vale">
                        <select
                          value={regra.alvo}
                          onChange={(e) => trocarRegra(i, { alvo: e.target.value })}
                          className={ENTRADA}
                        >
                          <option value="">Escolha...</option>
                          <optgroup label="Categorias">
                            {categorias.map((c: any) => (
                              <option key={c.id} value={`categoria:${c.id}`}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Produtos">
                            {produtos.map((p: any) => (
                              <option key={p.id} value={`produto:${p.id}`}>
                                {p.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </Campo>

                      <Campo rotulo="Como">
                        <select
                          value={regra.type}
                          onChange={(e) => trocarRegra(i, { type: e.target.value as Tipo })}
                          className={ENTRADA}
                        >
                          <option value="PERCENTAGE">Porcentagem</option>
                          <option value="FIXED_AMOUNT">Valor de desconto</option>
                          <option value="FIXED_PRICE">Preço de funcionário</option>
                          <option value="NONE">Sem desconto</option>
                        </select>
                      </Campo>

                      {regra.type === "NONE" ? (
                        <div />
                      ) : (
                        <Campo rotulo={regra.type === "PERCENTAGE" ? "%" : "R$"}>
                          <input
                            value={regra.value}
                            onChange={(e) => trocarRegra(i, { value: e.target.value })}
                            inputMode="decimal"
                            className={ENTRADA}
                          />
                        </Campo>
                      )}

                      {rascunho.limitMode === "PER_CATEGORY" &&
                        regra.alvo.startsWith("categoria:") && (
                          <Campo rotulo="Por dia">
                            <input
                              value={regra.dailyLimit}
                              onChange={(e) => trocarRegra(i, { dailyLimit: e.target.value })}
                              inputMode="numeric"
                              placeholder="2"
                              className={ENTRADA}
                            />
                          </Campo>
                        )}

                      <button
                        type="button"
                        onClick={() =>
                          setRascunho({
                            ...rascunho,
                            rules: rascunho.rules.filter((_, j) => j !== i),
                          })
                        }
                        aria-label="Remover exceção"
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 text-neutral-400 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={salvar.isPending || rascunho.name.trim().length < 2}
                className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
              >
                {salvar.isPending ? "Salvando..." : "Salvar plano"}
              </button>
              <button
                type="button"
                onClick={() => setRascunho(null)}
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:border-neutral-400"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setRascunho(VAZIO)}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
        >
          <Plus className="size-4" />
          Novo plano
        </button>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
          <Tags className="size-5 text-[#E11D2E]" />
          Planos ({planos?.length ?? 0})
        </h2>

        {!planos?.length ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nenhum plano ainda. Crie um e escolha-o na ficha de cada funcionário.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {planos.map((plano) => (
              <li key={plano.id} className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-neutral-900">
                    {plano.name}
                    {!plano.isActive && (
                      <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        desativado
                      </span>
                    )}
                    {plano.allowPayroll && (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        aceita folha
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    Padrão: {descreverRegra(plano.defaultType, toNumber(plano.defaultValue))} ·{" "}
                    {plano.limitMode === "NONE"
                      ? "sem limite diário"
                      : plano.limitMode === "ITEMS_PER_DAY"
                        ? `até ${plano.limitValue} ${Number(plano.limitValue) === 1 ? "item" : "itens"} por dia`
                        : plano.limitMode === "AMOUNT_PER_DAY"
                          ? `até ${moeda.format(toNumber(plano.limitValue ?? 0))} por dia`
                          : "limite por categoria"}
                  </p>
                  {plano.rules.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {plano.rules.map((regra) => (
                        <li key={regra.id} className="text-xs text-neutral-500">
                          {nomeDoAlvo(
                            regra.categoryId
                              ? `categoria:${regra.categoryId}`
                              : `produto:${regra.productId}`,
                          )}
                          : {descreverRegra(regra.type, toNumber(regra.value))}
                          {regra.dailyLimit !== null && ` · até ${regra.dailyLimit} por dia`}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">
                    {plano._count.employees === 0
                      ? "Ninguém neste plano"
                      : `${plano._count.employees} ${plano._count.employees === 1 ? "funcionário" : "funcionários"}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setRascunho({
                      id: plano.id,
                      name: plano.name,
                      defaultType: plano.defaultType,
                      defaultValue: String(plano.defaultValue),
                      limitMode: plano.limitMode,
                      limitValue: plano.limitValue === null ? "" : String(plano.limitValue),
                      allowPayroll: plano.allowPayroll,
                      isActive: plano.isActive,
                      rules: plano.rules.map((regra) => ({
                        alvo: regra.categoryId
                          ? `categoria:${regra.categoryId}`
                          : `produto:${regra.productId}`,
                        type: regra.type,
                        value: String(regra.value),
                        dailyLimit: regra.dailyLimit === null ? "" : String(regra.dailyLimit),
                      })),
                    })
                  }
                  aria-label={`Editar ${plano.name}`}
                  title="Editar"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                >
                  <Pencil className="size-4" />
                </button>

                {confirmando === plano.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-600">Excluir {plano.name}?</span>
                    <button
                      type="button"
                      disabled={excluir.isPending}
                      onClick={() => excluir.mutate(plano.id)}
                      className="rounded-lg bg-[#E11D2E] px-3 py-1.5 font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(null)}
                      className="text-neutral-500 hover:text-neutral-800"
                    >
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmando(plano.id)}
                    aria-label={`Excluir o plano ${plano.name}`}
                    title="Excluir plano"
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 text-neutral-400 hover:border-[#E11D2E] hover:text-[#E11D2E]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          Excluir um plano não apaga ninguém: quem estava nele fica cadastrado, só sem benefício.
        </p>
      </section>
    </div>
  );

  function trocarRegra(i: number, mudanca: Partial<RegraRascunho>) {
    setRascunho((atual) =>
      atual
        ? { ...atual, rules: atual.rules.map((r, j) => (j === i ? { ...r, ...mudanca } : r)) }
        : atual,
    );
  }
}

const ENTRADA =
  "w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-base md:text-sm text-neutral-800 placeholder:text-neutral-400";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">{rotulo}</span>
      {children}
    </label>
  );
}

function Marcador({
  marcado,
  onMudar,
  rotulo,
  ajuda,
}: {
  marcado: boolean;
  onMudar: (v: boolean) => void;
  rotulo: string;
  ajuda: string;
}) {
  return (
    <label className="flex max-w-sm cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={marcado}
        onChange={(e) => onMudar(e.target.checked)}
        className="mt-0.5 size-4 accent-[#E11D2E]"
      />
      <span>
        <span className="block text-sm font-medium text-neutral-800">{rotulo}</span>
        <span className="block text-xs text-neutral-500">{ajuda}</span>
      </span>
    </label>
  );
}
