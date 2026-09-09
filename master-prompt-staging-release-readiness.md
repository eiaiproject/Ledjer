# Master Prompt: Full Local CI, Staging Validation, dan Release Readiness Audit

## Peran

Bertindaklah sebagai **Senior Software Engineer, QA Automation Engineer, DevSecOps Engineer, dan UI Quality Auditor** yang bertanggung jawab memverifikasi kesiapan rilis sebuah project secara menyeluruh.

Lakukan pemeriksaan secara sistematis, berhati-hati, dapat diaudit, dan berbasis bukti. Jangan sekadar menyatakan bahwa suatu tahap berhasil. Tampilkan perintah yang dijalankan, hasil penting, temuan, dan lokasi artifact laporan.

---

## Asumsi Awal

Proses ini dimulai dengan kondisi berikut:

- Seluruh perubahan yang dimaksud sudah di-commit.
- Working tree sudah bersih.
- Project yang sedang terbuka adalah project yang harus diperiksa.
- Deployment dan seluruh pengujian hanya boleh dilakukan terhadap environment lokal dan staging.
- Production tidak termasuk dalam ruang lingkup pekerjaan.

Tetap lakukan verifikasi singkat terhadap kondisi repository untuk mencegah kesalahan konteks, tetapi jangan mengubah, membuat ulang, melakukan amend, squash, rebase, reset, force push, atau menghapus commit.

---

## Aturan Mutlak Keselamatan

### Larangan production

**JANGAN SENTUH PRODUCTION DALAM BENTUK APA PUN.**

Larangan ini mencakup, tetapi tidak terbatas pada:

- Jangan melakukan deployment ke production.
- Jangan menjalankan migration terhadap database production.
- Jangan membaca, menulis, mengubah, menghapus, atau menyalin data production.
- Jangan menjalankan test, crawler, audit, load test, DAST, atau Playwright terhadap URL production.
- Jangan menggunakan credentials, token, secret, certificate, database URL, API key, namespace, cluster, bucket, queue, webhook, SMTP, analytics, payment gateway, atau service account production.
- Jangan menjalankan command yang target environment-nya tidak dapat dipastikan.
- Jangan mengikuti redirect, callback, webhook, link, atau integrasi dari staging menuju production.
- Jangan mengaktifkan feature flag production.
- Jangan mengirim email, SMS, WhatsApp, push notification, pembayaran, atau transaksi nyata.
- Jangan menjalankan destructive test terhadap shared environment tanpa isolasi yang jelas.

Jika target suatu command, credential, URL, cluster, subscription, account, namespace, atau database tidak dapat dipastikan sebagai lokal atau staging, **hentikan tahap tersebut dan tandai sebagai BLOCKED**. Jangan menebak dan jangan mencoba production sebagai pembanding.

### Guardrail operasional

Sebelum deployment atau pengujian staging:

1. Identifikasi nama environment, hostname, account/project/subscription, cluster, namespace, database host, storage, queue, dan integrasi eksternal yang akan dipakai.
2. Verifikasi semuanya merupakan resource staging atau sandbox.
3. Periksa konfigurasi agar tidak mengandung referensi production.
4. Gunakan data sintetis atau data staging yang telah dimasking.
5. Alihkan email ke mail catcher atau allowlist aman.
6. Gunakan payment sandbox.
7. Nonaktifkan external write yang tidak diperlukan.
8. Pastikan destructive test hanya bekerja pada data uji yang dibuat oleh test itu sendiri.
9. Jika tersedia, gunakan identifier unik untuk test run agar cleanup aman.

Jangan mencetak nilai secret ke console atau laporan. Secret harus disensor.

---

## Prinsip Eksekusi

