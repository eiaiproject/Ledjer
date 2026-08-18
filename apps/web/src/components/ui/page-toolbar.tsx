import { type ReactNode, useRef, useState } from "react";
import { Search, Filter, ChevronDown, ChevronUp, XCircle } from "reicon-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Badge, type BadgeVariant } from "./badge";

const FILTER_SPAN_CLASS: Record<number, string> = {
  2: "xl:col-span-2",
  3: "xl:col-span-3",
  4: "xl:col-span-4",
  6: "xl:col-span-6",
};

interface ToolbarFilter {
  readonly key: string;
  readonly label: string;
  readonly children: ReactNode;
  readonly active?: boolean;
  /** xl grid span (default 2) */
  readonly span?: 2 | 3 | 4 | 6;
  /** chip badge variant (default "info") */
  readonly chipVariant?: BadgeVariant;
  /** per-filter chip clear; falls back to onResetFilters */
  readonly onClear?: () => void;
}

export interface PageToolbarProps {
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchPlaceholder?: string;
  readonly searchLabel?: string;
  /** Custom id for the search input (default "toolbar-search") — lets pages keep stable ids for tests/a11y. */
  readonly searchInputId?: string;
  /** Extra aria-describedby ids for the search input (e.g. a results-count live region). */
  readonly searchAriaDescribedBy?: string;
  readonly filters?: readonly ToolbarFilter[];
  readonly onResetFilters?: () => void;
  readonly onResetSearch?: () => void;
  readonly onResetAll?: () => void;
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Standard page toolbar with search, collapsible filters, and actions.
 *
 * - Search input with clear button
 * - Collapsible filter panel (mobile-friendly)
 * - Filter chips showing active filters
 * - Reset buttons
 */
export function PageToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Cari...",
  searchLabel = "Cari",
  searchInputId,
  searchAriaDescribedBy,
  filters,
  onResetFilters,
  onResetSearch,
  onResetAll,
  children,
  className,
}: PageToolbarProps) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const activeFilters = filters?.filter((f) => f.active) ?? [];
  const hasSearch = searchValue.trim().length > 0;
  const hasActiveFilters = activeFilters.length > 0;
  const hasAnyCriteria = hasSearch || hasActiveFilters;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label className="sr-only" htmlFor={searchInputId ?? "toolbar-search"}>{searchLabel}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-500" aria-hidden="true" />
          <input
            ref={searchRef}
            id={searchInputId ?? "toolbar-search"}
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-describedby={searchAriaDescribedBy}
            className="h-11 min-h-[44px] w-full rounded-lg border border-wood-200 bg-surface pl-10 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 sm:h-10 sm:min-h-0"
          />
          {hasSearch && (
            <button
              type="button"
              onClick={() => {
                onResetSearch?.();
                searchRef.current?.focus();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-md p-1 text-wood-500 hover:bg-cream-200 hover:text-wood-600 min-h-[44px] min-w-[44px]"
              aria-label="Hapus pencarian"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
        {children && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>

      {/* Filters collapse toggle (mobile) + container */}
      {filters && filters.length > 0 && (
        <div className="rounded-xl border border-wood-200 bg-surface-elevated">
          <button
            type="button"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-text-secondary sm:pointer-events-none sm:hidden min-h-[44px]"
            aria-expanded={filtersExpanded}
            aria-controls="toolbar-filters-panel"
          >
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" aria-hidden="true" />
              Filter
              {hasActiveFilters && (
                <Badge variant="info" size="sm">{activeFilters.length}</Badge>
              )}
            </span>
            {filtersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          <div
            id="toolbar-filters-panel"
            className={cn(
              "overflow-hidden transition-all duration-200",
              filtersExpanded ? "block" : "hidden sm:block"
            )}
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-wood-100 p-4 sm:border-0 sm:p-0 md:grid-cols-2 xl:grid-cols-12 xl:items-start">
              {filters.map((filter) => (
                <div key={filter.key} className={FILTER_SPAN_CLASS[filter.span ?? 2]}>
                  {filter.children}
                </div>
              ))}
              {onResetFilters && (
                <div className="xl:col-span-2 xl:self-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={onResetFilters}
                    disabled={!hasActiveFilters}
                    className="w-full"
                  >
                    Reset filter
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {hasAnyCriteria && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filter aktif">
          {hasSearch && onResetSearch && (
            <Badge variant="neutral">
              Cari: {searchValue}
              <button
                type="button"
                onClick={onResetSearch}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-wood-200 min-h-[44px] min-w-[44px] -my-[10px]"
                aria-label="Hapus pencarian"
              >
                <XCircle className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {activeFilters.map((filter) => (
            <Badge key={filter.key} variant={filter.chipVariant ?? "info"}>
              {filter.label}
              <button
                type="button"
                onClick={() => {
                  if (filter.onClear) {
                    filter.onClear();
                  } else {
                    onResetFilters?.();
                  }
                }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-info-bg min-h-[44px] min-w-[44px] -my-[10px]"
                aria-label={`Hapus filter ${filter.label}`}
              >
                <XCircle className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {onResetAll && (
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={onResetAll}
            >
              Reset semua
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
