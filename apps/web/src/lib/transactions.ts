export const TRANSACTION_TYPE_LABELS = {
  opening_cash_balance: "Saldo Awal Kas",
  opening_receivable_balance: "Saldo Awal Piutang",
  opening_payable_balance: "Saldo Awal Utang",
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
  simple_adjustment: "Penyesuaian",
} as const;

export const PAYMENT_STATUS_LABELS = {
  paid: "Lunas",
  unpaid: "Belum dibayar",
  partial: "Sebagian dibayar",
} as const;

export const CASH_ACCOUNT_TRANSACTION_TYPES = [
  "cash_sale",
  "receive_receivable",
  "cash_purchase",
  "pay_payable",
  "expense_payment",
  "owner_capital",
  "owner_draw",
  "cash_transfer",
  "opening_cash_balance",
] as const;

export const DESTINATION_ACCOUNT_TRANSACTION_TYPES = ["cash_transfer"] as const;

export const PARTY_TRANSACTION_TYPES = [
  "credit_sale",
  "receive_receivable",
  "credit_purchase",
  "pay_payable",
] as const;

export const CATEGORY_TRANSACTION_TYPES = [
  "cash_purchase",
  "credit_purchase",
  "expense_payment",
] as const;

export const PAYMENT_STATUS_TRANSACTION_TYPES = [
  "credit_sale",
  "credit_purchase",
] as const;

function includesType(types: readonly string[], type?: string) {
  return !!type && types.includes(type);
}

export function usesCashAccount(type?: string) {
  return includesType(CASH_ACCOUNT_TRANSACTION_TYPES, type);
}

export function usesDestinationAccount(type?: string) {
  return includesType(DESTINATION_ACCOUNT_TRANSACTION_TYPES, type);
}

export function usesParty(type?: string) {
  return includesType(PARTY_TRANSACTION_TYPES, type);
}

export function usesCategory(type?: string) {
  return includesType(CATEGORY_TRANSACTION_TYPES, type);
}

export function usesPaymentStatus(type?: string) {
  return includesType(PAYMENT_STATUS_TRANSACTION_TYPES, type);
}

export function partyTypeForTransaction(type?: string) {
  if (type === "credit_sale" || type === "receive_receivable") return "customer";
  if (type === "credit_purchase" || type === "pay_payable") return "supplier";
  return "other";
}
