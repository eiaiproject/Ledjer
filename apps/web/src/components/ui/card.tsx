import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  children: ReactNode;
  className?: string;
  /** Optional card heading. */
  title?: string;
  /** Elevated surface: white bg + larger radius - for lists, tables, and toolbars. */
  elevated?: boolean;
}

export function Card({ children, className, title, elevated, ...rest }: Readonly<CardProps>) {
  return (
    <div
      {...rest}
      className={cn(
        "min-w-0 border border-wood-200",
        elevated ? "rounded-xl bg-surface-elevated" : "rounded-lg bg-surface",
        className
      )}
    >
      {title ? <h3 className="px-5 pt-4 text-base font-semibold text-text-primary">{title}</h3> : null}
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn("border-b border-wood-100 px-5 py-4", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
