# P1.3 - Invoice & Billing API

## POST /api/invoices
Create invoice (draft).

**Body:**
```json
{
  "partyId": "string",
  "issueDate": "2026-01-15",
  "dueDate": "2026-02-14",
  "lines": [
    {
      "description": "string",
      "quantity": 1,
      "unitPrice": 100000,
      "productId": "string | null"
    }
  ],
  "notes": "string | null"
}
```

**Permissions:** `transactions:create`

**Response:** `{ invoiceId, invoiceNumber, status: "draft", totalAmount, dueDate }`

**Auto-numbering:** Format `INV-{YYYY}-{NNNNNN}`, sequential per org.

---

## GET /api/invoices
List invoices with optional filters.

**Query params:** `status`, `partyId`, `fromDate`, `toDate`, `limit`, `offset`

**Permissions:** `transactions:read`

**Response:** `{ invoices: Invoice[], total: number }`

---

## GET /api/invoices/:id
Get invoice by ID.

**Permissions:** `transactions:read`

**Response:** Single invoice with lines.

---

## PATCH /api/invoices/:id/status
Transition invoice status.

**Body:** `{ status: "issued" | "sent" | "paid" | "voided" | "credited" }`

**Permissions:** `transactions:create`

**Rules:**
- `draft → issued` (requires at least one line)
- `issued → sent`
- `sent → paid` (recorded via payment allocation)
- Any → `voided` (requires reason)
- Any → `credited` (creates credit note)
