import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-secondary text-foreground",
        teal: "bg-[#e5f3ef] text-teal",
        amber: "bg-[#fff1e4] text-stuck",
        navy: "bg-[#e7eef2] text-primary",
        danger: "bg-[#fde8e8] text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
