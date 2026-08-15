import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MenuThumb({
  image,
  icon: Icon,
  alt,
  rounded = "full",
  className,
  iconClassName = "h-5 w-5",
}: {
  image?: string;
  icon?: LucideIcon;
  alt: string;
  rounded?: "full" | "2xl";
  className?: string;
  iconClassName?: string;
}) {
  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-2xl";

  if (image) {
    return (
      <span className={cn("block overflow-hidden", roundedClass, className)}>
        <img src={image} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={alt}
      className={cn("grid place-items-center bg-tomato/10 text-tomato", roundedClass, className)}
    >
      {Icon && <Icon className={iconClassName} />}
    </span>
  );
}
