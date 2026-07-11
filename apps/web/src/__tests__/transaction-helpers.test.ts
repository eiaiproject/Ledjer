import { describe, it, expect } from 'vitest';
import {
  buildPreview,
  generateAutoDescription,
  getSubmitLabel,
  getRecentTransactionTypes,
  addRecentTransactionType,
  localDate,
} from '@/pages/transactions/_helpers';
import { PAYMENT_STATUS_LABELS } from '@/lib/transactions';

describe('buildPreview', () => {
  const baseArgs = {
    amount: 1000000,
    partialAmount: 0,
    paymentStatus: 'paid',
    cashAccountLabel: '1110 - Kas',
    destinationAccountLabel: '1120 - Bank BCA',
    categoryName: 'Sewa',
    productName: '',
  };

  it('cash_sale: debit cash, credit revenue', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'cash_sale',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('1110 - Kas');
    expect(result.debit[0].amount).toBe(1000000);
    expect(result.debit[0].direction).toBe('increase');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('Pendapatan Usaha');
    expect(result.credit[0].amount).toBe(1000000);
    expect(result.credit[0].direction).toBe('increase');
  });

  it('credit_sale unpaid: debit receivable, credit revenue', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'credit_sale',
      paymentStatus: 'unpaid',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('Piutang Usaha');
    expect(result.debit[0].amount).toBe(1000000);

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('Pendapatan Usaha');
  });

  it('credit_sale partial: split debit into cash + receivable', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'credit_sale',
      paymentStatus: 'partial',
      partialAmount: 600000,
    });

    expect(result.debit).toHaveLength(2);
    expect(result.debit[0].account).toBe('1110 - Kas');
    expect(result.debit[0].amount).toBe(600000);
    expect(result.debit[1].account).toBe('Piutang Usaha');
    expect(result.debit[1].amount).toBe(400000);

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].amount).toBe(1000000);
  });

  it('cash_purchase: debit expense, credit cash', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'cash_purchase',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('Sewa');
    expect(result.debit[0].direction).toBe('increase');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('1110 - Kas');
    expect(result.credit[0].direction).toBe('decrease');
  });

  it('pay_payable: debit payable, credit cash', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'pay_payable',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('Utang Usaha');
    expect(result.debit[0].direction).toBe('decrease');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('1110 - Kas');
    expect(result.credit[0].direction).toBe('decrease');
  });

  it('owner_capital: debit cash, credit modal', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'owner_capital',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('1110 - Kas');
    expect(result.debit[0].direction).toBe('increase');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('Modal Pemilik');
    expect(result.credit[0].direction).toBe('increase');
  });

  it('owner_draw: debit prive, credit cash', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'owner_draw',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('Prive Pemilik');
    expect(result.debit[0].direction).toBe('increase');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('1110 - Kas');
    expect(result.credit[0].direction).toBe('decrease');
  });

  it('cash_transfer: debit destination, credit source', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'cash_transfer',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('1120 - Bank BCA');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('1110 - Kas');
  });

  it('expense_payment: debit expense, credit cash', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'expense_payment',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('Sewa');
    expect(result.debit[0].direction).toBe('increase');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('1110 - Kas');
    expect(result.credit[0].direction).toBe('decrease');
  });

  it('receive_receivable: debit cash, credit receivable', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'receive_receivable',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('1110 - Kas');
    expect(result.debit[0].direction).toBe('increase');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('Piutang Usaha');
    expect(result.credit[0].direction).toBe('decrease');
  });

  it('credit_purchase unpaid: debit expense, credit payable', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'credit_purchase',
      paymentStatus: 'unpaid',
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].account).toBe('Sewa');

    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].account).toBe('Utang Usaha');
  });

  it('credit_purchase partial: split credit into cash + payable', () => {
    const result = buildPreview({
      ...baseArgs,
      transactionType: 'credit_purchase',
      paymentStatus: 'partial',
      partialAmount: 500000,
    });

    expect(result.debit).toHaveLength(1);
    expect(result.debit[0].amount).toBe(1000000);

    expect(result.credit).toHaveLength(2);
    expect(result.credit[0].account).toBe('1110 - Kas');
    expect(result.credit[0].amount).toBe(500000);
    expect(result.credit[1].account).toBe('Utang Usaha');
    expect(result.credit[1].amount).toBe(500000);
  });
});

describe('generateAutoDescription', () => {
  it('generates sale description with product and quantity', () => {
    const desc = generateAutoDescription({
      transactionType: 'cash_sale',
      productName: 'Kopi Susu',
      quantity: 5,
      totalAmount: 50000,
    });
    expect(desc).toBe('Penjualan Kopi Susu x5');
  });

  it('generates purchase description with product', () => {
    const desc = generateAutoDescription({
      transactionType: 'cash_purchase',
      productName: 'Gula',
      quantity: 10,
      totalAmount: 100000,
    });
    expect(desc).toBe('Pembelian Gula x10');
  });

  it('generates sale description without quantity', () => {
    const desc = generateAutoDescription({
      transactionType: 'credit_sale',
      productName: 'Kopi',
      totalAmount: 50000,
    });
    expect(desc).toBe('Penjualan Kopi');
  });

  it('generates fallback description without product', () => {
    const desc = generateAutoDescription({
      transactionType: 'cash_sale',
      totalAmount: 50000,
    });
    expect(desc).toContain('penjualan');
    expect(desc).toContain('50');
  });
});