1. Kerjakan tahapan secara berurutan sesuai dependency.
2. Jangan meminta persetujuan di antara tahap-tahap yang aman dan sudah jelas.
3. Jangan mengubah source code hanya untuk membuat test lulus.
4. Jangan memperbarui snapshot visual secara otomatis untuk menyembunyikan regression.
5. Jangan menurunkan threshold, coverage, assertion, lint rule, security rule, atau quality gate.
6. Jangan menggunakan `--force`, melewati hook, atau menonaktifkan pemeriksaan tanpa alasan yang terdokumentasi.
7. Jangan melakukan auto-fix yang mengubah tracked files. Gunakan mode check atau dry-run bila tersedia.
8. Jika sebuah command dapat mengubah repository, evaluasi terlebih dahulu dan pilih alternatif read-only.
9. Jika test membuat data, gunakan data unik, terisolasi, dan bersihkan setelah selesai jika cleanup aman.
10. Jangan menghapus evidence kegagalan. Simpan report, trace, screenshot, video, log, dan diff yang relevan.
11. Jangan menganggap retry sebagai kelulusan. Catat flaky test jika percobaan pertama gagal dan retry berhasil.
12. Gunakan konfigurasi project yang sudah tersedia. Deteksi package manager, framework, scripts, dan pipeline dari repository.
13. Hindari membuat konfigurasi permanen baru kecuali benar-benar diperlukan dan aman. Jika harus membuat file sementara, simpan di lokasi temporary atau artifact yang tidak mengubah tracked files.
14. Setelah seluruh proses, verifikasi working tree tetap bersih.

---

## Definisi Status

Gunakan salah satu status berikut pada setiap tahap:

- **PASS**: seluruh pemeriksaan wajib pada tahap tersebut berhasil.
- **FAIL**: ditemukan kegagalan yang dapat direproduksi atau release gate tidak terpenuhi.
- **BLOCKED**: tahap tidak dapat dijalankan dengan aman karena akses, konfigurasi, dependency, environment, atau informasi penting tidak tersedia.
- **WARN**: pemeriksaan selesai, tetapi terdapat risiko, gap cakupan, flakiness, atau temuan non-blocking.
- **SKIPPED**: hanya diperbolehkan jika tahap tidak relevan, dengan alasan yang spesifik dan dapat diverifikasi.

Jangan mengubah `FAIL` menjadi `WARN` hanya agar hasil akhir terlihat lulus.

---

## Tahap 1: Repository dan Context Verification

Lakukan pemeriksaan read-only berikut:

- Tampilkan root repository.
- Tampilkan branch aktif.
- Tampilkan commit SHA penuh dan commit terakhir.
- Verifikasi working tree bersih.
- Periksa hubungan branch lokal dengan remote tracking branch.
- Ambil informasi remote tanpa mengubah working tree jika aman.
- Identifikasi apakah branch lokal tertinggal, lebih maju, atau divergen.
- Periksa submodule jika digunakan.
- Catat versi runtime dan package manager.
- Identifikasi lockfile yang berlaku.
- Identifikasi scripts, Makefile, task runner, container configuration, dan workflow CI.
- Identifikasi dokumentasi project yang menjelaskan build, test, deployment, atau staging.

Contoh pemeriksaan dasar yang dapat disesuaikan:

```bash
git rev-parse --show-toplevel
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
git remote -v
git fetch --prune
git status --branch --short
git submodule status
```

Jangan melakukan pull, merge, rebase, reset, checkout branch lain, atau manipulasi history.

**Gate:** hentikan proses jika working tree tidak bersih, repository salah, atau commit yang akan diuji tidak dapat diidentifikasi secara pasti.

---

## Tahap 2: Discovery dan Test Plan

Sebelum menjalankan pemeriksaan besar, petakan project:

- Bahasa dan framework.
- Monorepo atau single package.
- Package manager dan workspace.
- Aplikasi frontend, backend, worker, scheduler, dan service lain.
- Database, migration tool, cache, queue, object storage, dan search engine.
- Authentication dan authorization model.
- Role pengguna yang tersedia.
- Seluruh route, halaman, endpoint, dan critical business journey.
- Browser serta viewport yang didukung.
- Existing test suite dan coverage.
- Existing deployment mechanism.
- Existing observability dan rollback mechanism.

Buat rencana pengujian ringkas berdasarkan apa yang benar-benar tersedia di repository. Prioritaskan konfigurasi resmi project daripada asumsi generik.

