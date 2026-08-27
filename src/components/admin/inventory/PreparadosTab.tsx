import { useEffect, useState } from "react";
import {
  adminListarPreparados,
  adminOpcoesDePreparado,
  adminCriarPreparado,
  adminAtualizarReceitaDePreparado,
  adminProduzir,
  adminHistoricoDeProducao,
  adminReverterProducao,
} from "@/server/functions/preparado.fn";

/**
 * A aba Preparados.
 *
 * Um preparado é um item de estoque que a cozinha produz a partir de outros —
 * molho, massa, recheio. Ele tem ficha técnica e rendimento, e o custo dele sai
 * da produção, não de uma tabela de preços.
 *
 * Esta tela NÃO decide nada. Ficha, produção, custo e reversão vivem nos
 * serviços; aqui só se coleta o que o operador digitou e se mostra o que voltou.
 * A única lógica local é o `runToken`, e ela precisa ser local — ver abaixo.
 */

type Insumo = { id: string; nome: string; tipo: string; unidade: string; baseUnitId: string; custo: number | null };
type Unidade = { id: string; code: string; name: string };
type LinhaDeFicha = { inventoryItemId: string; quantidade: string; unitId: string };

type Preparado = {
  id: string;
  nome: string;
  sku: string | null;
  unidade: string;
  baseUnitId: string;
  emEstoque: number;
  reservado: number;
  disponivel: number;
  custo: number | null;
  receita: {
    id: string;
    versao: number;
    rendimento: number | null;
    unidadeDoRendimento: string | null;
    yieldUnitId: string | null;
    insumos: Array<{ id: string; inventoryItemId: string; nome: string; quantidade: number; unitId: string; unidade: string }>;
  } | null;
};

type Corrida = {
  id: string;
  preparado: string;
  versaoDaReceita: number;
  unidade: string;
  planejado: number;
  produzido: number;
  perda: number | null;
  eficiencia: number | null;
  custoTotal: number | null;
  custoUnitario: number | null;
  status: string;
  inconsistencia: string | null;
  autor: string | null;
  criadaEm: string | Date;
};

/** R$ 7.200,00 — e não "R$ 7200.00", que ninguém lê como dinheiro daqui. */
const brl = (v: number | null | undefined) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

/** 5,2 — vírgula decimal, e sem zeros que só poluem: 4 em vez de 4,000. */
const num = (v: number | null | undefined, casas = 3) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas });

