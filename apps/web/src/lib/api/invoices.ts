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
  notes?: string;
  terms?: string;
  lines: Array<InvoiceLines & { lineNumber: number }>;
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
