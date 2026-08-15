import type { ReactNode } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

const VARIANT_CLASS = {
  up: "reveal",
  left: "reveal-left",
  right: "reveal-right",
  scale: "reveal-scale",
} as const;

export function Reveal({
  children,
  className,
  variant = "up",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  variant?: keyof typeof VARIANT_CLASS;
  delay?: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(VARIANT_CLASS[variant], className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