export function PreparadosTab() {
  const [preparados, setPreparados] = useState<Preparado[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [historico, setHistorico] = useState<Corrida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [criando, setCriando] = useState(false);
  const [editandoFicha, setEditandoFicha] = useState<Preparado | null>(null);
  const [produzindo, setProduzindo] = useState<Preparado | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const [lista, opcoes, corridas] = await Promise.all([
        adminListarPreparados({} as any),
        adminOpcoesDePreparado({} as any),
        adminHistoricoDeProducao({ data: { limite: 50 } } as any),
      ]);
      setPreparados(lista as any);
      setInsumos((opcoes as any).insumos);
      setUnidades((opcoes as any).unidades);
      setHistorico(corridas as any);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const executar = async (acao: () => Promise<unknown>) => {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  if (carregando) {
    return <div className="p-6 text-neutral-600">Carregando preparados…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Preparados</h2>
          <p className="text-sm text-neutral-600">
            O que a cozinha produz a partir de outros itens. Produzir baixa os
            insumos e dá entrada no preparado; o pedido consome o preparado.
          </p>
        </div>
        <button
          onClick={() => setCriando(true)}
          disabled={ocupado}
          className="px-4 py-2 rounded bg-neutral-900 text-white text-sm disabled:opacity-50"
        >
          + Novo preparado
        </button>
      </div>

      {erro && (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-sm text-red-800">
          {erro}
        </div>
      )}

      {preparados.length === 0 ? (
        <div className="p-6 rounded border border-dashed text-center text-neutral-600">
          Nenhum preparado ainda. Um preparado é algo que você produz — molho,
          massa, recheio — e que entra na ficha dos produtos do cardápio.
        </div>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left p-3">Preparado</th>
                <th className="text-right p-3">Em estoque</th>
                <th className="text-right p-3">Reservado</th>
                <th className="text-right p-3">Disponível</th>
                <th className="text-right p-3">Custo</th>
                <th className="text-left p-3">Receita</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {preparados.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{p.nome}</div>
                    {p.sku && <div className="text-xs text-neutral-500">{p.sku}</div>}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {num(p.emEstoque)} {p.unidade}
                  </td>
                  <td className="p-3 text-right tabular-nums text-amber-700">
                    {num(p.reservado)}
                  </td>
                  {/*
                    Disponível é onHand − reserved: o que ainda pode ser
                    prometido. É o número que o pedido consulta, e por isso o que
                    o operador precisa ver antes de decidir se produz mais.
                  */}
                  <td
                    className={`p-3 text-right tabular-nums font-medium ${
                      p.disponivel < 0 ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    {num(p.disponivel)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {brl(p.custo)}
                    {p.custo != null && (
                      <span className="text-xs text-neutral-500">/{p.unidade}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {p.receita ? (
                      <span className="text-neutral-700">
                        v{p.receita.versao} · rende {num(p.receita.rendimento)}{" "}
                        {p.receita.unidadeDoRendimento} · {p.receita.insumos.length}{" "}
                        insumo{p.receita.insumos.length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-neutral-400">sem receita</span>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {p.receita && (
                      <>
                        <button
                          onClick={() => setProduzindo(p)}
                          disabled={ocupado}
                          className="px-3 py-1 rounded bg-neutral-900 text-white text-xs mr-2 disabled:opacity-50"
                        >
                          Produzir
                        </button>
                        <button
                          onClick={() => setEditandoFicha(p)}
                          disabled={ocupado}
                          className="px-3 py-1 rounded border text-xs disabled:opacity-50"
                        >
                          Ficha
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HistoricoDeProducao
        corridas={historico}
        ocupado={ocupado}
        onReverter={(runId) =>
          executar(() => adminReverterProducao({ data: { runId } } as any))
        }
      />

      {criando && (
        <FichaDePreparado
          titulo="Novo preparado"
          insumos={insumos}
          unidades={unidades}
          ocupado={ocupado}
          onCancelar={() => setCriando(false)}
          onSalvar={async (dados) => {
            const ok = await executar(() =>
              adminCriarPreparado({ data: dados } as any),
            );
            if (ok) setCriando(false);
          }}
        />
      )}

      {editandoFicha && (
        <FichaDePreparado
          titulo={`Ficha de ${editandoFicha.nome}`}
          insumos={insumos}
          unidades={unidades}
          ocupado={ocupado}
          existente={editandoFicha}
          onCancelar={() => setEditandoFicha(null)}
          onSalvar={async (dados) => {
            const ok = await executar(() =>
              adminAtualizarReceitaDePreparado({
                data: {
                  compositionId: editandoFicha.receita!.id,
                  dados: {
                    items: dados.receita.items,
                    yieldQuantity: dados.receita.yieldQuantity,
                    yieldUnitId: dados.receita.yieldUnitId,
                  },
                },
              } as any),
            );
            if (ok) setEditandoFicha(null);
          }}
        />
      )}

      {produzindo && (
        <ProducaoForm
          preparado={produzindo}
          ocupado={ocupado}
          onCancelar={() => setProduzindo(null)}
          onProduzir={async (dados) => {
            const ok = await executar(() => adminProduzir({ data: dados } as any));
            if (ok) setProduzindo(null);
          }}
        />
      )}
    </div>
  );
}

// ====================================================================

function Modal(props: { titulo: string; children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold">{props.titulo}</h3>
          <button onClick={props.onFechar} className="text-neutral-500 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

/**
 * Ficha técnica: os insumos e o rendimento.
 *
 * O rendimento é obrigatório e o formulário diz por quê: sem saber quanto a
 * receita rende, não há fator de escala — produzir 8 kg de uma receita de
 * denominador desconhecido é uma conta impossível.
 */
function FichaDePreparado(props: {
  titulo: string;
  insumos: Insumo[];
  unidades: Unidade[];
  ocupado: boolean;
  existente?: Preparado;
  onCancelar: () => void;
  onSalvar: (dados: {
    nome: string;
    baseUnitId: string;
    sku?: string | null;
    receita: {
      items: Array<{ inventoryItemId: string; quantity: number; unitId: string; sortOrder: number }>;
      yieldQuantity: number;
      yieldUnitId: string;
      isActive: boolean;
    };
  }) => void;
}) {
  const editando = !!props.existente;
  const [nome, setNome] = useState(props.existente?.nome ?? "");
  const [baseUnitId, setBaseUnitId] = useState(
    props.existente?.baseUnitId ?? props.unidades[0]?.id ?? "",
  );
  const [rendimento, setRendimento] = useState(
    props.existente?.receita?.rendimento != null ? String(props.existente.receita.rendimento) : "",
  );
  const [yieldUnitId, setYieldUnitId] = useState(
    props.existente?.receita?.yieldUnitId ?? props.existente?.baseUnitId ?? props.unidades[0]?.id ?? "",
  );
  const [linhas, setLinhas] = useState<LinhaDeFicha[]>(
    props.existente?.receita?.insumos.map((i) => ({
      inventoryItemId: i.inventoryItemId,
      quantidade: String(i.quantidade),
      unitId: i.unitId,
    })) ?? [{ inventoryItemId: "", quantidade: "", unitId: "" }],
  );

  const trocarLinha = (idx: number, campo: keyof LinhaDeFicha, valor: string) => {
    const novas = [...linhas];
    novas[idx] = { ...novas[idx], [campo]: valor };
    if (campo === "inventoryItemId") {
      const insumo = props.insumos.find((i) => i.id === valor);
      if (insumo) novas[idx].unitId = insumo.baseUnitId;
    }
    setLinhas(novas);
  };

  const custoEstimado = linhas.reduce((soma, l) => {
    const insumo = props.insumos.find((i) => i.id === l.inventoryItemId);
    const q = parseFloat(l.quantidade);
    if (!insumo?.custo || !Number.isFinite(q)) return soma;
    return soma + insumo.custo * q;
  }, 0);
  const rendimentoNum = parseFloat(rendimento);
  const custoPorUnidade =
    custoEstimado > 0 && Number.isFinite(rendimentoNum) && rendimentoNum > 0
      ? custoEstimado / rendimentoNum
      : null;

  const codigoDaUnidade = (id: string) =>
    props.unidades.find((u) => u.id === id)?.code ?? "";

  const nomeExibido = editando
    ? props.existente!.nome
    : nome.trim() || "este preparado";
  const unidadeDoRendimento = codigoDaUnidade(yieldUnitId);

  /*
   * A frase que liga os campos.
   *
   * Sem ela a tela mostra "Quantidade: 5,2 kg" e "Rendimento: 4 kg" em caixas
   * separadas, e cabe ao usuário descobrir sozinho que um vira o outro. É
   * justamente aí que "rendimento" era lido como "quanto de ingrediente eu
   * uso" — o contrário do que o campo significa.
   */
  const insumosPreenchidos = linhas
    .map((l) => ({
      nome: props.insumos.find((i) => i.id === l.inventoryItemId)?.nome,
      quantidade: parseFloat(l.quantidade),
      unidade: codigoDaUnidade(l.unitId),
    }))
    .filter((l) => l.nome && Number.isFinite(l.quantidade) && l.quantidade > 0);

  const temResumo = insumosPreenchidos.length > 0 && rendimentoNum > 0;

  const salvar = () => {
    const items = linhas
      .filter((l) => l.inventoryItemId && parseFloat(l.quantidade) > 0)
      .map((l, idx) => ({
        inventoryItemId: l.inventoryItemId,
        quantity: parseFloat(l.quantidade),
        unitId: l.unitId,
        sortOrder: idx,
      }));

    props.onSalvar({
      nome,
      baseUnitId,
      sku: null,
      receita: { items, yieldQuantity: rendimentoNum, yieldUnitId, isActive: true },
    });
  };

  const podeSalvar =
    (editando || nome.trim().length > 0) &&
    rendimentoNum > 0 &&
    yieldUnitId &&
    linhas.some((l) => l.inventoryItemId && parseFloat(l.quantidade) > 0);

  return (
    <Modal titulo={props.titulo} onFechar={props.onCancelar}>
      <div className="space-y-4">
        {!editando && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">
                Nome do preparado *
              </label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Molho de tomate"
                className="w-full px-3 py-2 border rounded"
              />
              <p className="text-xs text-neutral-600 mt-1">
                Como você chama o que está sendo produzido. Ex.: Molho de
                tomate, Massa de pizza, Recheio de frango.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Unidade do preparado *
              </label>
              <select
                value={baseUnitId}
                onChange={(e) => setBaseUnitId(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                {props.unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name.toLowerCase()}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-600 mt-1">
                Escolha como você controla o estoque desse preparado.
              </p>
              <ul className="text-xs text-neutral-600 mt-1 space-y-0.5">
                <li>
                  <strong>kg</strong> — se você controla por peso
                </li>
                <li>
                  <strong>L</strong> — se controla por volume
                </li>
                <li>
                  <strong>un</strong> — se cada produção gera unidades
                </li>
              </ul>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            O que é usado para fazer este preparado? *
          </label>
          <p className="text-xs text-neutral-600 mb-2">
            Adicione os ingredientes ou insumos usados na receita e informe
            quanto é utilizado.
          </p>
          {linhas.length > 0 && (
            <div className="grid grid-cols-12 gap-2 text-xs text-neutral-500 mb-1 px-1">
              <span className="col-span-6">Ingrediente</span>
              <span className="col-span-3 text-right">Quanto usa</span>
              <span className="col-span-2">Unidade</span>
            </div>
          )}
          <div className="space-y-2">
            {linhas.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={l.inventoryItemId}
                  onChange={(e) => trocarLinha(idx, "inventoryItemId", e.target.value)}
                  className="col-span-6 px-2 py-2 border rounded text-sm"
                >
                  <option value="">Selecione…</option>
                  {props.insumos
                    .filter((i) => i.id !== props.existente?.id)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nome} ({i.unidade})
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  step="0.0001"
                  value={l.quantidade}
                  onChange={(e) => trocarLinha(idx, "quantidade", e.target.value)}
                  placeholder="0"
                  className="col-span-3 px-2 py-2 border rounded text-sm text-right"
                />
                <select
                  value={l.unitId}
                  onChange={(e) => trocarLinha(idx, "unitId", e.target.value)}
                  className="col-span-2 px-2 py-2 border rounded text-sm"
                >
                  {props.unidades.map((u) => (
                    <option key={u.id} value={u.id}>{u.code}</option>
                  ))}
                </select>
                <button
                  onClick={() => setLinhas(linhas.filter((_, i) => i !== idx))}
                  className="col-span-1 text-neutral-400 hover:text-red-600"
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLinhas([...linhas, { inventoryItemId: "", quantidade: "", unitId: baseUnitId }])}
            className="mt-2 text-sm text-neutral-700 underline"
          >
            + insumo
          </button>
        </div>

        <div className="p-3 bg-neutral-50 rounded">
          <label className="block text-sm font-medium mb-1">
            Quanto esta receita produz? *
          </label>
          <p className="text-xs text-neutral-600 mb-2">
            Informe quanto de preparado <strong>pronto</strong> você espera
            obter usando os insumos acima.
          </p>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.0001"
              value={rendimento}
              onChange={(e) => setRendimento(e.target.value)}
              placeholder="4"
              className="w-32 px-3 py-2 border rounded text-right"
            />
            <select
              value={yieldUnitId}
              onChange={(e) => setYieldUnitId(e.target.value)}
              className="px-3 py-2 border rounded"
            >
              {props.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name.toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
            <strong>Não</strong> é a quantidade de ingrediente usada — é quanto
            de produto pronto sai da produção. Ex.: 5,2 kg de tomate rendem 4 kg
            de molho.
          </p>
        </div>

        {/*
          O resumo que liga os campos.

          Sem ele a tela mostra "Quantidade: 5,2 kg" e "Rendimento: 4 kg" em
          caixas separadas, e cabe ao usuário descobrir sozinho que um vira o
          outro. Era aí que "rendimento" virava "quanto de ingrediente eu uso".
        */}
        {temResumo && (
          <div className="p-3 rounded border border-neutral-300 bg-white">
            <p className="text-sm text-neutral-800">
              {insumosPreenchidos.map((i, idx) => (
                <span key={idx}>
                  {idx > 0 && <span className="text-neutral-500"> + </span>}
                  <strong>
                    {num(i.quantidade)} {i.unidade}
                  </strong>{" "}
                  de {i.nome!.toLowerCase()}
                </span>
              ))}
              <span className="text-neutral-500"> → produz aproximadamente </span>
              <strong>
                {num(rendimentoNum)} {unidadeDoRendimento}
              </strong>{" "}
              de {nomeExibido.toLowerCase()}
            </p>

            {custoPorUnidade != null && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-neutral-800">
                  Custo estimado do preparado
                </p>
                <p className="text-xl font-semibold text-neutral-900 mt-0.5">
                  {brl(custoEstimado)}
                </p>
                <p className="text-sm text-neutral-800 mt-1">
                  Custo estimado por {unidadeDoRendimento}:{" "}
                  <strong>{brl(custoPorUnidade)}</strong>
                </p>
                <p className="text-xs text-neutral-600 mt-2">
                  Esse é o custo esperado com base nos insumos da receita. O
                  custo real será calculado quando você produzir.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={props.onCancelar} className="px-4 py-2 border rounded text-sm">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={!podeSalvar || props.ocupado}
            className="px-4 py-2 rounded bg-neutral-900 text-white text-sm disabled:opacity-50"
          >
            {props.ocupado ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Registrar uma produção.
 *
 * O `runToken` é gerado AQUI, uma vez por abertura do formulário, e não no
 * servidor. É o que separa "a mesma produção, repetida por falha de rede" de
 * "uma segunda panela, de propósito": os dois casos chegam ao servidor com
 * payloads idênticos, e nenhum valor derivável lá os distingue. Reenviar o
 * mesmo token — duplo clique, refresh, reenvio automático — é reconhecido como
 * repetição; abrir o formulário de novo gera token novo.
 */
function ProducaoForm(props: {
  preparado: Preparado;
  ocupado: boolean;
  onCancelar: () => void;
  onProduzir: (dados: {
    compositionId: string;
    plannedQuantity: number;
    producedQuantity: number;
    lossQuantity?: number;
    runToken: string;
    note?: string;
  }) => void;
}) {
  const receita = props.preparado.receita!;
  const [runToken] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [planejado, setPlanejado] = useState(
    receita.rendimento != null ? String(receita.rendimento) : "",
  );
  const [produzido, setProduzido] = useState("");
  const [perda, setPerda] = useState("");
  const [nota, setNota] = useState("");

  const p = parseFloat(planejado);
  const q = parseFloat(produzido);
  const fator = receita.rendimento && p > 0 ? p / receita.rendimento : null;
  const eficiencia = p > 0 && q > 0 ? (q / p) * 100 : null;

  return (
    <Modal titulo={`Produzir ${props.preparado.nome}`} onFechar={props.onCancelar}>
      <div className="space-y-4">
        <div className="p-3 bg-neutral-50 rounded text-sm">
          <div className="font-medium mb-1">
            Receita v{receita.versao} — rende {num(receita.rendimento)}{" "}
            {receita.unidadeDoRendimento}
          </div>
          <ul className="text-neutral-700 space-y-0.5">
            {receita.insumos.map((i) => (
              <li key={i.id} className="tabular-nums">
                {i.nome}: {num(i.quantidade)} {i.unidade}
                {fator != null && fator !== 1 && (
                  <span className="text-neutral-500">
                    {" "}→ {num(i.quantidade * fator)} {i.unidade}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Planejado *</label>
            <input
              type="number" step="0.0001" value={planejado}
              onChange={(e) => setPlanejado(e.target.value)}
              className="w-full px-3 py-2 border rounded text-right"
            />
            <p className="text-xs text-neutral-600 mt-1">
              Escala os insumos: o dobro gasta o dobro.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Produzido *</label>
            <input
              type="number" step="0.0001" value={produzido}
              onChange={(e) => setProduzido(e.target.value)}
              placeholder={planejado}
              className="w-full px-3 py-2 border rounded text-right"
            />
            <p className="text-xs text-neutral-600 mt-1">
              O que saiu da balança, não o que a receita prometia.
            </p>
          </div>
        </div>

        {eficiencia != null && (
          <div
            className={`p-2 rounded text-sm ${
              eficiencia < 80 || eficiencia > 120
                ? "bg-amber-50 text-amber-900 border border-amber-300"
                : "bg-neutral-50 text-neutral-700"
            }`}
          >
            Rendimento real: <strong>{eficiencia.toFixed(1)}%</strong> do planejado.
            {(eficiencia < 80 || eficiencia > 120) && (
              <> Confira se a quantidade está certa antes de salvar.</>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Perda declarada (opcional)</label>
          <input
            type="number" step="0.0001" min="0" value={perda}
            onChange={(e) => setPerda(e.target.value)}
            className="w-40 px-3 py-2 border rounded text-right"
          />
          <p className="text-xs text-neutral-600 mt-1">
            O que se perdeu depois de pronto. A merma da própria receita não vai
            aqui — ela já está no custo, porque o mesmo insumo rendeu menos.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Observação (opcional)</label>
          <input
            value={nota} onChange={(e) => setNota(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={props.onCancelar} className="px-4 py-2 border rounded text-sm">
            Cancelar
          </button>
          <button
            onClick={() =>
              props.onProduzir({
                compositionId: receita.id,
                plannedQuantity: p,
                producedQuantity: q,
                lossQuantity: parseFloat(perda) > 0 ? parseFloat(perda) : undefined,
                runToken,
                note: nota || undefined,
              })
            }
            disabled={!(p > 0) || !(q > 0) || props.ocupado}
            className="px-4 py-2 rounded bg-neutral-900 text-white text-sm disabled:opacity-50"
          >
            {props.ocupado ? "Produzindo…" : "Produzir"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Histórico das corridas, com custo apurado e a opção de desfazer. */
function HistoricoDeProducao(props: {
  corridas: Corrida[];
  ocupado: boolean;
  onReverter: (runId: string) => void;
}) {
  if (props.corridas.length === 0) return null;

  return (
    <div>
      <h3 className="font-bold mb-2">Histórico de produção</h3>
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="text-left p-3">Quando</th>
              <th className="text-left p-3">Preparado</th>
              <th className="text-right p-3">Planejado</th>
              <th className="text-right p-3">Produzido</th>
              <th className="text-right p-3">Rendimento</th>
              <th className="text-right p-3">Custo total</th>
              <th className="text-right p-3">Custo unit.</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {props.corridas.map((c) => (
              <tr key={c.id} className={`border-t ${c.status === "REVERSED" ? "opacity-50" : ""}`}>
                <td className="p-3 whitespace-nowrap">
                  {new Date(c.criadaEm).toLocaleString("pt-BR")}
                  {c.autor && <div className="text-xs text-neutral-500">{c.autor}</div>}
                </td>
                <td className="p-3">
                  {c.preparado}
                  <span className="text-xs text-neutral-500"> v{c.versaoDaReceita}</span>
                  {c.inconsistencia && (
                    <div className="text-xs text-red-700 mt-1">⚠ {c.inconsistencia}</div>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums">{num(c.planejado)} {c.unidade}</td>
                <td className="p-3 text-right tabular-nums">
                  {num(c.produzido)} {c.unidade}
                  {c.perda != null && (
                    <div className="text-xs text-neutral-500">perda {num(c.perda)}</div>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {c.eficiencia == null ? "—" : `${c.eficiencia.toFixed(1)}%`}
                </td>
                <td className="p-3 text-right tabular-nums">{brl(c.custoTotal)}</td>
                <td className="p-3 text-right tabular-nums font-medium">{brl(c.custoUnitario)}</td>
                <td className="p-3 text-right">
                  {c.status === "REVERSED" ? (
                    <span className="text-xs text-neutral-500">revertida</span>
                  ) : (
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Desfazer esta produção?\n\nOs insumos voltam ao estoque e ${num(c.produzido)} ${c.unidade} de ${c.preparado} saem dele.\n\nSe parte já foi vendida, o saldo fica negativo e a corrida é marcada para conferência.`,
                          )
                        ) {
                          props.onReverter(c.id);
                        }
                      }}
                      disabled={props.ocupado}
                      className="px-3 py-1 rounded border text-xs disabled:opacity-50"
                    >
                      Desfazer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
