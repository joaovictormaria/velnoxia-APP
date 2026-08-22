import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { Table } from "@prisma/client";

const TableFormSchema = z.object({
  number: z.number().int().positive("Número deve ser maior que 0"),
  capacity: z.number().int().min(1, "Capacidade mínima é 1 pessoa"),
});

type TableFormInput = z.infer<typeof TableFormSchema>;

interface TableFormProps {
  onSubmit: (data: TableFormInput) => Promise<void>;
  isLoading?: boolean;
  defaultValues?: Partial<Table>;
}

export function TableForm({ onSubmit, isLoading, defaultValues }: TableFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TableFormInput>({
    resolver: zodResolver(TableFormSchema),
    defaultValues: {
      number: defaultValues?.number,
      capacity: defaultValues?.capacity || 4,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="number" className="block text-sm font-medium text-white">
          Número da Mesa
        </label>
        <input
          {...register("number", { valueAsNumber: true })}
          type="number"
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-[#E11D2E] focus:outline-none"
        />
        {errors.number && (
          <p className="mt-1 text-sm text-red-400">{errors.number.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="capacity" className="block text-sm font-medium text-white">
          Capacidade (pessoas)
        </label>
        <input
          {...register("capacity", { valueAsNumber: true })}
          type="number"
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-[#E11D2E] focus:outline-none"
        />
        {errors.capacity && (
          <p className="mt-1 text-sm text-red-400">{errors.capacity.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
