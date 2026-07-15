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

  it.each([
    {
      name: 'cash_sale: debit cash, credit revenue',
      input: { transactionType: 'cash_sale' as const },
      expectedDebit: [{ account: '1110 - Kas', amount: 1000000, direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: 'Pendapatan Usaha', amount: 1000000, direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'credit_sale unpaid: debit receivable, credit revenue',
      input: { transactionType: 'credit_sale' as const, paymentStatus: 'unpaid' },
      expectedDebit: [{ account: 'Piutang Usaha', amount: 1000000 }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: 'Pendapatan Usaha' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'cash_purchase: debit expense, credit cash',
      input: { transactionType: 'cash_purchase' as const },
      expectedDebit: [{ account: 'Sewa', direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: '1110 - Kas', direction: 'decrease' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'pay_payable: debit payable, credit cash',
      input: { transactionType: 'pay_payable' as const },
      expectedDebit: [{ account: 'Utang Usaha', direction: 'decrease' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: '1110 - Kas', direction: 'decrease' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'owner_capital: debit cash, credit modal',
      input: { transactionType: 'owner_capital' as const },
      expectedDebit: [{ account: '1110 - Kas', direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: 'Modal Pemilik', direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'owner_draw: debit prive, credit cash',
      input: { transactionType: 'owner_draw' as const },
      expectedDebit: [{ account: 'Prive Pemilik', direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: '1110 - Kas', direction: 'decrease' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'cash_transfer: debit destination, credit source',
      input: { transactionType: 'cash_transfer' as const },
      expectedDebit: [{ account: '1120 - Bank BCA' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: '1110 - Kas' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'expense_payment: debit expense, credit cash',
      input: { transactionType: 'expense_payment' as const },
      expectedDebit: [{ account: 'Sewa', direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: '1110 - Kas', direction: 'decrease' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'receive_receivable: debit cash, credit receivable',
      input: { transactionType: 'receive_receivable' as const },
      expectedDebit: [{ account: '1110 - Kas', direction: 'increase' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: 'Piutang Usaha', direction: 'decrease' }] as { account: string; amount?: number; direction?: string }[],
    },
    {
      name: 'credit_purchase unpaid: debit expense, credit payable',
      input: { transactionType: 'credit_purchase' as const, paymentStatus: 'unpaid' },
      expectedDebit: [{ account: 'Sewa' }] as { account: string; amount?: number; direction?: string }[],
      expectedCredit: [{ account: 'Utang Usaha' }] as { account: string; amount?: number; direction?: string }[],
    },
  ])('$name', ({ input, expectedDebit, expectedCredit }) => {
    const result = buildPreview({ ...baseArgs, ...input });
    expectedDebit.forEach((exp, i) => {
      expect(result.debit[i].account).toBe(exp.account);
      if (exp.amount !== undefined) expect(result.debit[i].amount).toBe(exp.amount);
      if (exp.direction) expect(result.debit[i].direction).toBe(exp.direction);
    });
    expectedCredit.forEach((exp, i) => {
      expect(result.credit[i].account).toBe(exp.account);
      if (exp.amount !== undefined) expect(result.credit[i].amount).toBe(exp.amount);
      if (exp.direction) expect(result.credit[i].direction).toBe(exp.direction);
    });
  });

  it('credit_sale partial: split debit into cash + receivable', () => {
    const result = buildPreview({ ...baseArgs, transactionType: 'credit_sale', paymentStatus: 'partial', partialAmount: 600000 });
    expect(result.debit).toHaveLength(2);
    expect(result.debit[0].account).toBe('1110 - Kas');
    expect(result.debit[0].amount).toBe(600000);
    expect(result.debit[1].account).toBe('Piutang Usaha');
    expect(result.debit[1].amount).toBe(400000);
    expect(result.credit).toHaveLength(1);
    expect(result.credit[0].amount).toBe(1000000);
  });

  it('credit_purchase partial: split credit into cash + payable', () => {
    const result = buildPreview({ ...baseArgs, transactionType: 'credit_purchase', paymentStatus: 'partial', partialAmount: 500000 });
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
