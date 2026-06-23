// ============================================================================
// Transaction type constants
// ============================================================================
// Three layered constants:
//
//   GENERAL_TRANSACTION_TYPE_LABELS — used by the new-transaction form,
//     transaction list type filter, and recent-types UI. Opening balances are
//     intentionally excluded: those are only posted through the dedicated
//     onboarding / post_opening_balance flow, not the general RPC.
//
//   OPENING_TRANSACTION_TYPE_LABELS — labels for the three opening balance
//     types. Kept for backward compatibility of stored transactions.
//
//   ALL_TRANSACTION_TYPE_LABELS — union of the two. Use only on historical
//     detail / display pages where any historical type may need a label.
//
// TRANSACTION_TYPE_LABELS is preserved as an alias for ALL_TRANSACTION_TYPE_LABELS
// to avoid breaking existing imports; new code should prefer the explicit names.
// ============================================================================

export const GENERAL_TRANSACTION_TYPE_LABELS = {
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

export const OPENING_TRANSACTION_TYPE_LABELS = {
  opening_cash_balance: "Saldo Awal Kas",
  opening_receivable_balance: "Saldo Awal Piutang",
  opening_payable_balance: "Saldo Awal Utang",
} as const;

export const ALL_TRANSACTION_TYPE_LABELS = {
  ...GENERAL_TRANSACTION_TYPE_LABELS,
  ...OPENING_TRANSACTION_TYPE_LABELS,
} as const;

/**
 * @deprecated Use GENERAL_TRANSACTION_TYPE_LABELS for general UI, or
 * OPENING_TRANSACTION_TYPE_LABELS / ALL_TRANSACTION_TYPE_LABELS as appropriate.
 * Kept temporarily for backward compatibility.
 */
export const TRANSACTION_TYPE_LABELS = ALL_TRANSACTION_TYPE_LABELS;

// Type derived from the explicit general-UI set.
export type GeneralTransactionType = keyof typeof GENERAL_TRANSACTION_TYPE_LABELS;
export type OpeningTransactionType = keyof typeof OPENING_TRANSACTION_TYPE_LABELS;
export type TransactionType = keyof typeof ALL_TRANSACTION_TYPE_LABELS;

// ============================================================================
// Other shared labels
// ============================================================================
export const PAYMENT_STATUS_LABELS = {
  paid: "Lunas",
  unpaid: "Belum dibayar",
  partial: "Sebagian dibayar",
} as const;

export const CASH_ACCOUNT_TRANSACTION_TYPES: readonly GeneralTransactionType[] = [
  "cash_sale",
  "receive_receivable",
  "cash_purchase",
  "pay_payable",
  "expense_payment",
  "owner_capital",
  "owner_draw",
  "cash_transfer",
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

/**
 * Returns a label for any historical transaction type (general or opening).
 * For new-UI selectors, prefer the explicit GENERAL_TRANSACTION_TYPE_LABELS map.
 */
export function labelForTransactionType(type?: string | null): string {
  if (!type) return "—";
  return (
    ALL_TRANSACTION_TYPE_LABELS[type as TransactionType] ?? type
  );
}