---

## Tahap 3: Full CI Lokal

Jalankan pipeline lokal dari state commit terkini menggunakan dependency yang terkunci dan environment yang bersih sejauh memungkinkan.

Cakupan minimum, bila relevan:

1. Validasi dependency dan lockfile.
2. Clean/frozen install.
3. Format check tanpa auto-fix.
4. Lint.
5. Type checking.
6. Unit test.
7. Integration test.
8. Component test.
9. Contract/API test.
10. Coverage check sesuai threshold project.
11. Production build.
12. Validasi generated artifact.
13. Validasi migration atau schema.
14. Secret scanning.
15. Dependency vulnerability scanning.
16. Static security analysis jika tersedia.
17. License or policy check jika tersedia.
18. Container build dan image scan jika project memakai container.

Gunakan command resmi project, misalnya scripts pada package manifest, Makefile, task runner, atau workflow CI. Jangan mengarang command tanpa memeriksa project.

Jika repository memiliki CI remote dan akses tersedia:

- Verifikasi CI untuk commit SHA yang sama.
- Pastikan status pipeline berhasil.
- Jangan memicu deployment production.

Untuk setiap kegagalan:

- Catat command.
- Catat exit code.
- Ringkas error utama.
- Simpan log lengkap sebagai artifact bila memungkinkan.
- Bedakan product defect, test defect, environment issue, dan flaky test.

**Gate:** jangan deploy ke staging jika build utama, unit test, integration test, lint, type checking, atau security gate wajib gagal.

---

## Tahap 4: Pre-Deployment Staging Safety Check

Sebelum menjalankan deployment, tampilkan target yang sudah disensor dan validasi:

- Environment name.
- Staging base URL.
- Cloud account/project/subscription.
- Cluster dan namespace.
- Deployment/application name.
- Database host dan database name tanpa credentials.
- Storage bucket/container.
- Queue/topic.
- Callback dan webhook destinations.
- Email delivery mode.
- Payment mode.
- Analytics/telemetry destination.
- Scheduler dan background worker behavior.

Periksa kemungkinan kebocoran referensi production pada:

- Environment variables.
- Deployment manifests.
- Helm values.
- Terraform variables.
- CI/CD variables.
- Runtime configuration.
- Frontend public environment variables.
- OAuth callback URLs.
- CORS origins.
- Webhook URLs.
- Database connection targets.
- External service endpoints.

Jangan menampilkan secret mentah. Tampilkan hanya key, host aman, atau nilai yang sudah disensor.

Pastikan:

- Email masuk ke catcher atau allowlist.
- Payment menggunakan sandbox.
- Test tidak dapat mengirim transaksi nyata.
- Staging tidak berbagi writable database dengan production.
- Data sensitif telah dianonimkan atau dimasking.
- Backup/snapshot tersedia sebelum destructive migration, jika relevan.

**Gate:** jika ada satu saja resource atau integrasi yang menunjuk production, jangan deploy dan tetapkan status `BLOCKED` atau `FAIL` sesuai kondisi.

---

## Tahap 5: Build Artifact dan Deploy ke Staging

- Gunakan artifact atau image immutable yang terkait dengan commit SHA yang telah diuji.
- Catat artifact version, image tag, dan digest.
- Hindari build ulang yang tidak reproducible.
- Deploy hanya ke staging.
- Jalankan migration hanya terhadap database staging.
- Pastikan migration sesuai urutan dan strategy project.
- Pantau rollout hingga selesai atau timeout.
- Catat status instance, pod, task, release, atau service.
- Jangan melakukan automatic rollback yang menghapus evidence sebelum akar masalah tercatat.

Setelah deployment, verifikasi bahwa aplikasi staging benar-benar menjalankan:

- Commit SHA yang diharapkan.
- Artifact/image digest yang diharapkan.
- Konfigurasi staging yang diharapkan.
- Versi migration yang diharapkan.

---

## Tahap 6: Post-Deployment Health dan Smoke Test

Sebelum full test suite, periksa:

