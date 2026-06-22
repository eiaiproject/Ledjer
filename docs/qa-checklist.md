# Ledjer — Manual QA Checklist

This checklist covers manual testing scenarios for Ledjer. Each scenario has an expected result that must be verified.

## Prerequisites

- Test environment with Supabase backend running
- Test user account (owner role)
- Test user account (staff role, if applicable)
- Browser: Chrome, Firefox, or Safari (latest)

---

## 1. Authentication & Onboarding

### 1.1 New User Signup
- [ ] Navigate to `/register`
- [ ] Enter valid email, password, full name
- [ ] Submit form
- [ ] **Expected:** Success message, redirect to login or email verification

### 1.2 Login
- [ ] Navigate to `/login`
- [ ] Enter valid credentials
- [ ] Submit form
- [ ] **Expected:** Redirect to `/dashboard` (if onboarding complete) or `/onboarding`

### 1.3 Onboarding Flow
- [ ] Complete onboarding form (business name, type, start date, cash account)
- [ ] Submit form
- [ ] **Expected:** Organization created, default accounts created, redirect to `/dashboard`

### 1.4 Onboarding Guard
- [ ] After signup, try to navigate to `/dashboard` directly
- [ ] **Expected:** Redirect to `/onboarding`
- [ ] Try to navigate to `/transactions` directly
- [ ] **Expected:** Redirect to `/onboarding`

---

## 2. Transactions

### 2.1 Create Cash Sale
- [ ] Navigate to `/transactions/new`
- [ ] Select "Penjualan Tunai"
- [ ] Fill amount, description, cash account
- [ ] Submit
- [ ] **Expected:** Transaction created, redirect to detail page

### 2.2 Create Credit Sale
- [ ] Select "Penjualan Kredit"
- [ ] Fill party, amount, description
- [ ] Set payment status to "Belum dibayar"
- [ ] Submit
- [ ] **Expected:** Transaction created with receivable

### 2.3 Receive Receivable Payment
- [ ] Select "Terima Piutang"
- [ ] Select party, fill amount, cash account
- [ ] Submit
- [ ] **Expected:** Receivable decreases, cash increases

### 2.4 Create Cash Purchase
- [ ] Select "Pembelian Tunai"
- [ ] Fill amount, description, cash account
- [ ] Submit
- [ ] **Expected:** Transaction created, expense/inventory recorded

### 2.5 Create Credit Purchase
- [ ] Select "Pembelian Kredit"
- [ ] Fill party, amount, description
- [ ] Submit
- [ ] **Expected:** Transaction created with payable

### 2.6 Pay Payable
- [ ] Select "Bayar Utang"
- [ ] Select party, fill amount, cash account
- [ ] Submit
- [ ] **Expected:** Payable decreases, cash decreases

### 2.7 Create Expense
- [ ] Select "Bayar Beban"
- [ ] Fill amount, description, cash account, expense category
- [ ] Submit
- [ ] **Expected:** Transaction created, expense recorded

### 2.8 Owner Capital
- [ ] Select "Modal Pemilik"
- [ ] Fill amount, description, cash account
- [ ] Submit
- [ ] **Expected:** Equity increases, cash increases

### 2.9 Owner Draw
- [ ] Select "Penarikan Tunai"
- [ ] Fill amount, description, cash account
- [ ] Submit
- [ ] **Expected:** Equity decreases, cash decreases

### 2.10 Cash Transfer
- [ ] Select "Transfer Antar Rekening Bank"
- [ ] Fill amount, source account, destination account, description
- [ ] Submit
- [ ] **Expected:** Balance shifts between accounts

### 2.11 Simple Adjustment (Owner Only)
- [ ] Login as owner
- [ ] Select "Penyesuaian"
- [ ] Fill amount, debit account, credit account, description
- [ ] Submit
- [ ] **Expected:** Journal entry created with specified accounts

### 2.12 Staff Cannot Create Adjustment
- [ ] Login as staff (without special permissions)
- [ ] Try to select "Penyesuaian"
- [ ] **Expected:** Option not available or error on submit

---

## 3. Products & Inventory

### 3.1 Create Product
- [ ] Navigate to `/products`
- [ ] Click "Tambah Produk"
- [ ] Fill name, unit, purchase price, selling price
- [ ] Submit
- [ ] **Expected:** Product created

### 3.2 Purchase Product
- [ ] Create cash purchase with product
- [ ] Fill quantity, unit price
- [ ] Submit
- [ ] **Expected:** Stock increases, inventory account debited

### 3.3 Sell Product
- [ ] Create cash sale with product
- [ ] Fill quantity, unit price
- [ ] Submit
- [ ] **Expected:** Stock decreases, COGS journal created, revenue recorded

### 3.4 Product Sale Without COGS Account
- [ ] Remove COGS account (code 5100) from organization
- [ ] Try to sell a product
- [ ] **Expected:** Error message about missing COGS account

---

## 4. Void Transaction

