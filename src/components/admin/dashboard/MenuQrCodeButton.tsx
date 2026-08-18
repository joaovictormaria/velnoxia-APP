import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { gerarQrDoCardapio } from "@/lib/qr-menu-image";

/**
 * Baixa o QR Code do cardápio da loja, para o dono imprimir e colar nas mesas.
 *
 * Gerado no navegador, não no servidor: o conteúdo é só o endereço do cardápio,
 * então não há o que consultar no banco nem imagem para guardar. Um serviço
 * externo de QR resolveria igual e cobraria — ou sairia do ar — por nada.
 */
export function MenuQrCodeButton({
  slug,
  storeName,
}: {
  slug: string;
  storeName: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * O endereço vem da origem em que o painel está aberto, e não de um domínio
   * fixo no código: é o mesmo host por onde o cliente chega. Só existe no
   * navegador, daí o efeito — no servidor não há `window`.
   */
  const [menuUrl, setMenuUrl] = useState<string | null>(null);

  useEffect(() => {
    setMenuUrl(`${window.location.origin}/${slug}`);
  }, [slug]);

  async function baixar() {
    if (!menuUrl) return;
    setPending(true);
    setError(null);
    try {
      const dataUrl = await gerarQrDoCardapio(menuUrl, storeName);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `qrcode-cardapio-${slug}.png`;
      link.click();
    } catch {
      setError("Não foi possível gerar o QR Code. Recarregue a página e tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        onClick={baixar}
        disabled={pending || !menuUrl}
        // O endereço que vai dentro do código, à mostra antes de imprimir: é o
        // tipo de erro que só apareceria depois de mil adesivos prontos.
        title={menuUrl ? `O QR Code aponta para ${menuUrl}` : undefined}
        className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-[#E11D2E] hover:text-[#E11D2E] disabled:opacity-60"
      >
        <QrCode className="size-4" />
        {pending ? "Gerando..." : "Baixar QR Code"}
      </button>
      {error && <p className="mt-1 max-w-48 text-xs text-[#E11D2E]">{error}</p>}
    </div>
  );
}
