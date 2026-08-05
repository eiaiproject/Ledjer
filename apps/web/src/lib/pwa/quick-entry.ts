// P4.3 Quick Transaction Entry
// Supports PWA shortcuts and quick transaction templates.

export interface QuickEntryTemplate {
  id: string;
  name: string;
  description: string;
  type: 'expense' | 'income' | 'transfer';
  defaultAmount?: number;
  defaultAccountId?: string;
  icon?: string;
  color?: string;
}

const template = (
  id: string,
  name: string,
  description: string,
  type: QuickEntryTemplate['type'],
  icon: string,
  color: string,
): QuickEntryTemplate => ({ id, name, description, type, icon, color });

const DEFAULT_TEMPLATES: QuickEntryTemplate[] = [
  template('quick-expense', 'Catat Biaya', 'Biaya operasional harian', 'expense', 'receipt', '#E8A87C'),
  template('quick-income', 'Catat Pendapatan', 'Pendapatan penjualan', 'income', 'trending-up', '#85C7A0'),
  template('quick-transfer', 'Transfer Kas', 'Pindahkan antar akun', 'transfer', 'arrows-h', '#7BA7D6'),
  template('quick-expense-rent', 'Bayar Sewa', 'Biaya sewa bulanan', 'expense', 'building', '#C9A97C'),
  template('quick-expense-electricity', 'Bayar Listrik', 'Biaya listrik bulanan', 'expense', 'lightbulb', '#E8C84C'),
];

export function getDefaultTemplates(): QuickEntryTemplate[] {
  return DEFAULT_TEMPLATES;
}

/**
 * Pre-fill a new transaction URL based on a template.
 */
export function getQuickEntryUrl(template: QuickEntryTemplate): string {
  const params = new URLSearchParams();
  params.set('type', template.type);
  if (template.defaultAmount) {
    params.set('amount', String(template.defaultAmount));
  }
  if (template.defaultAccountId) {
    params.set('accountId', template.defaultAccountId);
  }
  params.set('quick', 'true');
  return `/transactions/new?${params.toString()}`;
}
