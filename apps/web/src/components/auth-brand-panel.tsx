import type { CSSProperties } from "react";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

interface AuthLedgerEntry {
  label: string;
  amount: string;
  tone?: "leaf" | "wood" | "clay";
}

interface AuthBrandPanelProps {
  readonly title: string;
  readonly description: string;
  readonly entries: AuthLedgerEntry[];
  readonly className?: string;
}

const toneStyles = {
  leaf: "text-leaf-700",
  wood: "text-wood-800",
  clay: "text-clay-700",
};

export function AuthBrandPanel({ title, description, entries, className }: AuthBrandPanelProps) {
  return (
    <div className={cn("hidden bg-wood-700 p-12 lg:flex lg:items-center lg:justify-center", className)}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <Logo size="lg" variant="icon" />
          <div>
            <p className="text-2xl font-bold text-cream-50">Ledjer</p>
            <p className="text-sm text-wood-200">Pembukuan UMKM Indonesia</p>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-cream-50">{title}</h2>
        <p className="mt-3 max-w-sm text-lg leading-relaxed text-wood-200">
          {description}
        </p>

        <div className="ledger-mockup mt-10 rounded-xl bg-cream-50 p-4 text-left text-wood-900">
          <div className="flex items-center justify-between gap-4 border-b border-wood-100 pb-3">
            <span className="text-sm font-semibold text-wood-800">Jurnal hari ini</span>
            <span className="rounded-full bg-leaf-100 px-2.5 py-1 text-xs font-medium text-leaf-700">
              Otomatis
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {entries.map((entry, index) => (
              <div
                key={entry.label}
                className="ledger-row flex items-center justify-between gap-3 rounded-md bg-cream-100 px-3 py-2"
                style={{ "--i": index } as CSSProperties}
              >
                <span className="min-w-0 break-words text-sm text-wood-700">{entry.label}</span>
                <span className={cn("shrink-0 text-sm font-semibold num-mono", toneStyles[entry.tone ?? "wood"])}>
                  {entry.amount}
                </span>
              </div>
            ))}
          </div>
          <div className="ledger-flow-line mt-4 h-px bg-leaf-300" />
          <div className="ledger-balance-stamp mt-3 inline-flex items-center gap-1.5 rounded-full bg-leaf-100 px-3 py-1.5 text-xs font-semibold text-leaf-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Debet dan kredit seimbang
          </div>
        </div>
      </div>
    </div>
  );
}
