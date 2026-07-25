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

const DEFAULT_TEMPLATES: QuickEntryTemplate[] = [
  {
    id: 'quick-expense',
    name: 'Catat Biaya',
    description: 'Biaya operasional harian',
    type: 'expense',
    icon: 'receipt',
    color: '#E8A87C',
  },
  {
    id: 'quick-income',
    name: 'Catat Pendapatan',
    description: 'Pendapatan penjualan',
    type: 'income',
    icon: 'trending-up',
    color: '#85C7A0',
  },
  {
    id: 'quick-transfer',
    name: 'Transfer Kas',
    description: 'Pindahkan antar akun',
    type: 'transfer',
    icon: 'arrows-h',
    color: '#7BA7D6',
  },
  {
    id: 'quick-expense-rent',
    name: 'Bayar Sewa',
    description: 'Biaya sewa bulanan',
    type: 'expense',
    icon: 'building',
    color: '#C9A97C',
  },
  {
    id: 'quick-expense-electricity',
    name: 'Bayar Listrik',
    description: 'Biaya listrik bulanan',
    type: 'expense',
    icon: 'lightbulb',
    color: '#E8C84C',
  },
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
