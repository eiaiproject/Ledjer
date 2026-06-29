import { describe, it, expect } from 'vitest';
import {
  GENERAL_TRANSACTION_TYPE_LABELS,
  OPENING_TRANSACTION_TYPE_LABELS,
  ALL_TRANSACTION_TYPE_LABELS,
  labelForTransactionType,
  PAYMENT_STATUS_LABELS,
  CASH_ACCOUNT_TRANSACTION_TYPES,
  PARTY_TRANSACTION_TYPES,
  CATEGORY_TRANSACTION_TYPES,
  PAYMENT_STATUS_TRANSACTION_TYPES,
  usesCashAccount,
  usesDestinationAccount,
  usesParty,
  usesCategory,
  usesPaymentStatus,
  partyTypeForTransaction,
} from '@/lib/transactions';

describe('Transaction Type Labels', () => {
  it('has labels for all standard transaction types', () => {
    expect(ALL_TRANSACTION_TYPE_LABELS.cash_sale).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.credit_sale).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.cash_purchase).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.credit_purchase).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.expense_payment).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.owner_capital).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.owner_draw).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.receive_receivable).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.pay_payable).toBeDefined();
    expect(ALL_TRANSACTION_TYPE_LABELS.cash_transfer).toBeDefined();
  });

  it('does NOT include opening balance types in general UI labels', () => {
    // Opening balances should only be posted through dedicated onboarding flow
    // They should not appear in the general transaction type selector
    expect(GENERAL_TRANSACTION_TYPE_LABELS).not.toHaveProperty('opening_cash_balance');
    expect(GENERAL_TRANSACTION_TYPE_LABELS).not.toHaveProperty('opening_receivable_balance');
    expect(GENERAL_TRANSACTION_TYPE_LABELS).not.toHaveProperty('opening_payable_balance');
  });

  it('OPENING labels contain the three opening types', () => {
    expect(OPENING_TRANSACTION_TYPE_LABELS.opening_cash_balance).toBeDefined();
    expect(OPENING_TRANSACTION_TYPE_LABELS.opening_receivable_balance).toBeDefined();
    expect(OPENING_TRANSACTION_TYPE_LABELS.opening_payable_balance).toBeDefined();
  });

  it('ALL is a superset of GENERAL and OPENING', () => {
    const allKeys = Object.keys(ALL_TRANSACTION_TYPE_LABELS);
    const generalKeys = Object.keys(GENERAL_TRANSACTION_TYPE_LABELS);
    const openingKeys = Object.keys(OPENING_TRANSACTION_TYPE_LABELS);
    // ALL should contain all GENERAL and OPENING keys
    expect(allKeys).toEqual(expect.arrayContaining(generalKeys));
    expect(allKeys).toEqual(expect.arrayContaining(openingKeys));
    // ALL may contain additional backend-only types (e.g., simple_adjustment)
  });

  it('labelForTransactionType falls back gracefully', () => {
    expect(labelForTransactionType('cash_sale')).toBe('Penjualan Tunai');
    expect(labelForTransactionType('opening_cash_balance')).toBe('Saldo Awal Kas');
    expect(labelForTransactionType(undefined)).toBe('—');
    expect(labelForTransactionType('unknown_type')).toBe('unknown_type');
  });
});

describe('Payment Status Labels', () => {
  it('has all payment status labels', () => {
    expect(PAYMENT_STATUS_LABELS.paid).toBe('Lunas');
    expect(PAYMENT_STATUS_LABELS.unpaid).toBe('Belum dibayar');
    expect(PAYMENT_STATUS_LABELS.partial).toBe('Sebagian dibayar');
  });
});

