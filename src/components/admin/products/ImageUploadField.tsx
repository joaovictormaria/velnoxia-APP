import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { createUploadUrlFn } from "@/server/functions/uploads.fn";
import type { UploadKind } from "@/server/storage/presign";

export function ImageUploadField({
  kind,
  value,
  onChange,
  label = "Foto",
}: {
  kind: UploadKind;
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      console.log(`[Upload] Iniciando upload: ${file.name} (${file.type}, ${file.size} bytes)`);

      const presign = await createUploadUrlFn({
        data: { kind, contentType: file.type },
      });

      if (!presign.ok) {
        console.error(`[Upload] Erro ao gerar URL: ${presign.error}`);
        setError(presign.error);
        return;
      }

      console.log(`[Upload] URL gerada: ${presign.uploadUrl}`);

      const res = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      console.log(`[Upload] Resposta HTTP: ${res.status} ${res.statusText}`);

      if (!res.ok) {
        let errorDetail = "";
        try {
          const errorBody = await res.text();
          errorDetail = errorBody ? ` - ${errorBody}` : "";
        } catch {
          // Ignorar erro ao ler resposta
        }

        const errorMsg = `Falha ao enviar (HTTP ${res.status}${errorDetail}). Verifique se está logado e tente novamente.`;
        console.error(`[Upload] ${errorMsg}`);
        setError(errorMsg);
        return;
      }

      console.log(`[Upload] Sucesso! URL pública: ${presign.publicUrl}`);
      onChange(presign.publicUrl);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
      console.error(`[Upload] Erro ao enviar: ${errorMsg}`, error);
      setError(`Não foi possível enviar a imagem: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-neutral-900">{label}</p>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
        {value ? (
          <img src={value} alt="" className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-neutral-400">
            <ImagePlus className="size-10" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="flex justify-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1 text-[10px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60 whitespace-nowrap"
        >
          {uploading && <Loader2 className="size-3 animate-spin" />}
          {uploading ? "Enviando..." : "Alterar foto"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1 text-[10px] text-neutral-600 hover:bg-neutral-50"
          >
            Remover
          </button>
        )}
      </div>

      <p className="text-[10px] text-neutral-500 whitespace-nowrap">Formatos: JPG, PNG, WEBP. Tamanho máx. 2MB.</p>
      {error && <p className="text-xs text-[#E11D2E]">{error}</p>}
    </div>
  );
}
