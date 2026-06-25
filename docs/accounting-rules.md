# Ledjer — Accounting Rules Reference

This document describes every transaction type supported by Ledjer, including the journal entries created, accounts affected, and restrictions.

## MVP Scope Notice: Party-level AR/AP

Receivables (`Piutang Usaha`, code 1200) and payables (`Utang Usaha`, code 2100) are tracked at the **party** level, not the **invoice** level. This means:

- A `credit_sale` adds the full amount to the party's receivable balance.
- A `receive_receivable` reduces that party's receivable balance by the amount received.
- The system does NOT track which invoice each payment is applied against.

**Implication:** It is technically possible to receive more than the outstanding receivable (or pay more than the outstanding payable) for a given party, which produces a negative receivable/payable balance for that party. This is permitted in the MVP but flagged in the UI as a warning. Full invoice-level settlement is not in the MVP scope.

If you need invoice-level tracking, file a feature request — adding it requires:
- An `invoices` table with `(id, organization_id, party_id, transaction_id, amount, due_date)`.
- An `invoice_allocations` table mapping each `receive_receivable` / `pay_payable` to one or more invoices.
- New RPCs `apply_receivable_to_invoice(...)` / `apply_payable_to_invoice(...)` that update allocation rows.
- Updated reports showing per-invoice aging.


## Table of Contents