describe('Transaction Type Classification', () => {
  describe('usesCashAccount', () => {
    it('returns true for types that require cash account', () => {
      expect(usesCashAccount('cash_sale')).toBe(true);
      expect(usesCashAccount('receive_receivable')).toBe(true);
      expect(usesCashAccount('cash_purchase')).toBe(true);
      expect(usesCashAccount('pay_payable')).toBe(true);
      expect(usesCashAccount('expense_payment')).toBe(true);
      expect(usesCashAccount('owner_capital')).toBe(true);
      expect(usesCashAccount('owner_draw')).toBe(true);
      expect(usesCashAccount('cash_transfer')).toBe(true);
    });

    it('returns false for types that do not require cash account', () => {
      expect(usesCashAccount('credit_sale')).toBe(false);
      expect(usesCashAccount('credit_purchase')).toBe(false);
    });

    it('returns false for undefined/null', () => {
      expect(usesCashAccount(undefined)).toBe(false);
      expect(usesCashAccount(null as unknown as string)).toBe(false);
    });
  });

  describe('usesDestinationAccount', () => {
    it('returns true only for cash_transfer', () => {
      expect(usesDestinationAccount('cash_transfer')).toBe(true);
    });

    it('returns false for other types', () => {
      expect(usesDestinationAccount('cash_sale')).toBe(false);
      expect(usesDestinationAccount('cash_purchase')).toBe(false);
    });
  });

  describe('usesParty', () => {
    it('returns true for credit types and receivable/payable', () => {
      expect(usesParty('credit_sale')).toBe(true);
      expect(usesParty('credit_purchase')).toBe(true);
      expect(usesParty('receive_receivable')).toBe(true);
      expect(usesParty('pay_payable')).toBe(true);
    });

    it('returns false for cash types', () => {
      expect(usesParty('cash_sale')).toBe(false);
      expect(usesParty('cash_purchase')).toBe(false);
    });
  });

  describe('usesCategory', () => {
    it('returns true for purchase and expense types', () => {
      expect(usesCategory('cash_purchase')).toBe(true);
      expect(usesCategory('credit_purchase')).toBe(true);
      expect(usesCategory('expense_payment')).toBe(true);
    });

    it('returns false for sale types', () => {
      expect(usesCategory('cash_sale')).toBe(false);
      expect(usesCategory('credit_sale')).toBe(false);
    });
  });

  describe('usesPaymentStatus', () => {
    it('returns true for credit types', () => {
      expect(usesPaymentStatus('credit_sale')).toBe(true);
      expect(usesPaymentStatus('credit_purchase')).toBe(true);
    });

    it('returns false for cash types', () => {
      expect(usesPaymentStatus('cash_sale')).toBe(false);
      expect(usesPaymentStatus('cash_purchase')).toBe(false);
    });
  });
});

describe('Party Type for Transaction', () => {
  it('returns customer for sale-related types', () => {
    expect(partyTypeForTransaction('credit_sale')).toBe('customer');
    expect(partyTypeForTransaction('receive_receivable')).toBe('customer');
  });

  it('returns supplier for purchase-related types', () => {
    expect(partyTypeForTransaction('credit_purchase')).toBe('supplier');
    expect(partyTypeForTransaction('pay_payable')).toBe('supplier');
  });

  it('returns other for non-party types', () => {
    expect(partyTypeForTransaction('cash_sale')).toBe('other');
    expect(partyTypeForTransaction('expense_payment')).toBe('other');
    expect(partyTypeForTransaction('owner_capital')).toBe('other');
  });
});

describe('Transaction Type Arrays', () => {
  it('CASH_ACCOUNT_TRANSACTION_TYPES includes all cash types', () => {
    expect(CASH_ACCOUNT_TRANSACTION_TYPES).toContain('cash_sale');
    expect(CASH_ACCOUNT_TRANSACTION_TYPES).toContain('cash_purchase');
    expect(CASH_ACCOUNT_TRANSACTION_TYPES).toContain('expense_payment');
    expect(CASH_ACCOUNT_TRANSACTION_TYPES).toContain('owner_capital');
    expect(CASH_ACCOUNT_TRANSACTION_TYPES).toContain('owner_draw');
    expect(CASH_ACCOUNT_TRANSACTION_TYPES).toContain('cash_transfer');
  });

  it('PARTY_TRANSACTION_TYPES includes all party types', () => {
    expect(PARTY_TRANSACTION_TYPES).toContain('credit_sale');
    expect(PARTY_TRANSACTION_TYPES).toContain('credit_purchase');
    expect(PARTY_TRANSACTION_TYPES).toContain('receive_receivable');
    expect(PARTY_TRANSACTION_TYPES).toContain('pay_payable');
  });

  it('PAYMENT_STATUS_TRANSACTION_TYPES includes credit types', () => {
    expect(PAYMENT_STATUS_TRANSACTION_TYPES).toContain('credit_sale');
    expect(PAYMENT_STATUS_TRANSACTION_TYPES).toContain('credit_purchase');
  });

  it('CATEGORY_TRANSACTION_TYPES includes purchase and expense types', () => {
    expect(CATEGORY_TRANSACTION_TYPES).toContain('cash_purchase');
    expect(CATEGORY_TRANSACTION_TYPES).toContain('credit_purchase');
    expect(CATEGORY_TRANSACTION_TYPES).toContain('expense_payment');
  });
});
