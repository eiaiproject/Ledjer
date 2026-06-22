import { useEffect, useState, useRef, useMemo, useId } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home,
  Receipt,
  BookOpen,
  Package,
  BarChart3,
  Settings,
  Plus,
  FileText,
  TrendingUp,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords: string[];
}

const NAV_ITEMS: CommandItem[] = [
  { id: "dashboard", label: "Dashboard", icon: Home, action: () => {}, keywords: ["beranda", "home", "ringkasan"] },
  { id: "new-transaction", label: "Catat Transaksi Baru", icon: Plus, action: () => {}, keywords: ["baru", "tambah", "input", "jual", "beli"] },
  { id: "transactions", label: "Daftar Transaksi", icon: Receipt, action: () => {}, keywords: ["riwayat", "list", "semua"] },
  { id: "accounts", label: "Bagan Akun", icon: BookOpen, action: () => {}, keywords: ["coa", "chart of accounts", "akun"] },
  { id: "products", label: "Produk & Stok", icon: Package, action: () => {}, keywords: ["barang", "inventory", "persediaan"] },
  { id: "general-ledger", label: "Buku Besar", icon: FileText, action: () => {}, keywords: ["general ledger", "rincian"] },
  { id: "trial-balance", label: "Neraca Saldo", icon: TrendingUp, action: () => {}, keywords: ["trial balance", "saldo"] },
  { id: "profit-loss", label: "Laba Rugi", icon: BarChart3, action: () => {}, keywords: ["income", "loss", "pendapatan"] },
  { id: "balance-sheet", label: "Neraca", icon: BarChart3, action: () => {}, keywords: ["balance sheet", "aset", "ekuitas"] },
  { id: "team", label: "Tim & Izin", icon: Settings, action: () => {}, keywords: ["staff", "anggota", "permissions"] },
  { id: "billing", label: "Langganan & Billing", icon: Settings, action: () => {}, keywords: ["paket", "upgrade", "plan"] },
];

const ROUTES: Record<string, string> = {
  "dashboard": "/dashboard",
  "new-transaction": "/transactions/new",
  "transactions": "/transactions",
  "accounts": "/accounts",
  "products": "/products",
  "general-ledger": "/reports/general-ledger",
  "trial-balance": "/reports/trial-balance",
  "profit-loss": "/reports/profit-loss",
  "balance-sheet": "/reports/balance-sheet",
  "team": "/settings/team",
  "billing": "/settings/billing",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const titleId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  const items = useMemo(() => {
    return NAV_ITEMS.map((item) => ({
      ...item,
      action: () => navigate(ROUTES[item.id] || "/dashboard"),
    }));
  }, [navigate]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.includes(q))
    );
  }, [items, query]);
  const activeOptionId = open && filtered[selectedIndex] ? `${listboxId}-option-${filtered[selectedIndex].id}` : undefined;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
        ));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (filtered.length === 0 ? 0 : Math.min(i + 1, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (filtered.length === 0 ? 0 : Math.max(i - 1, 0)));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-start justify-center p-4 pt-[15vh]">
      {/* Backdrop */}
      <div
        className="ledger-drawer-backdrop absolute inset-0 bg-wood-900/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ledger-command-panel relative w-full max-w-lg rounded-xl border border-wood-200 bg-surface-elevated shadow-md"
      >
        <div className="sr-only" id={titleId}>Cari halaman atau menu</div>
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-wood-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={true}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Cari halaman atau menu..."
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            autoComplete="off"
          />
          <kbd className="hidden rounded-md border border-wood-200 bg-cream-100 px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary sm:inline">
            ESC
          </kbd>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-cream-100 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500"
            aria-label="Tutup pencarian"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} id={listboxId} role="listbox" aria-label="Hasil pencarian menu" className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              Tidak ditemukan
            </div>
          ) : (
            filtered.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`${listboxId}-option-${item.id}`}
                  role="option"
                  aria-selected={i === selectedIndex}
                  type="button"
                  onClick={() => {
                    item.action();
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-[background-color,color,transform] duration-150 ease-out",
                    i === selectedIndex
                      ? "translate-x-0.5 bg-wood-100 text-text-primary"
                      : "text-text-secondary hover:bg-cream-100"
                  )}
                  >
                  <Icon className="h-4 w-4 shrink-0 text-text-tertiary" />
                  <span className="min-w-0 flex-1 break-words font-medium">{item.label}</span>
                  {item.hint && (
                    <span className="min-w-0 break-words text-xs text-text-muted">{item.hint}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-wood-100 px-4 py-2 text-[11px] text-text-muted">
          <kbd className="rounded border border-wood-200 bg-cream-100 px-1 py-0.5 text-[10px]">↑↓</kbd> navigasi{" "}
          <kbd className="rounded border border-wood-200 bg-cream-100 px-1 py-0.5 text-[10px]">↵</kbd> pilih{" "}
          <kbd className="rounded border border-wood-200 bg-cream-100 px-1 py-0.5 text-[10px]">esc</kbd> tutup
        </div>
      </div>
    </div>
  );
}