### 4.1 Void Posted Transaction
- [ ] Navigate to transaction detail
- [ ] Click "Batalkan Transaksi"
- [ ] Enter reason (minimum 5 characters)
- [ ] Confirm
- [ ] **Expected:** Transaction voided, reversal journal created

### 4.2 Void Reversal Journal Balanced
- [ ] After voiding, check journal entries
- [ ] **Expected:** Reversal journal has equal debit and credit

---

## 5. Reports

### 5.1 Dashboard
- [ ] Navigate to `/dashboard`
- [ ] **Expected:** Cash balance, receivables, payables, revenue, expenses displayed correctly

### 5.2 General Ledger
- [ ] Navigate to `/reports/general-ledger`
- [ ] Select date range
- [ ] **Expected:** All posted transactions shown with correct balances

### 5.3 Trial Balance
- [ ] Navigate to `/reports/trial-balance`
- [ ] Select date
- [ ] **Expected:** Total debits = Total credits

### 5.4 Income Statement
- [ ] Navigate to `/reports/profit-loss`
- [ ] Select date range
- [ ] **Expected:** Revenue - Expenses = Net Income

### 5.5 Balance Sheet
- [ ] Navigate to `/reports/balance-sheet`
- [ ] Select as-of date
- [ ] **Expected:** Assets = Liabilities + Equity

### 5.6 Balance Sheet Date Filtering
- [ ] Create a transaction dated tomorrow
- [ ] View balance sheet as of today
- [ ] **Expected:** Tomorrow's transaction NOT included

---

## 6. Permissions

### 6.1 Staff Without Report Permission
- [ ] Login as staff without `can_view_reports`
- [ ] Navigate to `/reports/balance-sheet`
- [ ] **Expected:** "Tidak memiliki izin" message

### 6.2 Staff Can View Transaction Detail
- [ ] Login as staff with `can_create_transaction`
- [ ] Navigate to transaction detail
- [ ] **Expected:** Business details visible (amount, date, description)
- [ ] Journal lines section: **Expected:** Hidden or restricted

### 6.3 Staff Cannot Void Transaction
- [ ] Login as staff without `can_void_transaction`
- [ ] Navigate to transaction detail
- [ ] **Expected:** "Batalkan Transaksi" button not visible

---

## 7. Plan Limits

### 7.1 Free Plan Transaction Limit
- [ ] Switch to free plan (or use test org)
- [ ] Create 50 transactions
- [ ] Try to create 51st transaction
- [ ] **Expected:** Error about plan limit

### 7.2 Upgrade Plan
- [ ] Navigate to `/settings/billing`
- [ ] Upgrade to Business plan
- [ ] **Expected:** Transaction limit removed

---

## 8. Search & Filters

### 8.1 Transaction Search
- [ ] Navigate to `/transactions`
- [ ] Search for a transaction description
- [ ] **Expected:** Matching transactions shown

### 8.2 Search with Special Characters
- [ ] Search for text with quotes, commas, percent signs
- [ ] **Expected:** No errors, results filtered correctly

### 8.3 Date Range Filter
- [ ] Set date range filter
- [ ] **Expected:** Only transactions within range shown

### 8.4 Type Filter
- [ ] Filter by transaction type
- [ ] **Expected:** Only matching types shown

---

## 9. Edge Cases

### 9.1 Concurrent Transactions
- [ ] Open two browser tabs
- [ ] Create transactions simultaneously
- [ ] **Expected:** Both succeed, no duplicate transaction numbers

### 9.2 Large Amount
- [ ] Create transaction with amount 999,999,999,999
- [ ] **Expected:** Handled correctly (no overflow)

### 9.3 Zero Amount
- [ ] Try to create transaction with amount 0
- [ ] **Expected:** Error "Nominal harus lebih dari 0"

### 9.4 Future Date
- [ ] Create transaction with future date
- [ ] **Expected:** Allowed (if after books_start_date)

### 9.5 Date Before Books Start
- [ ] Try to create transaction before books_start_date
- [ ] **Expected:** Error about date being before start date

---

## 10. Mobile Responsiveness

### 10.1 Mobile Navigation
- [ ] Open on mobile viewport (375px width)
- [ ] Tap hamburger menu
- [ ] **Expected:** Sidebar opens, navigation works

### 10.2 Mobile Transaction Form
- [ ] Create transaction on mobile
- [ ] **Expected:** All fields accessible, form submits correctly

### 10.3 Mobile Reports
- [ ] View reports on mobile
- [ ] **Expected:** Tables scroll horizontally, data readable

---

## 11. Error Handling

### 11.1 Network Error
- [ ] Disconnect network
- [ ] Try to create transaction
- [ ] **Expected:** Graceful error message

### 11.2 Invalid Data
- [ ] Submit form with missing required fields
- [ ] **Expected:** Validation errors shown inline

### 11.3 Server Error
- [ ] (If possible) Trigger server error
- [ ] **Expected:** User-friendly error message, not raw error
