# P1.2 - Opening Balance Wizard API

## GET /api/opening-balance/status
Check if opening balances have been posted.

**Auth:** session cookie (single-user book; any authenticated user owns their book)

**Response:** `{ posted: boolean, postedAt: string | null }`

---

## POST /api/opening-balance/preview
Preview opening balance entries (validates debit = credit).

**Body:** `{ lines: { accountId: string, debitMinor: number, creditMinor: number }[] }`

**Auth:** session cookie (single-user book; any authenticated user owns their book)

**Response:** `{ balanced: boolean, totalDebit: number, totalCredit: number, lineCount: number }`

---

## POST /api/opening-balance/post
Post opening balance journal entries.

**Body:** `{ lines: { accountId: string, debitMinor: number, creditMinor: number }[] }`

**Auth:** session cookie (single-user book; any authenticated user owns their book)

**Response:** `{ success: boolean, transactionId: string, entryCount: number }`

**Idempotent:** Uses an `opening-balance` idempotency key scoped to the user's book.
**Prevents duplicate posting:** Rejects if opening entries already exist.
**Audit:** Logged with action `opening_balance_post`.
