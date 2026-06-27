# Beta Launch Checklist

Manual QA scenarios for controlled closed beta of Ledjer.

## Prerequisites

- Test environment with Supabase backend running
- Test user account (owner role)
- Test user account (staff role, if applicable)
- Browser: Chrome, Firefox, or Safari (latest)

## 1. Registration & Onboarding

- [ ] Navigate to `/register`
- [ ] Enter valid email, password, full name
- [ ] Submit form
- [ ] **Expected:** Success message, redirect to login
- [ ] Login with new account
- [ ] **Expected:** Redirect to `/onboarding`
- [ ] Complete onboarding form (business name, type, start date, cash account)
- [ ] **Expected:** Organization created, default accounts created, redirect to `/dashboard`

## 2. Login & Session

- [ ] Navigate to `/login`
- [ ] Enter valid credentials
- [ ] **Expected:** Redirect to `/dashboard`
- [ ] Close browser, reopen, navigate to `/dashboard`
- [ ] **Expected:** Still logged in (session persists)
- [ ] Click logout
- [ ] **Expected:** Redirect to `/login`, session cleared
- [ ] Try to access `/dashboard` after logout
- [ ] **Expected:** Redirect to `/login`

## 3. Password Reset

- [ ] Navigate to `/forgot-password`
- [ ] Enter registered email
- [ ] **Expected:** Success message (generic, no email enumeration)
- [ ] Check email for recovery link
- [ ] Click link, set new password
- [ ] **Expected:** Password updated, can login with new password

## 4. Transactions

- [ ] Create cash sale (`Penjualan Tunai`)
- [ ] **Expected:** Transaction created, appears in list
- [ ] Create credit sale (`Penjualan Kredit`)
- [ ] **Expected:** Receivable created
- [ ] Receive receivable (`Terima Piutang`)
- [ ] **Expected:** Cash increases, receivable decreases
- [ ] Create cash purchase (`Pembelian Tunai`)
- [ ] **Expected:** Transaction created, inventory updated if product
- [ ] Create credit purchase (`Pembelian Kredit`)
- [ ] **Expected:** Payable created
- [ ] Pay payable (`Bayar Utang`)
- [ ] **Expected:** Cash decreases, payable decreases
- [ ] Create expense (`Bayar Beban`)
- [ ] **Expected:** Expense recorded
- [ ] Create owner capital (`Modal Pemilik`)
- [ ] **Expected:** Equity increases, cash increases
- [ ] Create owner draw (`Penarikan Tunai`)
- [ ] **Expected:** Equity decreases, cash decreases
- [ ] Create cash transfer (`Transfer Antar Rekening`)
- [ ] **Expected:** Balance shifts between accounts
- [ ] Void a transaction
- [ ] **Expected:** Transaction voided, reversal journal created

## 5. Products & Inventory

- [ ] Create product with purchase price and selling price
- [ ] **Expected:** Product created
- [ ] Purchase product (cash purchase with product)
- [ ] **Expected:** Stock increases
- [ ] Sell product (cash sale with product)
- [ ] **Expected:** Stock decreases, COGS journal created

## 6. Reports

- [ ] View Dashboard
- [ ] **Expected:** Cash balance, receivables, payables, revenue, expenses displayed
- [ ] View General Ledger
- [ ] **Expected:** All posted transactions shown with correct balances
- [ ] View Trial Balance
- [ ] **Expected:** Total debits = Total credits
- [ ] View Profit & Loss
- [ ] **Expected:** Revenue - Expenses = Net Income
- [ ] View Balance Sheet
- [ ] **Expected:** Assets = Liabilities + Equity

## 7. CSV Exports

- [ ] Export transactions to CSV
- [ ] **Expected:** CSV file downloads with correct data
- [ ] Export accounts to CSV
- [ ] **Expected:** CSV file downloads
- [ ] Export trial balance to CSV
- [ ] **Expected:** CSV file downloads

## 8. Staff Invitation & Permissions

- [ ] Login as owner
- [ ] Navigate to `/settings/team`
- [ ] Invite staff member (email must have registered account)
- [ ] **Expected:** Invitation created, token generated
- [ ] Login as staff
- [ ] Accept invitation
- [ ] **Expected:** Added to organization
- [ ] Login as staff without `can_view_reports`
- [ ] Try to view reports
- [ ] **Expected:** Permission denied message
- [ ] Login as staff without `can_create_transaction`
- [ ] Try to create transaction
- [ ] **Expected:** Option not available or error

## 9. Mobile Layout

- [ ] Open on mobile viewport (375px width)
- [ ] Navigate through all pages
- [ ] **Expected:** All content readable, forms usable
- [ ] Create transaction on mobile
- [ ] **Expected:** Form submits correctly
- [ ] View reports on mobile
- [ ] **Expected:** Tables scroll horizontally, data readable

## 10. Error Handling

- [ ] Disconnect network
- [ ] Try to create transaction
- [ ] **Expected:** Graceful error message
- [ ] Submit form with missing required fields
- [ ] **Expected:** Validation errors shown inline
- [ ] Check browser console
- [ ] **Expected:** No fatal errors

## Known Limitations

### Payment
- **Self-serve payment not implemented.** Plan changes are done by operator via Supabase SQL Console.
- **No payment gateway integration.** Users cannot pay via Midtrans, Xendit, or other providers.

### Reports
- **Cash-flow report not implemented.** Only General Ledger, Trial Balance, Profit & Loss, and Balance Sheet available.
- **No PDF/Excel export.** CSV only.

### Invitations
- **Invitation email delivery not implemented.** Token is generated, but email sending requires SMTP configuration. Workaround: share invitation link manually.

### Features
- **No invoice-level AR/AP tracking.** Party-level only.
- **No automated closing entries.** Manual process at year-end.
- **No multi-currency.** IDR only.
- **No automated tax.** PPN/PPh calculations are manual.

### Operational
- **No WCAG 2.1 AA full audit.** Basic accessibility tested.
- **Legal pages not reviewed by lawyer.** Marked for review.
- **Backup restore not rehearsed.** Must verify before storing critical data.

## Feedback / Issue Intake

### GitHub Issue Template

When reporting issues during beta, include:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Screenshot / video** (if UI issue)
5. **Browser + OS version**
6. **Console errors** (if any)

### Quick Feedback

For quick feedback or questions:
- Email: support@ledjer.id
- WhatsApp: [number]
- GitHub Issues: https://github.com/eiaiproject/Ledjer/issues
