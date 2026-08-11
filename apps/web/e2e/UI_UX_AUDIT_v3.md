# UI/UX Audit v3 — Web + Mobile (Android & iOS)

**Tanggal:** 2026-08-11 · **Target:** `https://ledjer-staging.eiai.workers.dev` (deploy `610cb84e`)
**Konteks:** Audit menyeluruh setelah deploy perubahan penyesuaian stok atomik + alert `inventory_mismatch`.

---

## 1. Cakupan & Metodologi

Empat suite otomatis dijalankan terhadap staging (kode terbaru):

| Suite | Perangkat | Halaman | Apa yang diukur |
|-------|-----------|---------|-----------------|
| `consistency-audit.spec.ts` | Desktop Chrome, Pixel 5, iPhone 13 | 10 publik | token spacing/radius/type, heading, touch target, kontras, chrome, simetri form |
| `consistency-audit-auth.spec.ts` *(baru)* | Desktop Chrome, Pixel 5, iPhone 13 | **22 authed** | metrik struktur yang sama untuk seluruh area dashboard |
| `accessibility.spec.ts` (axe-core) | Desktop Chrome | 11 publik + 18 authed | WCAG 2a/2aa/best-practice — fail hanya jika ada violation critical/serious |
| `scan-all-pages.mjs` | Mobile 375×812 | 49 halaman + detail | navigasi tiap halaman + interaksi elemen; error console/JS/HTTP |

**Hasil ringkas:**

| Suite | Hasil |
|-------|-------|
| Konsistensi publik (desktop) | ✅ 10/10 |
| Konsistensi authed (desktop) | ✅ 22/22 |
| Konsistensi authed (Android Pixel 5) | ✅ 22/22 |
| Konsistensi authed (iOS iPhone 13) | ✅ 22/22 |
| Konsistensi publik (mobile) | ✅ 20/20 |
| Axe accessibility | ✅ **56/56** |
| scan-all-pages (mobile) | ✅ **49/49** — 0 error JS, 0 HTTP error, 80 interaksi |

---

## 2. Temuan yang Diperbaiki

### 2.1 Halaman Jurnal — input tanpa label (a11y, WCAG 1.3.1)
`/journals`: input "Deskripsi" per baris jurnal tidak punya `label`/`aria-label`
(tidak terdeteksi sebagai input ber-label → audit "unlabeled inputs = 2").
**Fix:** tambah `aria-label={`Deskripsi baris ${index + 1}`}` pada setiap baris.
*Commit `6eb771c`.*

### 2.2 Kontras warna gagal WCAG AA di Cash Flow
`/reports/cash-flow`: `text-emerald-600` (3.33:1) dan `text-red-600` (4.35:1)
di atas latar krem — di bawah ambang 4.5:1 (violation serious axe).
**Fix:** `text-leaf-600` (sukses) / `text-error` (negatif) — token brand yang sudah
diverifikasi AA di `index.css`. *Commit `4438334`.*

### 2.3 Inkonsistensi palet warna (design token)
14 file memakai palet **default Tailwind** yang tidak ada di design system Ledjer:
`emerald`, `red`, `amber`, `yellow`, `green`, `blue`, `violet`, `purple`, `orange`,
`indigo`, `teal`, `pink`. Selain tidak konsisten dengan brand (wood/leaf/cream/clay/
honey/sky), sebagian gagal kontras AA pada latar krem.
**Fix:** semua diselaraskan ke token brand — pemetaan:

| Palet default | Token brand | Konteks |
|---------------|-------------|---------|
| `emerald-*` | `leaf-*` / `success-*` | sukses, lunas, saldo positif |
| `red-*` | `error` / `error-bg` / `error-border` | error, hapus, negatif |
| `amber-*` | `warning` / `warning-bg` / `warning-border` (clay) | peringatan, jatuh tempo |
| `yellow-*` | `honey-*` | stok menipis, sebagian dibayar |
| `green-*` | `leaf-*` / `success-bg` | undangan, ekspor selesai |
| `blue-*` / `indigo-*` / `purple-*` | `sky-*` | info, periode, peran |
| `orange-*` | `clay-*` | login perangkat baru, severity high |
| `violet-*` (credit note) | `clay-*` / `warning-*` | nota kredit |

**File (14):** `cash-flow`, `party-statement`, `invoices/new`, `invoices/[id]`,
`opening-balance`, `reconciliation`, `import`, `notifications`, `notification-bell`,
`global-search`, `attachment-section`, `button` (destructive), `login`, `journals`.
*Commit `4438334`.*

---

## 3. Temuan Residual & Rekomendasi Prioritas

| # | Temuan | Prioritas | Keterangan |
|---|--------|-----------|------------|
| 1 | Halaman authed tidak punya landmark `<header>`/`<footer>` (header mobile & topbar memakai `<div>`) | Sedang | Bukan pelanggaran WCAG (sudah ada `main`, `nav`, `aside` + skip-link), tapi menyulitkan navigasi screen reader & konsistensi landmark. Rekomendasi: ganti `<div>` header → `<header>`; tambah `<footer>` ringkas bila perlu. |
| 2 | `/refund` & `/reset-password` tidak punya landmark `<main>` | Rendah | WARN lama sejak Round 2 (halaman legal statis). |
| 3 | Touch target < 44px | Rendah | Di desktop banyak tombol ikon < 44px (normal untuk mouse); di mobile hanya 1–3/halaman (ikon hapus kecil). CSS global sudah memaksa `min-height:44px` pada coarse pointer (`@media (pointer: coarse)`). |
| 4 | Drift pembulatan WAC (akun persediaan) | Info | Bukan bagian audit visual; sudah dibahas di perbaikan data produksi. |

---

## 4. Status & Artefak

- Audit spec authed baru: `e2e/consistency-audit-auth.spec.ts` → `.audit-results-auth.json`
- Data metrik: `e2e/.audit-results.json`, `e2e/.audit-results-auth.json`, `e2e/e2e-scan-report.json`
- Verifikasi: typecheck ✅ · ESLint (14 file) ✅ · unit 520/520 ✅ · build ✅ ·
  axe 56/56 ✅ · konsistensi authed 22/22 (desktop + Android + iOS) ✅
- Deployed ke staging: Version `610cb84e`
