# P1.4 — Receivables & Payables API

## POST /api/receivables/pay
Record payment against an invoice.

**Body:**
```json
{
  "invoiceId": "string",
  "amount": 500000,
  "paymentDate": "2026-01-20",
  "cashAccountId": "string",
  "idempotencyKey": "string (min 8 chars)"
}
```

**Permissions:** `transactions:create`

**Response:** `{ allocationId, invoiceId, amountAllocated, remaining, invoiceStatus }`

**Rules:**
- No overpayment: `amount <= invoice.total - previous allocations`
- Auto-updates invoice: `paid` when fully settled, `partial` otherwise.

---

## GET /api/receivables/aging
Aging report for receivables.

**Query params:** `asOfDate` (default: today)

**Permissions:** `reports:read`

**Response:**
```json
{
  "bands": {
    "current": { "total": 0, "parties": [] },
    "1-30": { "total": 0, "parties": [] },
    "31-60": { "total": 0, "parties": [] },
    "61-90": { "total": 0, "parties": [] },
    "90+": { "total": 0, "parties": [] }
  },
  "grandTotal": 0
}
```

---

## GET /api/receivables/statement/:partyId
Party statement (all invoices + payments).

**Permissions:** `reports:read`

**Response:** `{ party, invoices: InvoiceWithAllocations[], outstandingBalance }`
