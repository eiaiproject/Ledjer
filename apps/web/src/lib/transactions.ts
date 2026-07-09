// Transaction labels — single flat map, includes historical/opening types.
// Opening types not in UI selector but kept for display of stored records.
export const TRANSACTION_LABELS: Record<string, string> = {
  cash_sale: "Penjualan Tunai",
  credit_sale: "Penjualan Kredit",
  receive_receivable: "Terima Piutang",
  cash_purchase: "Pembelian Tunai",
  credit_purchase: "Pembelian Kredit",
  pay_payable: "Bayar Utang",
  expense_payment: "Bayar Beban",
  owner_capital: "Modal Pemilik",
  owner_draw: "Penarikan Tunai",
  cash_transfer: "Transfer Antar Rekening Bank",
  opening_cash_balance: "Saldo Awal Kas",
  opening_receivable_balance: "Saldo Awal Piutang",
  opening_payable_balance: "Saldo Awal Utang",
  simple_adjustment: "Penyesuaian",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Lunas",
  unpaid: "Belum dibayar",
  partial: "Sebagian dibayar",
};

// Feature flags per transaction type — replaces 6 separate constant arrays + 6 accessor functions
const TX_FEATURES: Record<string, { cash?: true; dest?: true; party?: true; category?: true; payment?: true }> = {
  cash_sale:         { cash: true },
  credit_sale:       { party: true, payment: true },
  receive_receivable:{ cash: true, party: true },
  cash_purchase:     { cash: true, category: true },
  credit_purchase:   { party: true, category: true, payment: true },
  pay_payable:       { cash: true, party: true },
  expense_payment:   { cash: true, category: true },
  owner_capital:     { cash: true },
  owner_draw:        { cash: true },
  cash_transfer:     { cash: true, dest: true },
};

const features = (type?: string) => TX_FEATURES[type ?? ""] ?? {};
export const usesCashAccount = (t?: string) => !!features(t).cash;
export const usesDestinationAccount = (t?: string) => !!features(t).dest;
export const usesParty = (t?: string) => !!features(t).party;
export const usesCategory = (t?: string) => !!features(t).category;
export const usesPaymentStatus = (t?: string) => !!features(t).payment;

export function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "posted") return "success";
  if (status === "voided") return "error";
  if (status === "reversed") return "warning";
  return "neutral";
}

export function statusLabel(status: string) {
  if (status === "posted") return "Posted";
  if (status === "voided") return "Dibatalkan";
  if (status === "reversed") return "Reversal";
  return status;
}

export function partyTypeForTransaction(type?: string) {
  if (type === "credit_sale" || type === "receive_receivable") return "customer";
  if (type === "credit_purchase" || type === "pay_payable") return "supplier";
  return "other";
}

export function labelForTransactionType(type?: string | null): string {
  if (!type) return "—";
  return TRANSACTION_LABELS[type] ?? type;
}