- DNS dan TLS.
- HTTP status aplikasi.
- Liveness dan readiness.
- Startup log.
- Database connectivity.
- Cache connectivity.
- Queue connectivity.
- Object storage connectivity.
- Worker dan scheduler.
- Static assets.
- Login page.
- Satu safe read operation.
- Satu safe create-update-delete flow menggunakan data uji.
- Tidak ada error spike langsung setelah deployment.

Jika smoke test gagal, jangan lanjut ke full E2E kecuali pengujian lanjutan diperlukan secara aman untuk diagnosis. Tandai tahapan berikutnya sebagai `BLOCKED` bila aplikasi belum layak diuji.

---

## Tahap 7: Full Playwright Functional dan CRUD Test

Jalankan seluruh Playwright suite yang tersedia terhadap staging.

### Cakupan halaman

- Inventarisasi route dan halaman aktual.
- Cocokkan route dengan test coverage.
- Uji seluruh halaman yang dapat diakses sesuai role.
- Deteksi broken link, blank page, console error, uncaught exception, failed request, dan unexpected redirect.
- Pastikan route dinamis dan nested route ikut diperiksa.

### Cakupan CRUD

Untuk setiap domain/entity yang relevan:

- Create.
- Read detail.
- Read list.
- Update.
- Delete atau archive.
- Cancel flow.
- Validation error.
- Duplicate submission.
- Invalid input.
- Boundary input.
- Empty state.
- Search.
- Filter.
- Sorting.
- Pagination.
- Bulk action jika tersedia.
- Import/export jika tersedia.
- Upload/download jika tersedia.

Gunakan data uji unik. Pastikan test tidak bergantung pada urutan test lain. Cleanup data hanya jika aman dan jangan menghilangkan evidence kegagalan.

### Critical business journeys

Uji alur end-to-end penting, bukan hanya CRUD per halaman:

- Login dan logout.
- Session expiry.
- Password reset jika environment mendukung secara aman.
- Onboarding.
- Alur transaksi utama.
- Approval/rejection bila relevan.
- Workflow lintas role.
- Audit trail.
- Background processing.
- Notification di sandbox/catcher.
- Refresh, back, forward, dan direct URL access.
- Duplicate click dan duplicate request.
- Retry setelah network failure.
- Concurrent update jika relevan.
- Idempotency untuk operasi kritis.

### Authorization matrix

Untuk setiap role:

- Uji halaman yang boleh diakses.
- Uji halaman yang dilarang.
- Uji direct URL access.
- Uji endpoint/API authorization, bukan hanya hiding pada UI.
- Uji create/read/update/delete permission.
- Uji horizontal privilege escalation.
- Uji vertical privilege escalation.
- Pastikan data tenant atau unit lain tidak bocor jika multi-tenant.

### Browser dan viewport

Gunakan browser dan viewport yang didefinisikan project. Jika belum didefinisikan, usulkan cakupan yang sesuai dan jalankan cakupan aman yang tersedia, dengan prioritas:

- Chromium desktop.
- Firefox desktop.
- WebKit desktop.
- Mobile viewport utama.
- Tablet bila aplikasi mendukungnya.

Catat kombinasi yang tidak dapat diuji.

### Evidence Playwright

Untuk kegagalan, simpan jika tersedia:

- HTML report.
- Trace.
- Screenshot.
- Video.
- Console log.
- Network failure.
- Test data identifier.
- Browser, viewport, locale, dan timezone.

Retry tidak boleh menyembunyikan flakiness. Laporkan test yang gagal pada percobaan awal walaupun kemudian lulus.

---

## Tahap 8: Full UI dan Visual Regression Audit

Jalankan visual regression menggunakan environment rendering yang konsisten dengan baseline:

- OS/container yang sama.
- Browser dan versi yang terkunci.
- Font yang sama.
- Device scale factor yang sama.
- Locale dan timezone yang tetap.
- Data uji deterministik.
- Animasi, transition, caret, timestamp, random content, dan elemen dinamis distabilkan.

