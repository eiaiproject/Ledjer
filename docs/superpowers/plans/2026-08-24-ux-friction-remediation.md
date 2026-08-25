# UX Friction Remediation Plan — Bertahap & Berurutan

**Goal:** Hilangkan semua friksi UX yang teridentifikasi (2 konfirmasi + 10 potensi) tanpa breaking existing behavior. Setiap task 1 commit, verify `pnpm --filter web typecheck && test`.

**Branch:** `review-24/08` (sudah ada 2 commits ponytail + em-dash). Lanjutkan di branch yang sama.

**Prinsip:** DRY, tebak minimal, commit kecil, test hijau. `staleTime` dan invalidasi hati-hati karena D1 eventual consistency.

## Friksi & Urutan Fix

| # | Friksi | File sentuh | Risiko | Estimasi |
|---|---|---|---|---|
| 1 | **Auto-refresh data** — stale 30s, invalidate delay 500ms, hanya 10 key | `query-client.ts`, `query-keys.ts`, `transactions/_hooks.ts`, `dashboard.tsx`, `transactions/index.tsx` | Medium — D1 replica | 1 |
| 2 | **Buat transaksi baru lagi** — auto navigate ke detail, tidak ada tombol buat lagi | `transactions/new.tsx`, `_hooks.ts`, `_components.tsx` (SubmitBar) | Low | 1 |
| 3 | **Laporan & Pengaturan terkubur** — 2 tap deep | `layouts/dashboard.tsx` NAV_ITEMS, mungkin split atau tambah shortcut | Low | 1 |
| 4 | **Bottom nav mobile 3 tab** — Kas & Bank & Laporan hidden | `layouts/dashboard.tsx` BOTTOM_NAV_ROUTES | Low | 1 |
| 5 | **Inline create Produk/Pihak** — harus keluar halaman | `transactions/_components.tsx`, `_hooks.ts` (lookups), `lib/api/products/parties` | Medium | 2 |
| 6 | **Impor CSV template** — tanpa download template | `pages/import/index.tsx` | Low | 1 |
| 7 | **Filter persist via URL** — back reset | `pages/transactions/index.tsx`, `reports/*`, `products/index.tsx` | Medium | 1 |
| 8 | **Pull-to-Refresh konsisten** — hanya 2 halaman ada | `pages/transactions/index.tsx`, `reports/*`, `accounts/index.tsx` | Low | 1 |
| 9 | **Bulk action** — void/export per-row | `pages/transactions/index.tsx`, `invoices/index.tsx`, `products/index.tsx` | Medium | 2 |
| 10 | **Stok optimistic** — list masih stale 500ms | `pages/products/index.tsx`, `transactions/_hooks.ts` | Medium — WAC | 1 |
| 11 | **Form shortcut & draft** — Ctrl+Enter + auto-save | `pages/transactions/new.tsx`, `_hooks.ts` | Low | 1 |
| 12 | **Dashboard realtime** — 60s poll | `pages/dashboard.tsx` | Low | 1 |

Total 12 tasks. Eksekusi berurutan, stop tiap task untuk verifikasi sebelum lanjut.

---

### Task 1: Auto-refresh data (HIGH)
**Why:** User harus tekan Refresh global di semua halaman.
**Change:**
- `query-client.ts`: `staleTime: 30_000 → 10_000` untuk transaksi/produk, atau `0` untuk list.
- `transactions/_hooks.ts`: `invalidateTransactionFinancialCaches` tanpa `setTimeout 500ms`, atau optimistic update + retry. Pertahankan 500ms tapi tambah immediate invalidate untuk UI.
- `transactions/index.tsx`: tambah `refetchInterval: 10_000` atau `PullToRefresh` wrapper.
- Verifikasi D1 tidak read-after-write error (test dengan `FakeD1Database`).

### Task 2: Tombol Buat Lagi (HIGH)
**Why:** Harus back → list → Buat baru.
**Change:**
- `transactions/_hooks.ts`: jangan auto-navigate; set `successTransactionId` tapi tetap di form.
- `transactions/_components.tsx` SubmitBar: saat `successId`, tampilkan 2 tombol: `Lihat Detail` (navigate) + `Buat Transaksi Baru Lagi` (reset form + `createClientToken()` + clear `successTransactionId`).
- `transactions/new.tsx`: handler `handleCreateAnother`.

### Task 3: Navigasi Laporan & Pengaturan
**Change:** Di `DashboardLayout`, jadikan `Laporan` dan `Pengaturan` expanded by default di desktop, atau tambah shortcut di `visibleNavItems` (misal `Neraca Saldo` di root). Atau tambah breadcrumb.

### Task 4: Bottom nav mobile
**Change:** `BOTTOM_NAV_ROUTES` tambah `"/accounts"` (Kas & Bank) jadi 4 tab + `Laporan` sebagai 5th tab atau dropdown. Ubah `bottomNavItems` filter.

### Task 5: Inline create
**Change:** Di `ProductFieldsSection`/`PartyAccountSection`, tambah `+ Buat Produk` modal yang `POST /products` lalu `invalidate products` dan select.

### Task 6: Import template
**Change:** `pages/import/index.tsx` tambah tombol `Download template CSV` (link ke `/import/template?type=coa|products|parties`).

### Task 7: Filter persist
**Change:** Sync filter state ke `URLSearchParams` (`useSearchParams`) di `transactions/index.tsx` dll. Back dari detail preserve.

### Task 8: Pull-to-Refresh
**Change:** Bungkus `transactions/index.tsx`, `reports/*` dengan `<PullToRefresh onRefresh={refreshAllData}>`.

### Task 9: Bulk action
**Change:** Tambah checkbox per row + `Select all` di `transactions/index.tsx`, aksi `Void selected` / `Export selected`.

### Task 10: Stok optimistic
**Change:** Di `useTransactionMutation.onSuccess`, optimistic update `queryKeys.products` cache langsung (`setQueryData`), tidak tunggu 500ms.

### Task 11: Shortcut & draft
**Change:** `new.tsx` tambah `onKeyDown Ctrl+Enter` submit, `useEffect` auto-save form ke `localStorage` + restore.

### Task 12: Dashboard realtime
**Change:** `dashboard.tsx` `refetchInterval: 60_000 → 15_000` atau invalidate dari mutation.

## Verifikasi Tiap Task
```bash
pnpm --filter web typecheck
pnpm --filter web test  # 527 tests
pnpm --filter admin test # 9 tests
```

## Urutan Eksekusi
Task 1 → review → Task 2 → review → ... → Task 12. User bisa stop tiap tahap ("tahan", "skip").
