import type { TableStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: TableStatus;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const colors = {
    AVAILABLE: "bg-green-900/30 text-green-400 border-green-700",
    OCCUPIED: "bg-red-900/30 text-red-400 border-red-700",
    RESERVED: "bg-yellow-900/30 text-yellow-400 border-yellow-700",
    MAINTENANCE: "bg-gray-900/30 text-gray-400 border-gray-700",
  };

  const labels = {
    AVAILABLE: "Disponível",
    OCCUPIED: "Ocupada",
    RESERVED: "Reservada",
    MAINTENANCE: "Manutenção",
  };

  const sizes = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border font-medium",
        colors[status],
        sizes[size]
      )}
    >
      {labels[status]}
    </span>
  );
}