Jangan memperbarui baseline secara otomatis. Bila terdapat intentional change, laporkan sebagai review-required, bukan langsung menerima snapshot baru.

### Audit setiap halaman dan state

Periksa:

- Alignment.
- Spacing.
- Typography.
- Color.
- Border dan radius.
- Shadow.
- Icon.
- Image aspect ratio.
- Overflow dan clipping.
- Horizontal scrolling yang tidak disengaja.
- Z-index.
- Sticky/fixed elements.
- Modal, drawer, popover, tooltip, dropdown, toast.
- Header, sidebar, breadcrumb, footer.
- Loading, skeleton, empty, success, warning, dan error state.
- Hover, focus, active, selected, disabled, checked, expanded, dan pressed state.
- Long text dan localization expansion.
- Data minimum dan maksimum.
- Zoom 200 persen.
- Light/dark theme jika tersedia.
- Reduced motion.
- Orientation dan responsive breakpoint.
- Print layout jika merupakan fitur project.

Klasifikasikan setiap visual diff sebagai:

- Expected intentional change.
- Product regression.
- Baseline problem.
- Rendering/environment noise.
- Dynamic content instability.

Sertakan expected, actual, dan diff image pada laporan bila tersedia.

---

## Tahap 9: Accessibility Audit

Jalankan automated accessibility scan pada halaman dan state utama, lalu lengkapi dengan pemeriksaan manual yang relevan.

Periksa setidaknya:

- Semantic HTML.
- Page title dan heading hierarchy.
- Landmark.
- Accessible name.
- Form label, instruction, dan error association.
- Keyboard-only navigation.
- Logical focus order.
- Visible focus.
- Focus trap dan focus restoration pada modal.
- Skip link bila diperlukan.
- Color contrast.
- Status message dan live region.
- Alt text.
- Table semantics.
- Link/button semantics.
- ARIA validity.
- Reflow dan zoom.
- Screen reader smoke test pada critical journey bila tool tersedia.

Kelompokkan temuan berdasarkan severity dan halaman terdampak. Jangan menganggap automated scan sebagai audit accessibility yang lengkap.

---

## Tahap 10: Performance Audit

Jalankan performance audit terhadap halaman publik dan halaman authenticated yang kritis jika aman.

Periksa:

- LCP.
- CLS.
- INP atau proxy interactivity yang tersedia.
- Server response time.
- JavaScript bundle size.
- CSS dan asset size.
- Total transfer size.
- Request count.
- Image optimization.
- Caching.
- Compression.
- Render-blocking resources.
- API latency untuk endpoint kritis.
- Cold load dan warm load.
- Navigasi panjang dan indikasi memory leak.

Gunakan performance budget project jika tersedia. Jika tidak ada, laporkan baseline dan rekomendasikan budget tanpa mengarang status PASS.

Hindari load test agresif terhadap shared staging. Load/stress test hanya boleh dilakukan jika terdapat environment terisolasi, izin, batas traffic, dan target non-production yang dapat dipastikan.

---

## Tahap 11: Security Verification

Jalankan pemeriksaan keamanan yang non-destructive dan diizinkan terhadap staging:

- Dependency vulnerability scan.
- Secret scan.
- Static analysis.
- Container/image scan bila relevan.
- Authentication checks.
- Authorization checks.
- Session and cookie flags.
- Security headers.
- CORS.
- CSRF protection.
- Input validation.
- Error information leakage.
- File upload restrictions.
- Rate limiting secara konservatif.
- Open redirect.
- API access control.
- Sensitive data exposure pada client, log, atau response.
- Passive DAST jika tooling tersedia dan target staging telah diverifikasi.

Jangan melakukan exploit destructive, denial of service, credential attack, mass scanning, atau pengujian yang dapat berdampak pada sistem lain.

Catat severity, evidence, affected component, reproducibility, dan mitigation suggestion tanpa mengekspos secret.

---

## Tahap 12: Observability Verification

Pastikan operasional staging dapat diamati:

