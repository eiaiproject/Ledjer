/**
 * Central registry for status labels, variants, icons, and accessible descriptions
 * across all business domains.
 *
 * Usage:
 *   import { STATUS_REGISTRY } from "@/lib/status-registry";
 *   const status = STATUS_REGISTRY[domain][rawStatus];
 *   <Badge variant={status.variant}>... </Badge>
 */

/** Matches Badge component's variant prop */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusDef {
  /** Label Bahasa Indonesia */
  label: string;
  /** Semantic tone for Badge variant */
  variant: StatusTone;
  /** Accessible description for screen readers */
  accessibleDescription: string;
}

type DomainRegistry = Record<string, StatusDef>;
type Registry = Record<string, DomainRegistry>;

/**
 * Terpusat mapping status untuk seluruh modul.
 *
 * success:
 * - selesai, aktif, lunas, seimbang, berhasil
 *
 * warning:
 * - tertunda, jatuh tempo, perlu tindakan, stok rendah
 *
 * danger:
 * - gagal, ditolak, dibatalkan, tidak seimbang, terlambat kritis
 *
 * info:
 * - draft, dijadwalkan, diproses, informasi
 *
 * neutral:
 * - tidak aktif, digantikan, belum dimulai, diarsipkan
 */
export const STATUS_REGISTRY: Registry = {
  // ── Transactions ────────────────────────────────────────────
  transactions: {
    posted: {
      label: "Posted",
      variant: "success",
      accessibleDescription: "Transaksi telah diposting dan diverifikasi",
    },
    voided: {
      label: "Dibatalkan",
      variant: "error",
      accessibleDescription: "Transaksi telah dibatalkan",
    },
    reversed: {
      label: "Reversal",
      variant: "warning",
      accessibleDescription: "Transksi reversal yang membatalkan transaksi sebelumnya",
    },
    draft: {
      label: "Draft",
      variant: "info",
      accessibleDescription: "Transaksi belum selesai atau belum diposting",
    },
  },

  // ── Invoices ────────────────────────────────────────────────
  invoices: {
    draft: {
      label: "Draft",
      variant: "neutral",
      accessibleDescription: "Faktur masih dalam bentuk draft",
    },
    issued: {
      label: "Diterbitkan",
      variant: "info",
      accessibleDescription: "Faktur telah diterbitkan",
    },
    sent: {
      label: "Terkirim",
      variant: "info",
      accessibleDescription: "Faktur telah dikirim ke pelanggan",
    },
    partially_paid: {
      label: "Dibayar Sebagian",
      variant: "warning",
      accessibleDescription: "Sebagian dari total faktur telah dibayar",
    },
    paid: {
      label: "Lunas",
      variant: "success",
      accessibleDescription: "Faktur telah dibayar lunas",
    },
    overdue: {
      label: "Jatuh Tempo",
      variant: "error",
      accessibleDescription: "Faktur melewati tanggal jatuh tempo",
    },
    voided: {
      label: "Batal",
      variant: "neutral",
      accessibleDescription: "Faktur telah dibatalkan",
    },
    credited: {
      label: "Dikreditkan",
      variant: "info",
      accessibleDescription: "Faktur telah dikreditkan",
    },
  },

  // ── Period Locks ────────────────────────────────────────────
  period_locks: {
    active: {
      label: "Aktif",
      variant: "success",
      accessibleDescription: "Kunci periode sedang aktif",
    },
    replaced: {
      label: "Digantikan",
      variant: "neutral",
      accessibleDescription: "Kunci periode telah digantikan oleh kunci yang lebih baru",
    },
  },

  // ── Reconciliation ──────────────────────────────────────────
  reconciliation: {
    balanced: {
      label: "Seimbang",
      variant: "success",
      accessibleDescription: "Transaksi telah direkonsiliasi dan seimbang",
    },
    unbalanced: {
      label: "Tidak Seimbang",
      variant: "error",
      accessibleDescription: "Terdapat ketidaksesuaian yang perlu diperiksa",
    },
    in_progress: {
      label: "Diproses",
      variant: "info",
      accessibleDescription: "Proses rekonsiliasi sedang berjalan",
    },
  },

  // ── Notification Severity ──────────────────────────────────
  notification_severity: {
    critical: {
      label: "Kritis",
      variant: "error",
      accessibleDescription: "Perlu tindakan segera",
    },
    high: {
      label: "Tinggi",
      variant: "warning",
      accessibleDescription: "Prioritas tinggi untuk ditindaklanjuti",
    },
    medium: {
      label: "Sedang",
      variant: "warning",
      accessibleDescription: "Perlu diperhatikan",
    },
    low: {
      label: "Rendah",
      variant: "info",
      accessibleDescription: "Informasi ringan",
    },
    info: {
      label: "Informasi",
      variant: "neutral",
      accessibleDescription: "Informasi umum",
    },
  },

  // ── Onboarding ──────────────────────────────────────────────
  onboarding: {
    not_started: {
      label: "Belum Dimulai",
      variant: "neutral",
      accessibleDescription: "Tahap onboarding belum dimulai",
    },
    in_progress: {
      label: "Diproses",
      variant: "info",
      accessibleDescription: "Tahap onboarding sedang berjalan",
    },
    completed: {
      label: "Selesai",
      variant: "success",
      accessibleDescription: "Tahap onboarding telah selesai",
    },
  },

  // ── Imports ──────────────────────────────────────────────────
  imports: {
    pending: {
      label: "Menunggu",
      variant: "info",
      accessibleDescription: "Import sedang menunggu diproses",
    },
    processing: {
      label: "Memproses",
      variant: "info",
      accessibleDescription: "Data sedang diimpor",
    },
    completed: {
      label: "Selesai",
      variant: "success",
      accessibleDescription: "Import telah selesai",
    },
    failed: {
      label: "Gagal",
      variant: "error",
      accessibleDescription: "Import gagal, periksa data dan coba lagi",
    },
    partial: {
      label: "Sebagian Berhasil",
      variant: "warning",
      accessibleDescription: "Beberapa data berhasil diimpor, sebagian lainnya gagal",
    },
  },
} as const;

/** Helper untuk mendapatkan status dengan fallback yang aman */
export function getStatus(domain: string, rawStatus: string): StatusDef {
  const fallback: StatusDef = {
    label: rawStatus,
    variant: "neutral",
    accessibleDescription: `Status: ${rawStatus}`,
  };
  return STATUS_REGISTRY[domain]?.[rawStatus] ?? fallback;
}