describe('getSubmitLabel', () => {
  it('shows saving text when loading', () => {
    const label = getSubmitLabel({
      transactionType: 'cash_sale',
      amount: 100000,
      isEditing: false,
      loading: true,
      successId: null,
    });
    expect(label).toBe('Menyimpan...');
  });

  it('shows success text when saved', () => {
    const label = getSubmitLabel({
      transactionType: 'cash_sale',
      amount: 100000,
      isEditing: false,
      loading: false,
      successId: 'some-id',
    });
    expect(label).toBe('Transaksi Tersimpan');
  });

  it('shows sale label for cash_sale', () => {
    const label = getSubmitLabel({
      transactionType: 'cash_sale',
      amount: 100000,
      isEditing: false,
      loading: false,
      successId: null,
    });
    expect(label).toContain('Catat Penjualan');
    expect(label).toContain('100');
  });

  it('shows purchase label for cash_purchase', () => {
    const label = getSubmitLabel({
      transactionType: 'cash_purchase',
      amount: 50000,
      isEditing: false,
      loading: false,
      successId: null,
    });
    expect(label).toContain('Catat Pembelian');
  });

  it('shows labeled button for expense_payment', () => {
    const label = getSubmitLabel({
      transactionType: 'expense_payment',
      amount: 25000,
      isEditing: false,
      loading: false,
      successId: null,
    });
    expect(label).toContain('Catat Beban');
  });

  it('shows generic label when amount is 0', () => {
    const label = getSubmitLabel({
      transactionType: 'cash_sale',
      amount: 0,
      isEditing: false,
      loading: false,
      successId: null,
    });
    expect(label).toBe('Catat Penjualan');
  });
});

describe('localDate', () => {
  it('returns today by default', () => {
    const today = new Date();
    const dateStr = localDate();
    expect(dateStr).toContain(`${today.getFullYear()}`);
    expect(dateStr).toContain(`${today.getMonth() + 1}`);
    expect(dateStr).toContain(`${today.getDate()}`);
  });

  it('returns future date with positive offset', () => {
    const dateStr = localDate(7);
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    expect(dateStr).toContain(`${expected.getFullYear()}`);
  });
});

describe('Credit type payment status contract', () => {
  const creditBaseArgs = {
    amount: 1000000,
    partialAmount: 0,
    paymentStatus: 'paid',
    cashAccountLabel: '1110 - Kas',
    destinationAccountLabel: '1120 - Bank BCA',
    categoryName: 'Sewa',
    productName: '',
  };

  it('PAYMENT_STATUS_LABELS does not include a credit-specific "lunas" label', () => {
    // Per backend rule: paid credit_sale/credit_purchase is invalid;
    // fully paid transactions use cash_sale/cash_purchase.
    expect(PAYMENT_STATUS_LABELS.paid).toBe('Lunas');
    expect(PAYMENT_STATUS_LABELS.unpaid).toBe('Belum dibayar');
    expect(PAYMENT_STATUS_LABELS.partial).toBe('Sebagian dibayar');
  });

  it('buildPreview credit_sale paid is a defensive fallback (not offered by UI)', () => {
    // The UI PaymentStatusSelector only offers unpaid/partial.
    // This branch exists for legacy data safety.
    const result = buildPreview({
      ...creditBaseArgs,
      transactionType: 'credit_sale',
      paymentStatus: 'paid',
    });
    // When paid, debit goes to cash account (same as cash_sale)
    expect(result.debit[0].account).toBe('1110 - Kas');
    expect(result.debit[0].amount).toBe(1000000);
  });

  it('buildPreview credit_purchase paid is a defensive fallback', () => {
    const result = buildPreview({
      ...creditBaseArgs,
      transactionType: 'credit_purchase',
      paymentStatus: 'paid',
    });
    expect(result.credit[0].account).toBe('1110 - Kas');
    expect(result.credit[0].amount).toBe(1000000);
  });
});

describe('Recent Transaction Types', () => {
  it('returns empty array initially', () => {
    // Clear localStorage for test
    try {
      localStorage.removeItem('ledjer:recent-transaction-types');
    } catch {
      // Ignore
    }
    const recent = getRecentTransactionTypes();
    expect(Array.isArray(recent)).toBe(true);
  });

  it('adds transaction type to recent', () => {
    try {
      localStorage.removeItem('ledjer:recent-transaction-types');
    } catch {
      // Ignore
    }
    const result = addRecentTransactionType('cash_sale');
    expect(result).toContain('cash_sale');
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('does not duplicate recent types', () => {
    try {
      localStorage.removeItem('ledjer:recent-transaction-types');
    } catch {
      // Ignore
    }
    addRecentTransactionType('cash_sale');
    addRecentTransactionType('cash_sale');
    const recent = getRecentTransactionTypes();
    const cashSaleCount = recent.filter((t) => t === 'cash_sale').length;
    expect(cashSaleCount).toBe(1);
  });

  it('limits to 4 recent types', () => {
    try {
      localStorage.removeItem('ledjer:recent-transaction-types');
    } catch {
      // Ignore
    }
    addRecentTransactionType('cash_sale');
    addRecentTransactionType('credit_sale');
    addRecentTransactionType('cash_purchase');
    addRecentTransactionType('expense_payment');
    addRecentTransactionType('owner_capital');
    const recent = getRecentTransactionTypes();
    expect(recent.length).toBeLessThanOrEqual(4);
  });
});
