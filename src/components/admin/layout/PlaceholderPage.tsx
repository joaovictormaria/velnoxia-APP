import { Construction } from "lucide-react";

export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-neutral-900">{title}</h1>
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white py-20 text-center">
        <Construction className="size-10 text-neutral-400" />
        <p className="text-sm font-medium text-neutral-700">Em construção</p>
        <p className="text-sm text-neutral-500">Esta tela será implementada na {phase}.</p>
      </div>
    </div>
  );
}
