import {
  ArrowRightLeft,
  ClipboardList,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Landmark,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transactions";

export interface PreviewLine {
  account: string;
  amount: number;
  direction: "increase" | "decrease";
}

export interface TransactionTypeMeta {
  label: string;
  description: string;
  icon: typeof DollarSign;
  hint?: string;
}

export const TRANSACTION_META: Record<string, TransactionTypeMeta> = {
  cash_sale: {
    label: TRANSACTION_TYPE_LABELS.cash_sale,
    description: "Pelanggan bayar langsung saat itu juga.",
    icon: DollarSign,
    hint: "Cocok untuk penjualan kas/tunai.",
  },
  credit_sale: {
    label: TRANSACTION_TYPE_LABELS.credit_sale,
    description: "Barang dikirim, bayar nanti (piutang).",
    icon: FileText,
    hint: "Pembeli belum membayar.",
  },
  receive_receivable: {
    label: TRANSACTION_TYPE_LABELS.receive_receivable,
    description: "Pelanggan membayar tagihan/piutang.",
    icon: Download,
    hint: "Mencatat penerimaan pembayaran.",
  },
  cash_purchase: {
    label: TRANSACTION_TYPE_LABELS.cash_purchase,
    description: "Pembelian dibayar langsung.",
    icon: ShoppingCart,
    hint: "Bayar langsung saat beli.",
  },
  credit_purchase: {
    label: TRANSACTION_TYPE_LABELS.credit_purchase,
    description: "Pembelian dengan utang (hutang).",
    icon: ClipboardList,
    hint: "Bayar nanti ke supplier.",
  },
  pay_payable: {
    label: TRANSACTION_TYPE_LABELS.pay_payable,
    description: "Melunasi utang ke supplier.",
    icon: CreditCard,
    hint: "Mencatat pembayaran utang.",
  },
  expense_payment: {
    label: TRANSACTION_TYPE_LABELS.expense_payment,
    description: "Mencatat beban operasional.",
    icon: Receipt,
    hint: "Gaji, listrik, sewa, dll.",
  },
  owner_capital: {
    label: TRANSACTION_TYPE_LABELS.owner_capital,
    description: "Setoran modal dari pemilik.",
    icon: Landmark,
    hint: "Modal masuk ke usaha.",
  },
  owner_draw: {
    label: TRANSACTION_TYPE_LABELS.owner_draw,
    description: "Prive atau tarik tunai pemilik.",
    icon: Wallet,
    hint: "Uang diambil dari usaha.",
  },
  cash_transfer: {
    label: TRANSACTION_TYPE_LABELS.cash_transfer,
    description: "Pindah saldo antar rekening.",
    icon: ArrowRightLeft,
    hint: "Misal: dari Kas ke Bank BCA.",
  },
};

export const TRANSACTION_GROUPS = [
  { label: "Pemasukan", types: ["cash_sale", "credit_sale", "receive_receivable"] },
  { label: "Pengeluaran", types: ["cash_purchase", "credit_purchase", "pay_payable", "expense_payment"] },
  { label: "Modal Pemilik", types: ["owner_capital", "owner_draw"] },
  { label: "Transfer", types: ["cash_transfer"] },
];

export const PARTY_COPY: Record<string, { label: string; placeholder: string; helper: string }> = {
  credit_sale: {
    label: "Pelanggan",
    placeholder: "Ketik nama pelanggan...",
    helper: "Pelanggan akan dibuat otomatis jika belum ada.",
  },
  receive_receivable: {
    label: "Pelanggan yang membayar",
    placeholder: "Ketik nama pelanggan...",
    helper: "Pilih pelanggan yang sedang melunasi piutang.",
  },
  credit_purchase: {
    label: "Supplier",
    placeholder: "Ketik nama supplier...",
    helper: "Supplier akan dibuat otomatis jika belum ada.",
  },
  pay_payable: {
    label: "Supplier yang dibayar",
    placeholder: "Ketik nama supplier...",
    helper: "Pilih supplier yang sedang dibayar utangnya.",
  },
};

export const CASH_ACCOUNT_LABELS: Record<string, string> = {
  cash_sale: "Uang masuk ke akun",
  credit_sale: "Uang diterima lewat akun",
  receive_receivable: "Uang diterima lewat akun",
  cash_purchase: "Uang keluar dari akun",
  credit_purchase: "Uang dibayar lewat akun",
  pay_payable: "Uang dibayar lewat akun",
  expense_payment: "Uang keluar dari akun",
  owner_capital: "Modal masuk ke akun",
  owner_draw: "Uang diambil dari akun",
  cash_transfer: "Sumber transfer",
};

export const CATEGORY_LABELS: Record<string, string> = {
  cash_purchase: "Kategori pembelian",
  credit_purchase: "Kategori pembelian",
  expense_payment: "Kategori beban",
};

export const DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  cash_sale: "Contoh: Penjualan tunai produk A ke Pak Budi",
  credit_sale: "Contoh: Penjualan kredit produk A ke Budi",
  receive_receivable: "Contoh: Pelunasan piutang dari Budi",
  cash_purchase: "Contoh: Pembelian perlengkapan toko",
  credit_purchase: "Contoh: Pembelian kredit dari supplier XYZ",
  pay_payable: "Contoh: Pembayaran utang ke supplier XYZ",
  expense_payment: "Contoh: Pembayaran listrik bulan Juni",
  owner_capital: "Contoh: Setoran modal pemilik bulan ini",
  owner_draw: "Contoh: Pengambilan pribadi pemilik",
  cash_transfer: "Contoh: Transfer dari Kas ke Bank BCA",
};

