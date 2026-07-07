/**
 * Transaction seed helpers for E2E tests using Cloudflare Worker API.
 * No Supabase dependency — all posting goes through /api/transactions/*.
 */

import { E2E } from "./env";

export interface TestTransaction {
  id: string;
  transactionNumber: string;
  transactionType: string;
  amount: number;
  status: string;
  paymentStatus: string;
}

/**
 * Post a transaction via Worker API.
 * Uses the Worker's transaction intent interface.
 */
export async function seedTransaction(
  sessionToken: string,
  params: {
    transactionType?: string;
    amount?: number;
    description?: string;
    transactionDate?: string;
    paymentStatus?: string;
    cashAccountId?: string;
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    idempotencyKey?: string;
  } = {},
): Promise<string> {
  const idempotencyKey = params.idempotencyKey || `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const res = await fetch(`${E2E.baseUrl}/api/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `ledjer_session=${sessionToken}`,
    },
    body: JSON.stringify({
      transactionDate: params.transactionDate || new Date().toISOString().split("T")[0],
      transactionType: params.transactionType || "cash_sale",
      amount: params.amount || 50000,
      description: params.description || "[E2E] Test transaction",
      paymentStatus: params.paymentStatus || "paid",
      cashAccountId: params.cashAccountId,
      productId: params.productId,
      quantity: params.quantity,
      unitPrice: params.unitPrice,
      idempotencyKey,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to post transaction: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.transaction_id || data.transactionId || data.id;
}

/**
 * Fetch transactions for an org via Worker API.
 */
export async function getOrgTransactions(
  sessionToken: string,
): Promise<TestTransaction[]> {
  const res = await fetch(`${E2E.baseUrl}/api/transactions`, {
    headers: { Cookie: `ledjer_session=${sessionToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  const data = await res.json();
  return data.transactions || data || [];
}

/**
 * Void a transaction via Worker API.
 */
export async function voidTransaction(
  sessionToken: string,
  transactionId: string,
  reason: string = "[E2E] Test void",
): Promise<string> {
  const idempotencyKey = `void-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const res = await fetch(
    `${E2E.baseUrl}/api/transactions/${transactionId}/void`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ledjer_session=${sessionToken}`,
      },
      body: JSON.stringify({ reason, idempotencyKey }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to void transaction: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.reversal_transaction_id || data.reversalTransactionId;
}
