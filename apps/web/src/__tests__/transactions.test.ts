import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_LABELS,
  labelForTransactionType,
  PAYMENT_STATUS_LABELS,
  usesCashAccount,
  usesDestinationAccount,
  usesParty,
  usesCategory,
  usesPaymentStatus,
  partyTypeForTransaction,
} from '@/lib/transactions';

describe('Transaction Type Labels', () => {
  it('has labels for all standard transaction types', () => {
    expect(TRANSACTION_LABELS.cash_sale).toBeDefined();
    expect(TRANSACTION_LABELS.credit_sale).toBeDefined();
    expect(TRANSACTION_LABELS.cash_purchase).toBeDefined();
    expect(TRANSACTION_LABELS.credit_purchase).toBeDefined();
    expect(TRANSACTION_LABELS.expense_payment).toBeDefined();
    expect(TRANSACTION_LABELS.owner_capital).toBeDefined();
    expect(TRANSACTION_LABELS.owner_draw).toBeDefined();
    expect(TRANSACTION_LABELS.receive_receivable).toBeDefined();
    expect(TRANSACTION_LABELS.pay_payable).toBeDefined();
    expect(TRANSACTION_LABELS.cash_transfer).toBeDefined();
  });

  it('includes opening balance types for historical display', () => {
    expect(TRANSACTION_LABELS.opening_cash_balance).toBeDefined();
    expect(TRANSACTION_LABELS.opening_receivable_balance).toBeDefined();
    expect(TRANSACTION_LABELS.opening_payable_balance).toBeDefined();
    expect(TRANSACTION_LABELS.simple_adjustment).toBeDefined();
  });

  it('labelForTransactionType falls back gracefully', () => {
    expect(labelForTransactionType('cash_sale')).toBe('Penjualan Tunai');
    expect(labelForTransactionType('opening_cash_balance')).toBe('Saldo Awal Kas');
    expect(labelForTransactionType('nonexistent')).toBe('nonexistent');
    expect(labelForTransactionType('')).toBe('-');
    expect(labelForTransactionType(null)).toBe('-');
    expect(labelForTransactionType(undefined)).toBe('-');
  });

  it('PAYMENT_STATUS_LABELS are defined', () => {
    expect(PAYMENT_STATUS_LABELS.paid).toBe('Lunas');
    expect(PAYMENT_STATUS_LABELS.unpaid).toBe('Belum dibayar');
    expect(PAYMENT_STATUS_LABELS.partial).toBe('Sebagian dibayar');
  });
});

describe('Transaction Type Feature Flags', () => {
  it('usesCashAccount is true for cash-based types', () => {
    expect(usesCashAccount('cash_sale')).toBe(true);
    expect(usesCashAccount('receive_receivable')).toBe(true);
    expect(usesCashAccount('cash_purchase')).toBe(true);
    expect(usesCashAccount('pay_payable')).toBe(true);
    expect(usesCashAccount('expense_payment')).toBe(true);
    expect(usesCashAccount('owner_capital')).toBe(true);
    expect(usesCashAccount('owner_draw')).toBe(true);
    expect(usesCashAccount('cash_transfer')).toBe(true);
    expect(usesCashAccount('credit_sale')).toBe(false);
    expect(usesCashAccount('credit_purchase')).toBe(false);
  });

  it('usesDestinationAccount is only cash_transfer', () => {
    expect(usesDestinationAccount('cash_transfer')).toBe(true);
    expect(usesDestinationAccount('cash_sale')).toBe(false);
  });

  it('usesParty is true for credit types', () => {
    expect(usesParty('credit_sale')).toBe(true);
    expect(usesParty('receive_receivable')).toBe(true);
    expect(usesParty('credit_purchase')).toBe(true);
    expect(usesParty('pay_payable')).toBe(true);
    expect(usesParty('cash_sale')).toBe(false);
    expect(usesParty('cash_purchase')).toBe(false);
  });

  it('usesCategory is true for purchase/expense types', () => {
    expect(usesCategory('cash_purchase')).toBe(true);
    expect(usesCategory('credit_purchase')).toBe(true);
    expect(usesCategory('expense_payment')).toBe(true);
    expect(usesCategory('cash_sale')).toBe(false);
  });

  it('usesPaymentStatus is only for credit types', () => {
    expect(usesPaymentStatus('credit_sale')).toBe(true);
    expect(usesPaymentStatus('credit_purchase')).toBe(true);
    expect(usesPaymentStatus('cash_sale')).toBe(false);
  });

  it('partyTypeForTransaction returns correct party type', () => {
    expect(partyTypeForTransaction('credit_sale')).toBe('customer');
    expect(partyTypeForTransaction('receive_receivable')).toBe('customer');
    expect(partyTypeForTransaction('credit_purchase')).toBe('supplier');
    expect(partyTypeForTransaction('pay_payable')).toBe('supplier');
    expect(partyTypeForTransaction('cash_sale')).toBe('other');
  });
});
