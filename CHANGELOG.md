# Changelog

All notable changes to Ledjer are documented here.

## [Unreleased]

### Added
- Buku besar (general ledger) MVP: `getGeneralLedger` di `reports.service`
  (running balance per akun, saldo awal ikut terbawa), `GET
  /api/reports/general-ledger`, halaman "Buku Besar" di bawah menu Laporan
  (filter tanggal + akun), dan unit test. Buku besar dibaca langsung dari
  journal lines transaksi `posted` - tanpa perubahan skema.

### Changed
- Dead code & sisa pre-MVP dihapus: 6 komponen UI tak terpakai
  (`combobox`, `page-shell`, `page-toolbar`, `skeleton`, `status-flow`,
  `textarea`), service worker `public/sw.js` (tidak pernah didaftarkan),
  skrip benchmark skema lama `scripts/seed-benchmark-data.mjs` + script
  `benchmark:seed`, artefak `e2e/.audit-results*.json`, dan CSS landing yang
  tidak terpakai di `index.css`.
- Dokumentasi disinkronkan dengan cakupan MVP: `docs/accounting-rules.md`
  (5 tipe transaksi), `docs/architecture/permission-matrix.md` (role owner),
  `docs/architecture/tenant-isolation.md` (daftar tabel aktual),
  `docs/testing.md`, `docs/security/csp.md`, `docs/product/*`,
  `docs/production/backup-and-restore.md`, `docs/performance.md`,
  `apps/web/README.md`, `apps/web/worker/README.md`, dan `docs/api/*`
  (openapi.yaml kini hanya berisi endpoint MVP yang hidup; p1-* ditandai
  roadmap).
- `CODEOWNERS` diperbaiki (path root-anchored `apps/web/worker/...`, referensi
  file yang sudah dihapus dibuang) dan copy SEO/`robots.txt` dibersihkan dari
  fitur non-MVP.
- Konsistensi layout & tipografi: ritme seksi halaman diseragamkan (`space-y-4`),
  kolom grid form yang `col-span`-nya tak pernah efektif diperbaiki, padding
  ganda kartu auth/404 dirapikan, dan hierarki heading diselaraskan (judul
  kartu `h2`, satu `h1` per halaman). Pemeriksaan desain otomatis ditambahkan
  ke `scripts/ui-audit.mjs` (outline heading + keseimbangan kolom grid).

### Fixed
- Nominal pecahan rupiah ditolak alih-alih dibulatkan diam-diam (`amountIdr`
  kini harus integer di service + schema zod; test ditambahkan).
- Ekspor CSV tanpa filter status kini memuat SEMUA status (posted + voided),
  konsisten dengan daftar transaksi "Semua status" di UI.
- Race idempotensi (dua POST paralel dengan key sama) kini menghasilkan replay
  transaksi pemenang, bukan error 500 UNIQUE sesaat.
- Rotasi token sesi 7 hari tidak lagi memutus request paralel yang masih
  membawa cookie lama: migrasi `0005_session_token_grace.sql` menyimpan hash
  token lama selama window grace 60 detik (unit test + verifikasi HTTP).

### MVP cash-only reset (branch `mvp-cash-only`)

Per PRD 2026-09-03, Ledjer di-strip besar-besaran menjadi MVP pencatatan kas yang sederhana:

#### Removed
- `apps/admin` (dashboard internal admin.ledjer.id) dan `apps/docs` (situs VitePress) dihapus dari repo
- Fitur non-MVP: inventory/produk/stok, faktur & piutang/utang (AR/AP), pihak (parties), jurnal manual, rekonsiliasi bank, kunci periode, impor data, ekspor PDF, email verification & reset password, notifikasi & web push, pencarian global, lampiran, onboarding wizard, kolaborasi tim (invitations), buku besar, neraca saldo, arus kas, aging, admin users/sessions
- Google OAuth dipertahankan (keputusan produk): login/daftar dengan Google aktif di MVP
- 33 migrasi D1 lama dibuang; skema di-reset bersih ke 11 tabel inti MVP (`0001_mvp_foundation.sql`, `0002_mvp_accounting.sql`)

