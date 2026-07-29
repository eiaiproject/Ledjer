import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import { globalSearch as searchApi, type SearchResultItem } from "@/lib/api/global-search";
import { Search, Loader, X, FileText, Receipt, User, Package, BookOpen, Users, ArrowRight } from "reicon-react";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  transaction: <Receipt className="h-4 w-4" />,
  invoice: <FileText className="h-4 w-4" />,
  party: <User className="h-4 w-4" />,
  product: <Package className="h-4 w-4" />,
  account: <BookOpen className="h-4 w-4" />,
  member: <Users className="h-4 w-4" />,
};

const TYPE_LABELS: Record<string, string> = {
  transaction: "Transaksi",
  invoice: "Faktur",
  party: "Kontak",
  product: "Produk",
  account: "Akun",
  member: "Anggota Tim",
};

const TYPE_COLORS: Record<string, string> = {
  transaction: "bg-blue-50 text-blue-600",
  invoice: "bg-purple-50 text-purple-600",
  party: "bg-amber-50 text-amber-600",
  product: "bg-green-50 text-green-600",
  account: "bg-teal-50 text-teal-600",
  member: "bg-pink-50 text-pink-600",
};

interface GlobalSearchModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      startTransition(() => {
        setQuery("");
        setSelectedIndex(-1);
      });
    }
  }, [open, setQuery, setSelectedIndex]);

  // Debounced search with at least 2 chars
  const { data, isLoading } = useQuery({
    queryKey: ["global-search", query],
    queryFn: () => searchApi(query, 10),
    enabled: query.trim().length >= 2,
  });

  const results = data?.results ?? [];

  // Reset selection when results change
  useEffect(() => {
    startTransition(() => {
      setSelectedIndex(-1);
    });
  }, [results.length, setSelectedIndex]);

  const handleSelect = useCallback((item: SearchResultItem) => {
    onClose();
    navigate(item.url);
  }, [navigate, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < results.length) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  }, [onClose, results, selectedIndex, handleSelect]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[var(--z-modal)] bg-wood-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-[15vh] z-[calc(var(--z-modal)+1)] w-full max-w-xl -translate-x-1/2 px-4"
        aria-label="Pencarian global">
        <div className="overflow-hidden rounded-2xl border border-wood-200 bg-surface shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-wood-100 px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-wood-500" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cari transaksi, faktur, kontak, produk, akun..."
              className="flex-1 border-0 bg-transparent text-sm text-text-primary placeholder:text-wood-500 focus:outline-none"
              autoComplete="off"
              aria-label="Kata kunci pencarian"
            />
            {isLoading && (
              <Loader className="h-4 w-4 animate-spin text-wood-500" aria-hidden="true" />
            )}
            <button type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-wood-500 hover:bg-wood-100 hover:text-wood-600"
              aria-label="Tutup pencarian"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Shortcut hint */}
          {!query.trim() && (
            <div className="px-4 py-6 text-center">
              <Search className="mx-auto mb-2 h-8 w-8 text-wood-500" aria-hidden="true" />
              <p className="text-sm text-wood-500">
                Ketik minimal 2 karakter untuk mulai mencari
              </p>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-wood-500">
                <kbd className="rounded border border-wood-200 bg-wood-50 px-1.5 py-0.5 font-mono text-[10px]">
                  ↑↓
                </kbd>
                <span>Navigasi</span>
                <kbd className="rounded border border-wood-200 bg-wood-50 px-1.5 py-0.5 font-mono text-[10px]">
                  Enter
                </kbd>
                <span>Pilih</span>
                <kbd className="rounded border border-wood-200 bg-wood-50 px-1.5 py-0.5 font-mono text-[10px]">
                  Esc
                </kbd>
                <span>Tutup</span>
              </div>
            </div>
          )}

          {/* Results */}
          {query.trim().length >= 2 && (
            <div className="max-h-[50vh] overflow-y-auto">
              {results.length === 0 && !isLoading && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-wood-500">
                    Tidak ditemukan hasil untuk "{query}"
                  </p>
                </div>
              )}

              {results.map((item, i) => (
                <button type="button"
                  key={`${item.entityType}-${item.entityId}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    i === selectedIndex
                      ? "bg-wood-50"
                      : "hover:bg-wood-50"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      TYPE_COLORS[item.entityType] ?? "bg-wood-100 text-wood-500"
                    }`}
                  >
                    {TYPE_ICONS[item.entityType] ?? <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {item.label}
                      </span>
                      <span className="shrink-0 rounded bg-wood-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-wood-500">
                        {TYPE_LABELS[item.entityType] ?? item.entityType}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-wood-500 truncate">{item.subtitle}</p>
                  </div>
                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-wood-500" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          {results.length > 0 && (
            <div className="border-t border-wood-100 px-4 py-2 text-center text-[10px] text-wood-500">
              {data?.total ?? 0} hasil ditemukan
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Search trigger button (rendered in the dashboard layout header)
// ---------------------------------------------------------------------------

interface SearchTriggerProps {
  readonly onClick: () => void;
}

export function SearchTrigger({ onClick }: SearchTriggerProps) {
  return (
    <button type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-wood-200 bg-surface px-3 py-2 text-sm text-wood-500 transition-all hover:border-wood-300 hover:text-wood-600 focus:outline-none focus:ring-2 focus:ring-ink/20 sm:w-56"
      aria-label="Buka pencarian"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline flex-1 text-left">Cari...</span>
      <kbd className="hidden rounded border border-wood-200 bg-wood-50 px-1.5 py-0.5 font-mono text-[10px] text-wood-500 sm:inline">
        Ctrl+K
      </kbd>
    </button>
  );
}
