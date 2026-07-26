import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Card({ children, className, title }: Readonly<CardProps>) {
  return <div className={cn("rounded-lg min-w-0 bg-surface border border-wood-200", className)}>{title ? <h3 className="px-5 pt-4 text-base font-semibold text-text-primary">{title}</h3> : null}{children}</div>;
}

export function CardHeader({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <div className={cn("border-b border-wood-100 px-5 py-4", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
