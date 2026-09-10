import { Button } from "@/components/ui/button";

interface PaginationNavProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}

/** Navigasi halaman Sebelumnya/Berikutnya ala daftar transaksi/produk. */
export function PaginationNav({ currentPage, totalPages, onPrev, onNext }: PaginationNavProps) {
  return (
    <nav aria-label="Navigasi halaman" className="flex items-center justify-between gap-4">
      <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={onPrev}>
        Sebelumnya
      </Button>
      <p className="text-sm text-text-secondary">
        Halaman {currentPage} dari {totalPages}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={onNext}
      >
        Berikutnya
      </Button>
    </nav>
  );
}
