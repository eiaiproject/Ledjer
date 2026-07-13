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
import { formatIDR, localDate } from "@/lib/utils";
export { localDate };
import { TRANSACTION_LABELS } from "@/lib/transactions";

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
    label: TRANSACTION_LABELS.cash_sale,
    description: "Pelanggan bayar langsung saat itu juga.",
    icon: DollarSign,
    hint: "Cocok untuk penjualan kas/tunai.",
  },
  credit_sale: {
    label: TRANSACTION_LABELS.credit_sale,
    description: "Barang dikirim, bayar nanti (piutang).",
    icon: FileText,
    hint: "Pembeli belum membayar.",
  },
  receive_receivable: {
    label: TRANSACTION_LABELS.receive_receivable,
    description: "Pelanggan membayar tagihan/piutang.",
    icon: Download,
    hint: "Mencatat penerimaan pembayaran.",
  },
  cash_purchase: {
    label: TRANSACTION_LABELS.cash_purchase,
    description: "Pembelian dibayar langsung.",
    icon: ShoppingCart,
    hint: "Bayar langsung saat beli.",
  },
  credit_purchase: {
    label: TRANSACTION_LABELS.credit_purchase,
    description: "Pembelian dengan utang (hutang).",
    icon: ClipboardList,
    hint: "Bayar nanti ke supplier.",
  },
  pay_payable: {
    label: TRANSACTION_LABELS.pay_payable,
    description: "Melunasi utang ke supplier.",
    icon: CreditCard,
    hint: "Mencatat pembayaran utang.",
  },
  expense_payment: {
    label: TRANSACTION_LABELS.expense_payment,
    description: "Mencatat beban operasional.",
    icon: Receipt,
    hint: "Gaji, listrik, sewa, dll.",
  },
  owner_capital: {
    label: TRANSACTION_LABELS.owner_capital,
    description: "Setoran modal dari pemilik.",
    icon: Landmark,
    hint: "Modal masuk ke usaha.",
  },
  owner_draw: {
    label: TRANSACTION_LABELS.owner_draw,
    description: "Prive atau tarik tunai pemilik.",
    icon: Wallet,
    hint: "Uang diambil dari usaha.",
  },
  cash_transfer: {
    label: TRANSACTION_LABELS.cash_transfer,
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

/** Top transaction types shown by default on mobile (above the fold) */
export const MOBILE_PRIORITY_TYPES = ["cash_sale", "cash_purchase", "expense_payment"];

export const PARTY_COPY: Record<string, { label: string; placeholder: string; helper: string }> = {
  credit_sale: {
    label: "Pelanggan",
    placeholder: "Ketik nama pelanggan...",
    helper: "Pelanggan akan dibuat otomatis jika belum ada.",
  },
  receive_receivable: {
    label: "Pelanggan yang membayar",
    placeholder: "Ketik nama pelanggan...",
    helper: "Pilih pelanggan yang sedang melunasi piutang. Jika nominal melebihi piutang, saldo piutang pelanggan akan menjadi negatif (lihat catatan AR/AP).",
  },
  credit_purchase: {
    label: "Supplier",
    placeholder: "Ketik nama supplier...",
    helper: "Supplier akan dibuat otomatis jika belum ada.",
  },
  pay_payable: {
    label: "Supplier yang dibayar",
    placeholder: "Ketik nama supplier...",
    helper: "Pilih supplier yang sedang dibayar utangnya. Jika nominal melebihi utang, saldo utang supplier akan menjadi negatif (lihat catatan AR/AP).",
  },
};

export const CASH_ACCOUNT_LABELS: Record<string, string> = {
  cash_sale: "Diterima di",
  credit_sale: "Diterima lewat",
  receive_receivable: "Diterima lewat",
  cash_purchase: "Dibayar dari",
  credit_purchase: "Dibayar lewat",
  pay_payable: "Dibayar lewat",
  expense_payment: "Dibayar dari",
  owner_capital: "Masuk ke",
  owner_draw: "Diambil dari",
  cash_transfer: "Dari rekening",
};

export const CASH_ACCOUNT_PLACEHOLDERS: Record<string, string> = {
  cash_sale: "Pilih kas, bank, atau QRIS",
  credit_sale: "Pilih kas, bank, atau QRIS",
  receive_receivable: "Pilih kas, bank, atau QRIS",
  cash_purchase: "Pilih akun sumber pembayaran",
  credit_purchase: "Pilih akun sumber pembayaran",
  pay_payable: "Pilih akun sumber pembayaran",
  expense_payment: "Pilih akun sumber pembayaran",
  owner_capital: "Pilih akun penerimaan",
  owner_draw: "Pilih akun penarikan",
  cash_transfer: "Pilih rekening sumber",
};

export const CATEGORY_LABELS: Record<string, string> = {
  cash_purchase: "Akun beban / HPP (CoA)",
  credit_purchase: "Akun beban / HPP (CoA)",
  expense_payment: "Akun beban operasional (CoA)",
};

export const DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  cash_sale: "Contoh: Penjualan tunai Kopi Susu x2",
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

export const SECTION_LABELS: Record<string, { detail: string; payment: string; notes: string }> = {
  cash_sale: { detail: "Detail Penjualan", payment: "Pembayaran", notes: "Catatan" },
  credit_sale: { detail: "Detail Penjualan", payment: "Pembayaran & Pelanggan", notes: "Catatan" },
  cash_purchase: { detail: "Detail Pembelian", payment: "Pembayaran", notes: "Catatan" },
  credit_purchase: { detail: "Detail Pembelian", payment: "Pembayaran & Supplier", notes: "Catatan" },
};

/** Auto-generate description from product + qty + total */
export function generateAutoDescription(args: {
  transactionType: string;
  productName?: string;
  quantity?: number;
  totalAmount: number;
}): string {
  const { transactionType, productName, quantity, totalAmount } = args;
  const isSale = transactionType === "cash_sale" || transactionType === "credit_sale";
  const prefix = isSale ? "Penjualan" : "Pembelian";

  if (productName && quantity && quantity > 0) {
    return `${prefix} ${productName} x${quantity}`;
  }
  if (productName) {
    return `${prefix} ${productName}`;
  }
  return `${prefix.toLowerCase()} ${formatIDR(totalAmount)}`;
}

/** Get contextual submit button label */
export function getSubmitLabel(args: {
  transactionType: string;
  amount: number;
  isEditing: boolean;
  loading: boolean;
  successId: string | null;
}): string {
  const { transactionType, amount, loading, successId } = args;
  if (successId) return "Transaksi Tersimpan";
  if (loading) return "Menyimpan...";

  const LABELS: Record<string, string> = {
    cash_sale: "Catat Penjualan",
    credit_sale: "Catat Penjualan Kredit",
    receive_receivable: "Catat Penerimaan",
    cash_purchase: "Catat Pembelian",
    credit_purchase: "Catat Pembelian Kredit",
    pay_payable: "Catat Pembayaran Utang",
    expense_payment: "Catat Beban",
    owner_capital: "Catat Setoran Modal",
    owner_draw: "Catat Penarikan",
    cash_transfer: "Transfer Saldo",
  };
  const verb = LABELS[transactionType] || "Catat Transaksi";
  if (amount > 0) {
    return `${verb} ${formatIDR(amount)}`;
  }
  return verb;
}

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
      // ponytail: paymentStatus === "paid" for credit_sale is invalid per
      // backend rule (fully paid = cash_sale). Kept as defensive fallback
      // for any legacy data; UI only offers unpaid/partial.
      if (paymentStatus === "paid") {
        debit.push({ account: cashAccountLabel, amount, direction: "increase" });
      } else if (paymentStatus === "partial") {
        debit.push(
          { account: cashAccountLabel, amount: partialAmount, direction: "increase" },
          { account: "Piutang Usaha", amount: remaining, direction: "increase" },
        );
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
      // ponytail: paymentStatus === "paid" for credit_purchase is invalid per
      // backend rule (fully paid = cash_purchase). Kept as defensive fallback.
      debit.push({ account: expenseAccount, amount, direction: "increase" });
      if (paymentStatus === "paid") {
        credit.push({ account: cashAccountLabel, amount, direction: "decrease" });
      } else if (paymentStatus === "partial") {
        credit.push(
          { account: cashAccountLabel, amount: partialAmount, direction: "decrease" },
          { account: "Utang Usaha", amount: remaining, direction: "increase" },
        );
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
