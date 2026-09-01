import { createFileRoute } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, Download, Trash2, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateUUID } from "@/lib/uuid";
import { generateQRCodeDataUrl, generateQRCodePNG } from "@/lib/qrcode-generator";
import { getTableOrderCountsFn, getNextTableNumberFn, listTablesFn, deleteTableFn } from "@/server/functions/orders.fn";
import { createTableFn } from "@/server/functions/tables/create";

const CORES = [
  "bg-red-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-yellow-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function getCorPorMesa(tableId: string): string {
  const hash = tableId.charCodeAt(0) + tableId.charCodeAt(tableId.length - 1);
  return CORES[hash % CORES.length];
}


/*
  MÓDULO PAGO — MESAS.

  O salão inteiro: cadastro de mesa, número, capacidade e o QR Code
  permanente que abre a comanda no celular do cliente. Pedido, balcão e
  cardápio não passam por aqui e seguem BASIC.
*/
export const Route = createFileRoute("/admin/mesas/")(
  rotaPremium("MESAS", MesasPage),
);

interface GeneratedQRCode {
  id: string;
  number: number;
  url: string;
  qrImage: string;
  createdAt: Date;
  ordersCount: number;
}

function MesasPage() {
  const context = Route.useRouteContext() as any;
  const admin = context?.admin;
  const queryClient = useQueryClient();
  const [qrcodes, setQrcodes] = useState<GeneratedQRCode[]>([]);
  const [generating, setGenerating] = useState(false);

  // Carregar mesas do banco de dados
  const { data: tables = [] } = useQuery({
    queryKey: ["tables"],
    queryFn: () => listTablesFn({}),
    refetchInterval: 5_000,
  });

  // Carregar contagem de pedidos abertos por mesa
  const { data: tableOrderCounts = {} } = useQuery({
    queryKey: ["tableOrderCounts"],
    queryFn: () => getTableOrderCountsFn({}),
    refetchInterval: 5_000,
  });

  // Atualizar QRCodes quando as mesas forem carregadas
  useEffect(() => {
    if (!admin?.store?.slug || !tables.length) return;

    const generatedQRCodes: GeneratedQRCode[] = tables.map(table => ({
      id: table.id,
      number: table.number,
      url: `${window.location.origin}/qr/${admin.store.slug}/${table.id}`,
      qrImage: table.qrcodeData || "",
      createdAt: new Date(),
      ordersCount: (tableOrderCounts[table.number] ?? 0) as number,
    }));

    setQrcodes(generatedQRCodes);
  }, [tables, tableOrderCounts, admin?.store?.slug]);

  const generateQRCode = async () => {
    setGenerating(true);
    try {
      if (!admin?.store?.slug || !admin?.store?.id) {
        alert("Erro: Não foi possível obter informações da loja");
        setGenerating(false);
        return;
      }

      // QR Token: UUID v4 aleatório e permanente. Nunca muda, mesmo quando a sessão termina.
      const qrTokenId = generateUUID();
      // Get next table number from database
      const tableNumber = await getNextTableNumberFn({});

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://velnoxia.app";
      const storeSlug = admin.store.slug;
      // URL pública do QR: /qr/{storeSlug}/{qrTokenId}
      const qrUrl = `${baseUrl}/qr/${storeSlug}/${qrTokenId}`;
      const qrImage = await generateQRCodeDataUrl(qrUrl);

      // Criar Table no banco de dados com o QR Token permanente
      const result = await createTableFn({
        data: {
          id: qrTokenId,  // Permanente, nunca muda
          storeId: admin.store.id,
          number: tableNumber,
          capacity: 4,
          qrcodeUrl: qrUrl,
          qrcodeData: qrImage,
        },
      });

      if (!result.ok) {
        throw new Error(result.error || "Falha ao criar mesa no banco de dados");
      }

      // Recarregar as mesas do banco de dados
      await queryClient.invalidateQueries({ queryKey: ["tables"] });
    } catch (error) {
      console.error("Erro ao gerar QRCode:", error);
      alert("Erro ao gerar QRCode. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  const downloadQR = async (qr: GeneratedQRCode) => {
    try {
      // "Mesa 3" impresso sob o código: é o que identifica o papel depois de
      // colado, quando o arquivo já não está mais à vista.
      const blob = await generateQRCodePNG(qr.url, `Mesa ${qr.number}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${qr.id}-qrcode.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao baixar QRCode:", error);
      alert("Erro ao baixar QRCode. Tente novamente.");
    }
  };

  const deleteQRCode = async (id: string) => {
    if (confirm(`Deletar QRCode Mesa?`)) {
      try {
        setQrcodes(prev => prev.filter(q => q.id !== id));

        const result = await deleteTableFn({ data: { id } });
        if (!result.ok) {
          alert(`Erro ao deletar: ${result.error}`);
          await queryClient.invalidateQueries({ queryKey: ["tables"] });
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ["tables"] });
      } catch (error) {
        console.error("Erro ao deletar mesa:", error);
        alert("Erro ao deletar mesa. Tente novamente.");
        await queryClient.invalidateQueries({ queryKey: ["tables"] });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {/*
           * `text-white` num painel de fundo creme (#FAF9F7): o título existia
           * no HTML e não existia na tela. É o tipo de defeito que sobrevive
           * porque quem programou já sabia o que estava escrito ali.
           */}
          <h1 className="text-2xl font-bold text-neutral-950 sm:text-3xl">Mesas (QRCode)</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {qrcodes.length} QRCodes gerados • {qrcodes.reduce((sum, q) => sum + q.ordersCount, 0)} pedidos abertos
          </p>
        </div>
        <Button onClick={generateQRCode} disabled={generating} className="gap-2">
          {generating ? (
            <>
              <Loader className="size-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <QrCode className="size-4" />
              Gerar Novo QRCode
            </>
          )}
        </Button>
      </div>

      {/*
       * A mesma barra de vitais do Dashboard: uma peça só, células separadas
       * por fio de cabelo, rótulo pequeno em caixa alta e o número na fonte de
       * display. Três cartões soltos com números azul, vermelho e amarelo
       * sugeriam gravidade onde não há nenhuma — mesa aberta é a loja
       * funcionando, não um alerta.
       */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-200 sm:grid-cols-3">
        {[
          { rotulo: "Total de QR Codes", valor: qrcodes.length },
          { rotulo: "Mesas abertas", valor: qrcodes.filter((q) => q.ordersCount > 0).length },
          {
            rotulo: "Pedidos abertos",
            valor: qrcodes.reduce((sum, q) => sum + q.ordersCount, 0),
          },
        ].map((item) => (
          <div key={item.rotulo} className="bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {item.rotulo}
            </p>
            <p className="mt-2 font-display text-3xl font-bold leading-none tracking-tight tabular-nums text-neutral-950">
              {item.valor}
            </p>
          </div>
        ))}
      </div>

      {/* QRCodes Grid */}
      {qrcodes.length === 0 ? (
        /*
         * O estado vazio era um cartão ESCURO (`bg-neutral-900`) sobre a mesa
         * creme do painel — parecia um buraco na página, não um convite.
         *
         * Agora é a mesma moldura dos cards de mesa, com um lugar vazio no
         * formato exato de um QR: quem chega entende o que vai aparecer ali
         * antes de clicar em nada.
         */
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center">
          <div className="mx-auto flex size-36 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50">
            <QrCode className="size-10 text-neutral-300" />
          </div>
          <p className="mt-5 font-display text-lg font-bold text-neutral-950">
            Nenhuma mesa com QR Code
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
            Gere um código para cada mesa e cole no suporte. O cliente aponta a câmera e pede
            sem sair do lugar.
          </p>
          <Button onClick={generateQRCode} disabled={generating} className="mt-6 gap-2">
            {generating ? (
              <>
                <Loader className="size-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <QrCode className="size-4" />
                Gerar primeiro QR Code
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {qrcodes.map((qr) => (
            <div key={qr.id} className="rounded-lg border border-neutral-200 bg-neutral-50 w-48 flex flex-col justify-between overflow-hidden">
              <div className={`h-2 ${getCorPorMesa(qr.id)}`} />
              <div className="p-4 space-y-2 text-center text-sm flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-neutral-600">Mesa</p>
                  <p className="text-xl font-bold text-neutral-900">Mesa {qr.number}</p>
                </div>
                <div>
                  <p className="text-neutral-600">Pedidos Abertos</p>
                  <p className={`font-bold ${qr.ordersCount > 0 ? "text-red-600" : "text-green-600"}`}>
                    {qr.ordersCount}
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-2">
                <Button
                  onClick={() => downloadQR(qr)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Download className="mr-1 size-4" />
                  Baixar PNG
                </Button>

                <Button
                  onClick={() => deleteQRCode(qr.id)}
                  variant="outline"
                  size="sm"
                  className="w-full text-red-400 hover:bg-red-900/20"
                >
                  <Trash2 className="mr-1 size-4" />
                  Deletar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