export const EXPENSE_CATEGORIES = [
  "Gaji",
  "Sewa",
  "Listrik dan Air",
  "Internet dan Telepon",
  "Transportasi",
  "Iklan dan Promosi",
  "Perlengkapan",
  "Software / Langganan",
  "Lain-lain",
];

const RECENT_TYPES_KEY = "ledjer:recent-transaction-types";
const MAX_RECENT_TYPES = 4;

export function getRecentTransactionTypes(): string[] {
  try {
    const stored = window.localStorage.getItem(RECENT_TYPES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentTransactionType(type: string): string[] {
  const recent = getRecentTransactionTypes().filter((t) => t !== type);
  const updated = [type, ...recent].slice(0, MAX_RECENT_TYPES);
  try {
    window.localStorage.setItem(RECENT_TYPES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
  return updated;
}

export function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().split("T")[0];
}

export function buildPreview({
  transactionType,
  amount,
  partialAmount,
  paymentStatus,
  cashAccountLabel,
  destinationAccountLabel,
  categoryName,
  productName,
}: {
  transactionType: string;
  amount: number;
  partialAmount: number;
  paymentStatus: string;
  cashAccountLabel: string;
  destinationAccountLabel: string;
  categoryName: string;
  productName: string;
}): { debit: PreviewLine[]; credit: PreviewLine[] } {
  const debit: PreviewLine[] = [];
  const credit: PreviewLine[] = [];
  const expenseAccount = productName || categoryName || "Beban / Pembelian";
  const remaining = Math.max(amount - partialAmount, 0);

  switch (transactionType) {
    case "cash_sale":
      debit.push({ account: cashAccountLabel, amount, direction: "increase" });
      credit.push({ account: "Pendapatan Usaha", amount, direction: "increase" });
      break;
    case "credit_sale":
      if (paymentStatus === "paid") {
        debit.push({ account: cashAccountLabel, amount, direction: "increase" });
      } else if (paymentStatus === "partial") {
        debit.push({ account: cashAccountLabel, amount: partialAmount, direction: "increase" });
        debit.push({ account: "Piutang Usaha", amount: remaining, direction: "increase" });
      } else {
        debit.push({ account: "Piutang Usaha", amount, direction: "increase" });
      }
      credit.push({ account: "Pendapatan Usaha", amount, direction: "increase" });
      break;
    case "receive_receivable":
      debit.push({ account: cashAccountLabel, amount, direction: "increase" });
      credit.push({ account: "Piutang Usaha", amount, direction: "decrease" });
      break;
    case "cash_purchase":
      debit.push({ account: expenseAccount, amount, direction: "increase" });
      credit.push({ account: cashAccountLabel, amount, direction: "decrease" });
      break;
    case "credit_purchase":
      debit.push({ account: expenseAccount, amount, direction: "increase" });
      if (paymentStatus === "paid") {
        credit.push({ account: cashAccountLabel, amount, direction: "decrease" });
      } else if (paymentStatus === "partial") {
        credit.push({ account: cashAccountLabel, amount: partialAmount, direction: "decrease" });
        credit.push({ account: "Utang Usaha", amount: remaining, direction: "increase" });
      } else {
        credit.push({ account: "Utang Usaha", amount, direction: "increase" });
      }
      break;
    case "pay_payable":
      debit.push({ account: "Utang Usaha", amount, direction: "decrease" });
      credit.push({ account: cashAccountLabel, amount, direction: "decrease" });
      break;
    case "expense_payment":
      debit.push({ account: categoryName || "Beban Operasional", amount, direction: "increase" });
      credit.push({ account: cashAccountLabel, amount, direction: "decrease" });
      break;
    case "owner_capital":
      debit.push({ account: cashAccountLabel, amount, direction: "increase" });
      credit.push({ account: "Modal Pemilik", amount, direction: "increase" });
      break;
    case "owner_draw":
      debit.push({ account: "Prive Pemilik", amount, direction: "increase" });
      credit.push({ account: cashAccountLabel, amount, direction: "decrease" });
      break;
    case "cash_transfer":
      debit.push({ account: destinationAccountLabel, amount, direction: "increase" });
      credit.push({ account: cashAccountLabel, amount, direction: "decrease" });
      break;
  }

  return { debit, credit };
}
