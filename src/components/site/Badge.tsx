import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Pill({
  children,
  className,
  tone = "glass",
}: {
  children: ReactNode;
  className?: string;
  tone?: "glass" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium tracking-wide",
        tone === "glass"
          ? "glass text-muted-foreground"
          : "bg-gradient-accent text-primary-foreground shadow-glow",
        className,
      )}
    >
      {children}
    </span>
  );
}