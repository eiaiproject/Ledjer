import { describe, it, expect } from 'vitest';
import type { TransactionType } from '@/lib/api/transactions';
import {
  TRANSACTION_LABELS,
  TRANSACTION_TYPES,
  labelForTransactionType,
  directionSign,
  counterAccountLabel,
  cashAccountLabel,
} from '@/lib/transactions';
import { getStatus } from '@/lib/status-registry';

describe('Transaction Type Labels', () => {
  it('has labels for all 5 MVP transaction types', () => {
    expect(TRANSACTION_TYPES).toEqual([
      'cash_in',
      'cash_out',
      'transfer',
      'owner_deposit',
      'owner_withdrawal',
    ]);
    expect(TRANSACTION_LABELS.cash_in).toBe('Uang Masuk');
    expect(TRANSACTION_LABELS.cash_out).toBe('Uang Keluar');
    expect(TRANSACTION_LABELS.transfer).toBe('Transfer');
    expect(TRANSACTION_LABELS.owner_deposit).toBe('Modal Masuk');
    expect(TRANSACTION_LABELS.owner_withdrawal).toBe('Pengambilan Pemilik');
  });

  it('labelForTransactionType falls back gracefully', () => {
    expect(labelForTransactionType('cash_in')).toBe('Uang Masuk');
    expect(labelForTransactionType('nonexistent' as TransactionType)).toBe('nonexistent');
    expect(labelForTransactionType('' as TransactionType)).toBe('-');
    expect(labelForTransactionType(null)).toBe('-');
    expect(labelForTransactionType(undefined)).toBe('-');
  });
});

describe('directionSign', () => {
  it('maps direction to a sign', () => {
    expect(directionSign('in')).toBe('+');
    expect(directionSign('out')).toBe('-');
    expect(directionSign('neutral')).toBe('↔');
  });
});

describe('account role labels', () => {
  it('counterAccountLabel describes the counter account per type', () => {
    expect(counterAccountLabel('cash_in')).toBe('Kategori Pendapatan');
    expect(counterAccountLabel('cash_out')).toBe('Kategori Beban');
    expect(counterAccountLabel('transfer')).toBe('Akun Tujuan');
    expect(counterAccountLabel('owner_deposit')).toBe('Modal Pemilik');
    expect(counterAccountLabel('owner_withdrawal')).toBe('Pengambilan Pemilik');
  });

  it('cashAccountLabel describes the cash/bank account per type', () => {
    expect(cashAccountLabel('cash_in')).toBe('Akun Kas/Bank Tujuan');
    expect(cashAccountLabel('cash_out')).toBe('Akun Kas/Bank Sumber');
    expect(cashAccountLabel('transfer')).toBe('Akun Sumber');
    expect(cashAccountLabel('owner_deposit')).toBe('Akun Kas/Bank Tujuan');
    expect(cashAccountLabel('owner_withdrawal')).toBe('Akun Kas/Bank Sumber');
  });
});

describe('status registry', () => {
  it('returns posted and voided status definitions', () => {
    expect(getStatus('transactions', 'posted').label).toBe('Posted');
    expect(getStatus('transactions', 'voided').label).toBe('Dibatalkan');
    expect(getStatus('transactions', 'posted').variant).toBe('success');
    expect(getStatus('transactions', 'voided').variant).toBe('error');
  });

  it('falls back to the raw status for unknown values', () => {
    const status = getStatus('transactions', 'weird');
    expect(status.label).toBe('weird');
    expect(status.variant).toBe('neutral');
  });
});