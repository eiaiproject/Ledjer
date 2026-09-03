import type { TransactionDirection, TransactionType } from "./api/transactions";

// Label user (Bahasa Indonesia) untuk 5 jenis transaksi MVP (PRD TRX-01).
export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  cash_in: "Uang Masuk",
  cash_out: "Uang Keluar",
  transfer: "Transfer",
  owner_deposit: "Modal Masuk",
  owner_withdrawal: "Pengambilan Pemilik",
};

export const TRANSACTION_TYPES: TransactionType[] = [
  "cash_in",
  "cash_out",
  "transfer",
  "owner_deposit",
  "owner_withdrawal",
];

export function labelForTransactionType(type?: TransactionType | null): string {
  if (!type) return "-";
  return TRANSACTION_LABELS[type] ?? type;
}

/** Arah tanda nominal di daftar transaksi (PRD TRX-09). */
export function directionSign(direction: TransactionDirection): string {
  switch (direction) {
    case "in":
      return "+";
    case "out":
      return "-";
    case "neutral":
      return "↔";
  }
}

/** Deskripsi peran akun lawan (counter account) per jenis transaksi. */
export function counterAccountLabel(type: TransactionType): string {
  switch (type) {
    case "cash_in":
      return "Kategori Pendapatan";
    case "cash_out":
      return "Kategori Beban";
    case "transfer":
      return "Akun Tujuan";
    case "owner_deposit":
      return "Modal Pemilik";
    case "owner_withdrawal":
      return "Pengambilan Pemilik";
  }
}

/** Label akun kas/bank sesuai jenis transaksi. */
export function cashAccountLabel(type: TransactionType): string {
  switch (type) {
    case "cash_in":
    case "owner_deposit":
      return "Akun Kas/Bank Tujuan";
    case "cash_out":
    case "owner_withdrawal":
      return "Akun Kas/Bank Sumber";
    case "transfer":
      return "Akun Sumber";
  }
}