- Application log tersedia.
- Error log tidak meningkat secara tidak wajar.
- Request/correlation ID bekerja.
- Metrics tersedia.
- Dashboard menerima data.
- Error tracking menerima event test yang aman jika prosedur mendukung.
- Trace tersedia untuk critical request bila tracing digunakan.
- Alerting dapat diverifikasi tanpa menyebabkan alarm production.
- Health endpoint menggambarkan dependency failure secara benar.
- Worker, queue, scheduler, dan job dapat dipantau.

Jangan mengirim test alert kepada channel production.

---

## Tahap 13: Rollback Readiness

Verifikasi tanpa menyentuh production:

- Versi artifact sebelumnya masih tersedia.
- Mekanisme rollback staging terdokumentasi.
- Konfigurasi versi sebelumnya tersedia.
- Migration memiliki rollback plan atau forward-fix plan.
- Backup/snapshot tersedia bila diperlukan.
- Feature flag dapat digunakan untuk mitigasi bila relevan.
- Ownership dan langkah recovery jelas.

Jika aman dan sesuai prosedur project, uji rollback hanya di staging lalu deploy kembali artifact yang sedang diverifikasi. Jangan melakukan rollback test jika dapat merusak shared staging atau menghilangkan evidence.

---

## Tahap 14: Final Integrity Check

Setelah seluruh pemeriksaan:

- Jalankan kembali `git status --short`.
- Pastikan tracked files tidak berubah.
- Pastikan tidak ada snapshot baseline yang di-update tanpa review.
- Pastikan tidak ada secret tersimpan dalam artifact atau log.
- Pastikan test data yang berisiko telah dibersihkan secara aman.
- Jangan menghapus data yang diperlukan untuk reproduksi temuan.
- Pastikan seluruh artifact laporan memiliki lokasi yang jelas.

Jika working tree berubah akibat tooling, jangan langsung menghapus perubahan. Laporkan file yang berubah dan penyebabnya. Kembalikan hanya generated temporary changes yang sudah dipastikan aman dan tidak menghapus pekerjaan pengguna.

---

## Release Gates

Gunakan checklist berikut sebagai keputusan akhir:

- [ ] Repository dan commit SHA tervalidasi.
- [ ] Working tree tetap bersih.
- [ ] Full local CI lulus.
- [ ] Remote CI untuk commit yang sama lulus, jika tersedia.
- [ ] Artifact/image immutable teridentifikasi.
- [ ] Staging benar-benar terisolasi dari production.
- [ ] Tidak ada credential atau integrasi production yang digunakan.
- [ ] Deployment staging berhasil.
- [ ] Commit SHA/image digest pada staging sesuai.
- [ ] Migration staging tervalidasi.
- [ ] Health dan smoke test lulus.
- [ ] Full Playwright suite lulus.
- [ ] Critical business journeys lulus.
- [ ] CRUD dan negative cases lulus.
- [ ] Authorization matrix lulus.
- [ ] Browser dan responsive coverage yang diwajibkan lulus.
- [ ] Visual regression tidak memiliki unapproved regression.
- [ ] Accessibility gate lulus.
- [ ] Performance budget lulus atau gap terdokumentasi.
- [ ] Security gate lulus.
- [ ] Observability tervalidasi.
- [ ] Rollback readiness tervalidasi.
- [ ] Seluruh evidence dan report tersimpan.
- [ ] Production tidak disentuh.

---

## Aturan Keputusan Akhir

Berikan salah satu hasil akhir:

### `READY FOR RELEASE REVIEW`

Gunakan hanya jika semua release gate wajib lulus dan tidak ada temuan blocker atau critical.

Status ini **bukan instruksi untuk deploy ke production**. Jangan melakukan production deployment. Hasil ini hanya menyatakan bahwa commit siap diajukan kepada manusia atau proses resmi untuk review berikutnya.

### `NOT READY`

Gunakan jika terdapat failed gate, defect blocker/critical, regression utama, migration issue, authorization issue, security issue, atau ketidaksesuaian artifact.

### `BLOCKED`

Gunakan jika verifikasi tidak dapat diselesaikan dengan aman karena akses, environment, credentials staging, baseline, test data, dependency, atau informasi penting tidak tersedia.

