import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-6 w-6 animate-spin rounded-full border-2 border-wood-500 border-t-transparent", className)}
      role="status"
      aria-label="Memuat"
    />
  );
}

export function PageLoader({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3">
      <Spinner />
      <span className="text-sm text-text-secondary">{label}</span>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface shadow-xs", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-text-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-wood-700 text-cream-50 hover:bg-wood-800",
  secondary: "bg-white text-wood-800 border border-border-strong hover:bg-cream-100",
  danger: "bg-clay-600 text-cream-50 hover:bg-clay-700",
  ghost: "text-wood-700 hover:bg-cream-100",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-wood-500 focus:outline-none focus:ring-1 focus:ring-wood-500",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-wood-500 focus:outline-none focus:ring-1 focus:ring-wood-500",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-text-tertiary">{hint}</span> : null}
    </label>
  );
}

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const badgeTones: Record<BadgeTone, string> = {
  success: "bg-leaf-50 text-leaf-700 border-leaf-200",
  warning: "bg-clay-50 text-clay-700 border-clay-200",
  danger: "bg-[#FAEBE5] text-[#A12D1E] border-[#E8B5A8]",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  neutral: "bg-cream-100 text-wood-700 border-border",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      {description ? <p className="text-sm text-text-tertiary">{description}</p> : null}
    </div>
  );
}

export function Toast({ message, tone = "error" }: { message: string; tone?: "error" | "success" }) {
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-md",
        tone === "error" ? "border-error-border bg-error-bg text-error" : "border-leaf-200 bg-leaf-50 text-leaf-700",
      )}
      role="alert"
    >
      {message}
    </div>
  );
}

export function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(dateStr));
}
