import { apiRequest } from "./client";

export interface InvoiceLines {
  productId?: string;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface CreateInvoiceInput {
  invoiceDate: string;
  dueDate: string;
  partyId: string;
  lines: InvoiceLines[];
  discountMinor?: number;
  taxMinor?: number;
  notes?: string;
  terms?: string;
}

export interface InvoiceOutput {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  partyId: string;
  partyName?: string;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  notes?: string;
  terms?: string;
  lines: Array<InvoiceLines & { lineNumber: number }>;
  creditedByInvoiceId?: string;
  createdAt: number;
}

export interface InvoiceListResult {
  invoices: InvoiceOutput[];
  total: number;
}

export function createInvoice(input: CreateInvoiceInput): Promise<InvoiceOutput> {
  return apiRequest<InvoiceOutput>("/api/invoices", { method: "POST", body: JSON.stringify(input) });
}

export function listInvoices(limit = 50, offset = 0): Promise<InvoiceListResult> {
  return apiRequest<InvoiceListResult>(`/api/invoices?limit=${limit}&offset=${offset}`);
}

export function getInvoice(id: string): Promise<InvoiceOutput> {
  return apiRequest<InvoiceOutput>(`/api/invoices/${id}`);
}

export function updateInvoiceStatus(id: string, status: string, reason?: string): Promise<InvoiceOutput> {
  return apiRequest<InvoiceOutput>(`/api/invoices/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}

export function createCreditNote(
  invoiceId: string,
  input: {
    lines: { description: string; quantityMilli?: number; unitPriceMinor: number; amountMinor: number }[];
    discountMinor?: number; taxMinor?: number; notes?: string; reason?: string;
  },
): Promise<InvoiceOutput> {
  return apiRequest<InvoiceOutput>(`/api/invoices/${invoiceId}/credit-note`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCreditNotes(invoiceId: string): Promise<InvoiceOutput[]> {
  return apiRequest<InvoiceOutput[]>(`/api/invoices/${invoiceId}/credit-notes`);
}

export function sendInvoiceEmail(invoiceId: string, to: string): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(`/api/invoices/${invoiceId}/send-email`, {
    method: "POST",
    body: JSON.stringify({ to }),
  });
}

export function printInvoiceUrl(invoiceId: string): string {
  return `/api/invoices/${invoiceId}/print`;
}
