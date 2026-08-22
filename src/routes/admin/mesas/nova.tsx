import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

const CreateTableSchema = z.object({
  number: z.number().int().positive("Número deve ser maior que 0"),
  capacity: z.number().int().min(1, "Capacidade mínima é 1 pessoa"),
});

type CreateTableInput = z.infer<typeof CreateTableSchema>;

export const Route = createFileRoute("/admin/mesas/nova")({
  component: NovaTablePage,
});

function NovaTablePage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTableInput>({
    resolver: zodResolver(CreateTableSchema),
    defaultValues: {
      capacity: 4,
    },
  });

  const suggestedNumber = 9; // Mock

  const onSubmit = async (data: CreateTableInput) => {
    setIsLoading(true);
    try {
      // Mock: simulate server delay
      await new Promise(r => setTimeout(r, 1000));
      navigate({ to: "/admin/mesas" });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => navigate({ to: "/admin/mesas" })}
          className="rounded-lg p-2 hover:bg-neutral-900"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">Nova Mesa</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="number" className="block text-sm font-medium text-white">
                Número da Mesa *
              </label>
              <input
                {...register("number", { valueAsNumber: true })}
                type="number"
                placeholder={`Ex: ${suggestedNumber}`}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white placeholder-neutral-500 focus:border-[#E11D2E] focus:outline-none"
              />
              {errors.number && (
                <p className="mt-1 text-sm text-red-400">{errors.number.message}</p>
              )}
              <p className="mt-1 text-xs text-neutral-400">
                Número único para sua loja. Sugestão: {suggestedNumber}
              </p>
            </div>

            <div>
              <label htmlFor="capacity" className="block text-sm font-medium text-white">
                Capacidade (lugares) *
              </label>
              <input
                {...register("capacity", { valueAsNumber: true })}
                type="number"
                placeholder="Ex: 4"
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white placeholder-neutral-500 focus:border-[#E11D2E] focus:outline-none"
              />
              {errors.capacity && (
                <p className="mt-1 text-sm text-red-400">{errors.capacity.message}</p>
              )}
            </div>

            <div className="rounded-lg bg-neutral-800/50 p-4">
              <p className="text-sm font-medium text-white">O que acontece:</p>
              <ul className="mt-2 space-y-1 text-xs text-neutral-400">
                <li>✓ Um QRCode será gerado automaticamente</li>
                <li>✓ Clientes podem escanear para fazer pedidos</li>
                <li>✓ Pedidos serão vinculados a esta mesa</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => navigate({ to: "/admin/mesas" })}
            variant="outline"
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="flex-1"
          >
            {createMutation.isPending ? "Criando..." : "Criar Mesa"}
          </Button>
        </div>

        {createMutation.isError && (
          <div className="rounded-lg bg-red-900/20 p-4 text-sm text-red-400">
            {(createMutation.error as Error)?.message || "Erro ao criar mesa"}
          </div>
        )}
      </form>
    </div>
  );
}
