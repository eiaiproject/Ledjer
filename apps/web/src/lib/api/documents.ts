import { apiRequest } from "./client";

export type DocumentType =
  | "quotation"
  | "purchase_order"
  | "delivery_note"
  | "payment_receipt"
  | "cash_receipt"
  | "cash_payment_voucher"
  | "return_note";

export interface DocumentLine {
  productId?: string;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface CreateDocumentInput {
  documentType: DocumentType;
  documentDate: string;
  partyId?: string;
  lines: DocumentLine[];
  discountMinor?: number;
  taxMinor?: number;
  notes?: string;
  terms?: string;
  deliveryDate?: string;
  paymentMethod?: string;
  paymentReference?: string;
}

export interface DocumentOutput {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  documentDate: string;
  partyId: string | null;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: (DocumentLine & { id: string; lineOrder: number })[];
  notes: string | null;
  terms: string | null;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  deliveryDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  voidReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentListResult {
  documents: DocumentOutput[];
  total: number;
}

export function createDocument(input: CreateDocumentInput): Promise<DocumentOutput> {
  return apiRequest<DocumentOutput>("/api/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listDocuments(
  type?: DocumentType,
  limit = 50,
  offset = 0,
): Promise<DocumentListResult> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (type) params.set("type", type);
  return apiRequest<DocumentListResult>(`/api/documents?${params}`);
}

export function getDocument(id: string): Promise<DocumentOutput> {
  return apiRequest<DocumentOutput>(`/api/documents/${id}`);
}

export function updateDocumentStatus(
  id: string,
  status: string,
  reason?: string,
): Promise<DocumentOutput> {
  return apiRequest<DocumentOutput>(`/api/documents/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}

export function convertQuotationToInvoice(quotationId: string): Promise<{ quotationId: string; invoiceId: string }> {
  return apiRequest<{ quotationId: string; invoiceId: string }>(
    `/api/documents/${quotationId}/convert-to-invoice`,
    { method: "POST" },
  );
}

export function receivePurchaseOrder(purchaseOrderId: string): Promise<{ purchaseOrderId: string; deliveryNoteId: string }> {
  return apiRequest<{ purchaseOrderId: string; deliveryNoteId: string }>(
    `/api/documents/${purchaseOrderId}/receive`,
    { method: "POST" },
  );
}

export function printDocumentUrl(documentId: string): string {
  return `/api/documents/${documentId}/print`;
}
