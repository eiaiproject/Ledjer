# P1.7 — Cash-Flow Statement API

## GET /api/reports/cash-flow
Cash-flow statement (direct method).

**Query params:** `fromDate`, `toDate` (required, format YYYY-MM-DD)

**Permissions:** `reports:read`

**Response:**
```json
{
  "fromDate": "2026-01-01",
  "toDate": "2026-03-31",
  "openingCash": 5000000,
  "closingCash": 6200000,
  "operating": {
    "cashSales": 500000,
    "cashPurchases": -300000,
    "expensePayments": -100000,
    "receivableReceipts": 0,
    "payablePayments": 0,
    "netOperating": 100000
  },
  "financing": {
    "ownerCapital": 5000000,
    "ownerDraws": 0,
    "netFinancing": 5000000
  },
  "investing": {
    "netInvesting": 0
  },
  "netMovement": 1200000
}
```

**Method:** Direct — categorizes cash account movements by transaction type.

**Sections:**
- **Operating:** cash_sale, cash_purchase, expense_payment, receive_receivable, pay_payable
- **Financing:** owner_capital, owner_draw
- **Investing:** (placeholder, zero until asset sales implemented)

**Proof:** `closingCash = openingCash + netOperating + netFinancing + netInvesting`