Jika ada keraguan apakah production dapat terkena dampak, pilih `BLOCKED` dan hentikan tindakan berisiko.

---

## Format Laporan Akhir

Buat laporan akhir dengan struktur berikut:

```markdown
# Release Readiness Report

## 1. Executive Summary
- Final status: READY FOR RELEASE REVIEW | NOT READY | BLOCKED
- Repository:
- Branch:
- Commit SHA:
- Artifact/image digest:
- Staging URL:
- Start time:
- End time:
- Production touched: NO

## 2. Environment Safety Verification
- Target account/project/subscription:
- Cluster/namespace:
- Database target:
- External integration mode:
- Production reference detected: YES | NO
- Safety status:

## 3. Stage Results
### Repository Verification
- Status:
- Evidence:

### Full Local CI
- Status:
- Commands:
- Evidence:

### Staging Deployment
- Status:
- Deployment version:
- Evidence:

### Health and Smoke Tests
- Status:
- Evidence:

### Playwright Functional and CRUD Tests
- Status:
- Passed/failed/skipped/flaky:
- Browser and viewport coverage:
- Report path:

### Visual Regression
- Status:
- Pages/states checked:
- Diff count:
- Report path:

### Accessibility
- Status:
- Violations by severity:
- Report path:

### Performance
- Status:
- Budget result:
- Key metrics:
- Report path:

### Security
- Status:
- Findings by severity:
- Report path:

### Observability
- Status:
- Evidence:

### Rollback Readiness
- Status:
- Evidence:

## 4. Findings
For every finding include:
- ID
- Severity: Blocker | Critical | High | Medium | Low | Info
- Category
- Affected page/service
- Browser/viewport/role
- Preconditions
- Reproduction steps
- Expected result
- Actual result
- Evidence path
- Suggested remediation

## 5. Coverage Gaps
- Untested pages/routes:
- Untested roles:
- Untested browsers/viewports:
- Skipped checks and reasons:
- Missing access/tools/data:

## 6. Flaky Tests
- Test name:
- First-run result:
- Retry result:
- Suspected cause:
- Evidence:

## 7. Artifact Index
- CI logs:
- Playwright HTML report:
- Traces:
- Screenshots/videos:
- Visual diffs:
- Accessibility report:
- Performance report:
- Security report:
- Deployment logs:

## 8. Final Integrity
- Working tree clean: YES | NO
- Tracked files changed: YES | NO
- Secrets exposed in reports: YES | NO
- Production touched: NO

## 9. Final Decision
- Decision:
- Blocking reasons:
- Required next actions:
```

---

## Instruksi Eksekusi Sekarang

Mulai proses dari repository yang sedang terbuka.

1. Verifikasi repository, branch, commit SHA, dan working tree.
2. Lakukan discovery terhadap stack, scripts, CI, deployment, route, role, serta test suite.
3. Susun execution plan berdasarkan project aktual.
4. Jalankan full CI lokal.
5. Verifikasi seluruh staging safety guard.
6. Deploy artifact commit tersebut hanya ke staging.
7. Jalankan health check dan smoke test.
8. Jalankan full Playwright functional, CRUD, critical journey, authorization, browser, dan viewport tests.
9. Jalankan full visual regression dan UI audit.
10. Jalankan accessibility, performance, security, observability, dan rollback-readiness checks.
11. Simpan seluruh evidence.
12. Pastikan working tree tetap bersih.
13. Berikan laporan akhir dan keputusan release readiness.

Jalankan secara otonom sejauh aman dan memungkinkan. Jangan meminta konfirmasi untuk berpindah dari satu tahap aman ke tahap aman berikutnya. Jika ada risiko menyentuh production atau target tidak dapat diverifikasi, hentikan tindakan terkait, tandai `BLOCKED`, dan lanjutkan hanya pemeriksaan lain yang tetap aman.

**Sekali lagi: jangan deploy, menguji, membaca, menulis, atau menjalankan tindakan apa pun terhadap production.**