1. [Cash Sale](#1-cash-sale)
2. [Credit Sale](#2-credit-sale)
3. [Receive Receivable Payment](#3-receive-receivable-payment)
4. [Cash Purchase](#4-cash-purchase)
5. [Credit Purchase](#5-credit-purchase)
6. [Pay Payable](#6-pay-payable)
7. [Expense Payment](#7-expense-payment)
8. [Owner Capital](#8-owner-capital)
9. [Owner Draw](#9-owner-draw)
10. [Cash Transfer](#10-cash-transfer)
11. [Simple Adjustment](#11-simple-adjustment)
12. [Opening Balances](#12-opening-balances)
13. [Inventory Cost Policy](#13-inventory-cost-policy)

---

## 1. Cash Sale

**User-facing meaning:** Record a sale that is paid immediately (cash/tunai).

**Required fields:**
- Transaction date
- Amount
- Cash/bank account
- Description
- Revenue category (optional)

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Cash/Bank (1110/1120) | Amount | |
| Revenue (4100+) | | Amount |

**Product sale (with product_id):**
- Revenue journal as above
- Additional COGS journal:
  - Debit: COGS (5100)
  - Credit: Inventory (1300)
- Stock movement: `sale` with negative quantity

**Effect on reports:**
- Increases cash balance
- Increases revenue
- Decreases inventory (if product)
- Increases COGS (if product)

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 2. Credit Sale

**User-facing meaning:** Record a sale where the customer will pay later (piutang/receivable).

**Required fields:**
- Transaction date
- Amount
- Party (customer)
- Description
- Payment status: `unpaid` or `partial`
- Due date (if unpaid)

**Journal entries (unpaid):**
| Account | Debit | Credit |
|---------|-------|--------|
| Piutang Usaha (1200) | Amount | |
| Revenue (4100+) | | Amount |

**Journal entries (partial payment):**
| Account | Debit | Credit |
|---------|-------|--------|
| Cash/Bank (1110/1120) | partial_amount | |
| Piutang Usaha (1200) | remaining | |
| Revenue (4100+) | | Amount |

**Effect on reports:**
- Increases receivables (if unpaid/partial)
- Increases revenue
- Increases cash (if partial payment)

**Can be voided:** Yes (except partial payments — must be settled first)

**Permissions:** `can_create_transaction`

---

## 3. Receive Receivable Payment

**User-facing meaning:** Record receipt of payment from a customer for an outstanding receivable.

**Required fields:**
- Transaction date
- Amount
- Party (customer)
- Cash/bank account
- Description

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Cash/Bank (1110/1120) | Amount | |
| Piutang Usaha (1200) | | Amount |

**Effect on reports:**
- Increases cash balance
- Decreases receivables

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 4. Cash Purchase

**User-facing meaning:** Record a purchase that is paid immediately.

**Required fields:**
- Transaction date
- Amount
- Cash/bank account
- Description
- Product (optional)
- Expense/COGS account (if no product)

**Journal entries (without product):**
| Account | Debit | Credit |
|---------|-------|--------|
| Expense/COGS/Asset (5100+/6xxx) | Amount | |
| Cash/Bank (1110/1120) | | Amount |

**Journal entries (with product):**
| Account | Debit | Credit |
|---------|-------|--------|
| Persediaan (1300) | Amount | |
| Cash/Bank (1110/1120) | | Amount |

**Effect on reports:**
- Decreases cash balance
- Increases expense/inventory

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 5. Credit Purchase

**User-facing meaning:** Record a purchase that will be paid later (utang/payable).

**Required fields:**
- Transaction date
- Amount
- Party (supplier)
- Description
- Payment status: `unpaid` or `partial`
- Due date (if unpaid)

**Journal entries (unpaid):**
| Account | Debit | Credit |
|---------|-------|--------|
| Persediaan/Expense (1300/5100+) | Amount | |
| Utang Usaha (2100) | | Amount |

**Journal entries (partial payment):**
| Account | Debit | Credit |
|---------|-------|--------|
| Persediaan/Expense (1300/5100+) | Amount | |
| Cash/Bank (1110/1120) | | partial_amount |
| Utang Usaha (2100) | | remaining |

**Effect on reports:**
- Increases payables (if unpaid/partial)
- Increases expense/inventory
- Decreases cash (if partial payment)

**Can be voided:** Yes (except partial payments — must be settled first)

**Permissions:** `can_create_transaction`

---

## 6. Pay Payable

**User-facing meaning:** Record payment to a supplier for an outstanding payable.

**Required fields:**
- Transaction date
- Amount
- Party (supplier)
- Cash/bank account
- Description

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Utang Usaha (2100) | Amount | |
| Cash/Bank (1110/1120) | | Amount |

**Effect on reports:**
- Decreases payables
- Decreases cash balance

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 7. Expense Payment

**User-facing meaning:** Record an operating expense payment.

**Required fields:**
- Transaction date
- Amount
- Cash/bank account
- Description
- Expense account (optional, defaults to Beban Lain-lain 6190)

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Expense (6xxx) | Amount | |
| Cash/Bank (1110/1120) | | Amount |

**Effect on reports:**
- Decreases cash balance
- Increases expenses

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 8. Owner Capital

**User-facing meaning:** Record capital injection from the business owner.

**Required fields:**
- Transaction date
- Amount
- Cash/bank account
- Description

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Cash/Bank (1110/1120) | Amount | |
| Modal Pemilik (3100) | | Amount |

**Effect on reports:**
- Increases cash balance
- Increases equity

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 9. Owner Draw

**User-facing meaning:** Record owner withdrawal from the business.

**Required fields:**
- Transaction date
- Amount
- Cash/bank account
- Description

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Prive (3300) | Amount | |
| Cash/Bank (1110/1120) | | Amount |

**Effect on reports:**
- Decreases cash balance
- Decreases equity (via contra-equity)

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 10. Cash Transfer

**User-facing meaning:** Transfer funds between cash/bank accounts.

**Required fields:**
- Transaction date
- Amount
- Source cash/bank account
- Destination cash/bank account
- Description

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Destination Cash/Bank | Amount | |
| Source Cash/Bank | | Amount |

**Effect on reports:**
- No net change in total cash
- Shifts balance between accounts

**Can be voided:** Yes

**Permissions:** `can_create_transaction`

---

## 11. Simple Adjustment

**User-facing meaning:** Manual journal adjustment between any two accounts.

**Required fields:**
- Transaction date
- Amount
- Debit account
- Credit account
- Description

**Journal entries:**
| Account | Debit | Credit |
|---------|-------|--------|
| Debit Account | Amount | |
| Credit Account | | Amount |

**Restrictions:**
- Owner only (staff cannot create)
- Debit and credit accounts must be different
- Both accounts must be active and belong to the same organization

**Effect on reports:** Depends on accounts used

**Can be voided:** Yes

**Permissions:** Owner only

---

## 12. Opening Balances

**User-facing meaning:** Set initial balances for accounts during business setup.

**Transaction types:**
- `opening_cash_balance`: Debit Cash/Bank, Credit Saldo Awal
- `opening_receivable_balance`: Debit Piutang Usaha, Credit Saldo Awal
- `opening_payable_balance`: Debit Saldo Awal, Credit Utang Usaha

**Important:** Opening balances cannot be posted through the general `post_transaction` function. They must be created through:
1. The onboarding flow (`create_organization_with_opening_balances`)
2. The dedicated `post_opening_balance` RPC

**Effect on reports:**
- Sets initial account balances
- Appears in equity section as "Saldo Awal" (3200)

**Can be voided:** No (setup-only)

**Permissions:** `can_create_transaction` (through onboarding flow)

---

## 13. Inventory Cost Policy

Ledjer uses moving-average inventory cost. For product sales, the cost snapshot is the product's current `purchase_price` at posting time.

**Product sale COGS:**
- If the moving-average cost is greater than 0, Ledjer posts a separate COGS journal:
  - Debit: COGS (5100)
  - Credit: Inventory (1300)
- If the moving-average cost is 0, Ledjer does not post a zero-value COGS journal. The sale is allowed, the stock movement is still recorded, and the movement value is 0.

**Stock movement valuation:**
- Purchases record `unit_cost = unit_price`.
- Sales record `unit_cost = current moving-average cost`, including 0.
- Voiding a sale records a reverse stock movement with the original sale movement's `unit_cost`.
- Voiding a purchase records a reverse stock movement with the original purchase cost and recalculates moving average cost.

**Invariant:** For a product lifecycle, the net Inventory GL movement for account 1300 must equal `SUM(stock_movements.quantity * stock_movements.unit_cost)` for the same product. This invariant must hold across buy, sell, and void sequences, including zero-cost sales where both sides have value 0.

---

## Journal Entry Types

| Type | Description |
|------|-------------|
| `normal` | Standard business transaction |
| `opening_balance` | Initial balance setup |
| `reversal` | Void/cancellation reversal |

## Payment Status

| Status | Description |
|--------|-------------|
| `paid` | Fully paid (cash transactions) |
| `unpaid` | Not yet paid (credit transactions) |
| `partial` | Partially paid (credit transactions) |

## Transaction Numbering

Format: `TRX-YYYYMM-NNNNNN`
- `YYYY`: Year
- `MM`: Month
- `NNNNNN`: Sequential number (6 digits, zero-padded)

## Journal Entry Numbering

Format: `JE-NNNNNN`
- `NNNNNN`: Sequential number (6 digits, zero-padded)

## Void/Reversal Behavior

When a transaction is voided:
1. A reversal journal entry is created (debit/credit swapped)
2. A reversal transaction record is created
3. Original transaction status changes to `voided`
4. Original journal entry status changes to `voided`
5. Stock movements are reversed (if product-related)
6. Audit log entry is created
