# P1.5 - Bank Reconciliation API

## POST /api/reconciliation/import-statement
Import bank statement CSV.

**Body:** `{ csv: string, bankAccountId: string, closingBalance: number, statementDate: string }`

**CSV columns:** `date,description,amount,reference`

**Permissions:** `transactions:create`

**Response:** `{ statementId, linesImported, closingBalance }`

---

## GET /api/reconciliation/:id/suggestions
Get auto-matching suggestions.

**Permissions:** `reports:read`

**Response:**
```json
{
  "suggestions": [
    {
      "bankLineId": "string",
      "matchedTransactionId": "string | null",
      "confidence": "high|medium|low",
      "amountDiff": 0
    }
  ]
}
```

Matching: amount + date (±3 days).

---

## POST /api/reconciliation/:id/confirm
Confirm a match between bank line and transaction.

**Body:** `{ bankLineId: string, transactionId: string }`

**Permissions:** `transactions:create`

**Response:** `{ matchId, bankLineId, transactionId }`

---

## GET /api/reconciliation/:id/report
Reconciliation report.

**Permissions:** `reports:read`

**Response:**
```json
{
  "openingBalance": 0,
  "bankInflows": 0,
  "bankOutflows": 0,
  "closingBalance": 0,
  "matched": 0,
  "unmatchedBankItems": 0,
  "unmatchedBookEntries": 0
}
```

Proves: `opening + inflows - outflows = closingBalance`

---

## POST /api/reconciliation/:id/reopen
Reopen a completed reconciliation (for corrections).

**Permissions:** `transactions:void`