#### Added
- 5 jenis transaksi: `cash_in`, `cash_out`, `transfer`, `owner_deposit`, `owner_withdrawal`; jurnal debit-kredit dipaksa seimbang; void dengan audit trail; idempotency key; nomor `TRX-YYYYMMDD-XXXX`
- Chart of accounts default 14 akun dibuat otomatis saat registrasi; CRUD akun kas/bank sederhana
- Laporan laba rugi & neraca (selalu balance); dashboard (saldo kas/bank, uang masuk/keluar bulan ini, laba bersih); ekspor CSV transaksi
- Backup D1 → R2 harian + cleanup sesi (cron) untuk tabel MVP
- Unit/integration tests ditulis ulang (182 worker + 41 frontend) dan e2e Playwright inti (89 tests)
- README, `.env.example`, dan workflow CI/CD disesuaikan dengan cakupan MVP

### Changed
- CSP: removed `'unsafe-inline'` from `script-src` in production `_headers`; no inline executable scripts exist in production HTML
- `X-XSS-Protection: 1; mode=block` → `0` (obsolete header per OWASP secure headers guidance)

### Added
- Inventory mismatch guard + Fase 3 golden tests
  - `computeInventoryMismatch()` pure function in `dashboard.service` (returns `{accountBalance, stockValue, diff, matched}`) — unit-testable with realistic fixtures
  - `verifyInventoryMatch` (backup.service) tolerance aligned to Rp 1.000 to match the dashboard detector; now returns a structured `InventoryMatchResult`
  - `GET /api/dashboard/inventory-reconciliation` (no-store) for on-demand mismatch check after a correction
  - 7 golden tests reproducing the org b28dc5e4 corruption arc (Persediaan overstated Rp 56.250 via void double-reversal race): exact divergence, clears after correction, tolerates <Rp 1.000 WAC drift, agrees with backup verification
- `/.well-known/security.txt` (RFC 9116) for vulnerability disclosure contact
- Security headers (CSP, XFO, nosniff, HSTS) on docs.ledjer.id via assets worker wrapper
- E2E assertions: script-src must not contain `'unsafe-inline'`, X-XSS-Protection must be `0`

### Fixed
- Production HTML no longer ships build-pipeline HTML comments (SENTRY placeholder, `_headers`, dev flag details) - stripped in postbuild step

### Added
- OSV vulnerability scanner (CI weekly workflow)
- pnpm audit in CI quality gate
- Dependabot config (weekly npm updates)
- CycloneDX SBOM + THIRD_PARTY_NOTICES.md
- Dependency security policy
- Auth security tests (14 tests: token generation, password hashing, session)
- CSRF E2E tests (6 tests) + documentation
- Permission matrix documentation
- `TenantScopedRepository` - runtime org-scoping guard
- Tenant isolation tests (12 unit + E2E) + architecture doc
- SQL injection + error redaction tests
- Hardened CSP (object-src 'none', frame-ancestors 'none')
- Security header E2E tests
- Accounting invariant tests (18 tests: journal balance, WAC, trial balance, balance sheet)
- Export row cap (MAX_EXPORT_ROWS = 50,000)
- OpenAPI 3.1 spec + versioning migration plan
- Structured JSON request logging
- Monitoring docs + incident response runbook
- Deployment docs (production + staging setup)
- Backup script (D1 → R2 via wrangler CLI)
- Backup/restore documentation
- R2 bucket binding in wrangler config
- Compliance docs (data retention, subprocessors, privacy engineering, DSR runbook)
- Product instrumentation plan
- Staging environment config in wrangler.jsonc
- k6 load test scripts (8 scenarios)
- Performance baseline documentation
- Test seeded fixtures (multi-org, multi-role)
- Coverage thresholds (lines 80%, branches 75%)
- Health + readiness API endpoints
- In-memory request metrics middleware
- SECURITY.md, CODEOWNERS, ADR records

### Fixed
- Missing `loadCurrentOrganization()` in audit-logs routes
- Placeholder assertions in golden-scenarios.test.ts
- `accounts.spec.ts` data-testid mismatch
- CSP missing `frame-ancestors 'none'` and `object-src 'none'`
- Production `_headers` CSP missing `object-src 'none'`
- E2E CSRF tests brittle for dev vs production mode
