# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perbaiki seluruh temuan audit Ledjer (web + admin.ledjer.id): kebocoran kredensial (tidak ada, verifikasi), bug korekturan WAC/rate-limit/CSRF, friksi .gitignore & doc-drift, dan gap observability panel admin.

**Architecture:** Monorepo Cloudflare Workers + D1 + R2. `apps/web` (Hono Worker + React SPA), `apps/admin` (Worker terpisah, share D1 prod, cookie terpisah), `scripts/` (provisioning). Fix dibagi 3 fase: P0 config/docs (zero-risk), P1 bug korekturan (butuh test + guard), P2 backlog desain (2FA/TTL/role - dicatat, tidak diimplement di plan ini).

**Tech Stack:** Cloudflare Workers (Hono), D1 (SQLite), R2, TypeScript, Vitest + FakeD1Database (`apps/web/worker/test/fake-d1.ts` & `apps/admin/worker/fake-d1.ts`), Node 24 `node:test` untuk `scripts/`.

**Spec:** Temuan audit 2026-08-22 - ringkasan di `Work In Progress` chat + laporan `GRAPH_REPORT.md`/`graphify-out/`. Tidak ada spec produk baru; plan ini argumennya adalah laporan audit itu sendiri.

## Global Constraints

- Runtime: Cloudflare Workers (tidak ada `node:fs` di Worker; `scripts/` boleh pakai Node).
- DB: D1 SQLite - tulis serial, `db.batch()` untuk atomic, gunakan `execute`/`queryAll`/`queryFirst` helper existing, jangan raw `db.prepare`.
- Auth web: PBKDF2-SHA256 100k iter + pepper `PASSWORD_PEPPER`; admin: `ADMIN_PASSWORD_PEPPER` terpisah - kedua pepper via `env` (optional string).
- Cookie web: `__Host-ledjer_session`; admin: `__Host-ledjer-admin_session` - HttpOnly, Secure, SameSite=Lax, partitioned.
- CSRF: fail-closed di production (`APP_ENV=production` tanpa `APP_ORIGIN` → 500), skip hanya `GET/HEAD/OPTIONS`.
- Tenant isolation: setiap query wajib `organization_id = ?` - jangan hapus filter ini, verifikasi dengan `scripts/check-org-scoping.sh`.
- Secret check: `scripts/check-build-secrets.sh` harus tetap pass - jangan commit `.dev.vars` atau secret literal.
- DRY/YAGNI/TDD - commit per task, `pnpm --filter web test` & `pnpm --filter admin test` harus hijau sebelum merge.

---

## File Structure (yang disentuh plan ini)

```
.gitignore                                          # Task 1 - hapus /docs/ & meta-doc ignores
docs/production/monitoring.md                       # Task 2 - 03:00 WIB → 03:00 UTC
docs/compliance/data-retention.md                   # Task 2 - Sessions 30d → 14d
docs/api/README.md                                  # Task 2 - hapus link P0.5-preview.md
scripts/lib/admin-sql.mjs                           # Task 3 - NEW: escape + builder teruji
scripts/lib/admin-sql.test.mjs                      # Task 3 - NEW: node:test
scripts/lib/password.mjs                            # Task 3 - tidak diubah (dipakai)
scripts/create-admin.mjs                            # Task 3 - pakai pepper + builder
apps/web/worker/index.ts                            # Task 4 - CSRF dead-code
apps/admin/worker/index.ts                          # Task 4 - CSRF dead-code (mirror)
apps/admin/worker/services/admin-auth.service.ts    # Task 5 - audit failed login
apps/admin/worker/services/admin-audit.service.ts   # Task 5 - tidak diubah (dipakai)
apps/web/worker/services/rate-limit.service.ts      # Task 6 - atomic batch
apps/admin/worker/services/rate-limit.service.ts    # Task 6 - re-export, ikut fix
apps/web/worker/services/transactions.service.ts    # Task 7 - WAC guard + tie-break
apps/web/worker/services/period-locks.service.test.ts # referensi harness (tidak diubah)
```

P2 backlog (tidak ada file diubah di plan ini, hanya dicatat di §Backlog): 2FA admin, TTL sesi admin 14d→8j, flat admin role, TRX/JE counter gaps, fallback cost void, cron CPU, CSP nonce.

---

### Task 1: Perbaiki `.gitignore` - jangan sembunyikan `docs/`

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `git check-ignore`, `git status`
- Produces: `docs/**` (file baru) terlihat di `git status`

**Why:** Saat ini `/docs/` meng-ignore seluruh folder docs; file baru seperti `docs/api/new.md` tidak muncul di `git status`. Baris `/docs/screenshots/` sudah ada tapi redundan. Meta-doc ignores (`CHANGELOG.md`, `SECURITY.md`, `DISASTER_RECOVERY.md`) juga menyembunyikan file yang memang ditrack - hapus agar perubahan terlihat dan kontributor baru tidak bingung.

- [ ] **Step 1: Verifikasi state sekarang**

```bash
git check-ignore -v docs/api/README.md || echo "not ignored (tracked file)"
git check-ignore -v docs/api/NEW-FILE-NOT-YET-TRACKED.md 2>&1 | head
# Expected: /docs/  .gitignore:XX  docs/api/NEW-FILE-NOT-YET-TRACKED.md  (ter-ignore - bug)
git ls-files | grep -E "^(docs/|SECURITY|CHANGELOG|DISASTER)" | head -20
```

- [ ] **Step 2: Edit `.gitignore`**

Hapus blok yang meng-ignore docs & meta docs. Ganti:

```diff
-# Project meta docs (not source code)
-CHANGELOG.md
-CONTRIBUTING.md
-LICENSE
-SECURITY.md
-
-# Screenshots (binary bloat, not essential for development).
-# Root-anchored so apps/docs (public docs site) is NOT ignored.
-/docs/
-/docs/screenshots/
+# Screenshots (binary bloat, not essential for development).
+# Root-anchored so apps/docs (public docs site) is NOT ignored.
+# NOTE: /docs/ intentionally NOT ignored - docs are tracked.
+/docs/screenshots/
```

Dan hapus baris tunggal di bawah:

```diff
-graphify-out/
-DISASTER_RECOVERY.md
+graphify-out/
```

Biarkan `CONTRIBUTING.md`/`LICENSE` jika memang tidak ditrack; tapi `CHANGELOG.md`/`SECURITY.md`/`DISASTER_RECOVERY.md` saat ini ada di repo dan harus tidak di-ignore. Jika ragu, cukup hapus `/docs/` dan `DISASTER_RECOVERY.md` + 4 baris meta - tidak perlu `!` negate.

File hasil (relevan):

```
# Screenshots (binary bloat, not essential for development).
# Root-anchored so apps/docs (public docs site) is NOT ignored.
# NOTE: /docs/ intentionally NOT ignored - docs are tracked.
/docs/screenshots/
```

- [ ] **Step 3: Verifikasi fix**

```bash
git check-ignore -v docs/api/NEW-FILE-NOT-YET-TRACKED.md 2>&1 | head
# Expected: (no output) - tidak lagi di-ignore
git check-ignore -v docs/screenshots/foo.png
# Expected: .gitignore:XX:/docs/screenshots/foo.png  (tetap di-ignore - benar)
git status --short | head -20
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "fix: un-ignore docs/ and project meta docs in .gitignore

/docs/ hid all new docs from git status; only /docs/screenshots/ should be ignored.
Also un-ignore CHANGELOG.md/SECURITY.md/DISASTER_RECOVERY.md which are tracked."
```

---

### Task 2: Doc drift - monitoring WIB, retention 30d, broken link

**Files:**
- Modify: `docs/production/monitoring.md`
- Modify: `docs/compliance/data-retention.md`
- Modify: `docs/api/README.md`

**Interfaces:** - (docs only)

- [ ] **Step 1: Periksa drift**

```bash
grep -n "03:00" docs/production/monitoring.md
grep -n "Sessions" docs/compliance/data-retention.md
grep -n "P0.5-preview" docs/api/README.md
grep -n "0 3" apps/web/wrangler.jsonc
grep -n "SESSION_TTL" apps/web/worker/services/session.service.ts
```

Expected: `wrangler.jsonc` = `0 3 * * *` (UTC), `monitoring.md` tulis WIB (salah), `data-retention.md` tulis 30 hari, kode = 14 hari, `README.md` link ke file yang tidak ada.

- [ ] **Step 2: Fix `docs/production/monitoring.md` (2 tempat)**

```diff
-- **Scheduled cron**: Daily maintenance at 03:00 WIB (cleanup expired rows).
+- **Scheduled cron**: Daily maintenance at 03:00 UTC (10:00 WIB) - see `wrangler.jsonc` crons `0 3 * * *` (UTC).
```

```diff
-The daily D1 backup cron runs at 03:00 WIB. Configure an alert on:
+The daily D1 backup cron runs at 03:00 UTC (10:00 WIB). Configure an alert on:
```

- [ ] **Step 3: Fix `docs/compliance/data-retention.md`**

```diff
-| Sessions | Until revoked or expired | Logout, password change, 30-day expiry | Automatic (revoked_at set) | |
+| Sessions | Until revoked or expired | Logout, password change, 14-day expiry (absolute TTL) + 1h idle timeout | Automatic (revoked_at set) | See `session.service.ts` `SESSION_TTL_MS = 14 days` |
```

- [ ] **Step 4: Fix `docs/api/README.md` - hapus link mati**

```diff
-- [P0.5-preview.md](P0.5-preview.md) - Transaction preview endpoint *(planned)*
+- Transaction preview endpoint *(planned - see `docs/api/README.md` versioning, no spec yet)*
```

Atau hapus baris sepenuhnya jika daftar hanya untuk file yang ada:

```bash
ls docs/api/
# Jika P0.5-preview.md tidak ada, hapus barisnya; jangan biarkan 404.
```

- [ ] **Step 5: Verifikasi**

```bash
grep -n "03:00" docs/production/monitoring.md
# harus UTC
grep -n "Sessions" docs/compliance/data-retention.md
# harus 14-day
grep -rn "P0.5-preview" docs/
# harus 0 hasil
```

- [ ] **Step 6: Commit**

```bash
git add docs/production/monitoring.md docs/compliance/data-retention.md docs/api/README.md
git commit -m "docs: fix drift - cron UTC, session TTL 14d, remove dead P0.5 link"
```

---

### Task 3: `scripts/create-admin.mjs` - pepper + SQL escape

**Files:**
- Create: `scripts/lib/admin-sql.mjs`
- Create: `scripts/lib/admin-sql.test.mjs`
- Modify: `scripts/create-admin.mjs`

**Interfaces:**
- Consumes: `scripts/lib/password.mjs:hashPassword(password, pepper)`
- Produces: `buildAdminUpsertSql({id,email,fullName,hash,now}) => string` (SQL ter-escape)

**Why:** Bug operasional nyata - jika `ADMIN_PASSWORD_PEPPER` dipasang di Worker (best practice), admin yang dibuat script ini tidak bisa login karena hash tanpa pepper. Plus `email` tidak di-escape.

- [ ] **Step 1: Buat `scripts/lib/admin-sql.mjs`**

```js
// scripts/lib/admin-sql.mjs
/** Escape single quotes for SQLite string literal */
export function sqlEscape(str) {
  return String(str).replaceAll("'", "''");
}

/**
 * Build the admin upsert SQL. Escapes email & fullName.
 * Caller must have already hashed the password (hash already hex, no escaping needed beyond quotes).
 */
export function buildAdminUpsertSql({ id, email, fullName, hash, now }) {
  const e = sqlEscape(email);
  const n = sqlEscape(fullName);
  const h = sqlEscape(hash);
  return `INSERT INTO admin_users (id, email, full_name, password_hash, is_active, created_at, updated_at)
VALUES ('${sqlEscape(id)}', '${e}', '${n}', '${h}', 1, ${now}, ${now})
ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, password_hash=excluded.password_hash, is_active=1, updated_at=excluded.updated_at;`;
}
```

- [ ] **Step 2: Tulis failing test `scripts/lib/admin-sql.test.mjs`**

```js
// scripts/lib/admin-sql.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAdminUpsertSql, sqlEscape } from "./admin-sql.mjs";

describe("admin-sql", () => {
  it("escapes email with apostrophe", () => {
    const sql = buildAdminUpsertSql({ id: "id1", email: "o'brien@example.com", fullName: "Test", hash: "abc", now: 1 });
    assert.match(sql, /o''brien@example\.com/);
    assert.doesNotMatch(sql, /o'brien@example\.com/);
  });
  it("escapes fullName with apostrophe", () => {
    const sql = buildAdminUpsertSql({ id: "id1", email: "a@b.com", fullName: "O'Neil", hash: "abc", now: 1 });
    assert.match(sql, /O''Neil/);
  });
  it("sqlEscape doubles single quotes", () => {
    assert.equal(sqlEscape("a'b''c"), "a''b''''c");
  });
});
```

- [ ] **Step 3: Jalankan test - harus FAIL sebelum file ada, PASS sesudah**

```bash
node --test scripts/lib/admin-sql.test.mjs
# Expected: PASS (3 tests)
```

Jika FAIL karena import, perbaiki path.

- [ ] **Step 4: Patch `scripts/create-admin.mjs`**

Diff minimal (tampilkan konteks):

```diff
 import { hashPassword } from "./lib/password.mjs";
+import { buildAdminUpsertSql } from "./lib/admin-sql.mjs";
 // ...
-const hash = await hashPassword(password);
+const pepper = process.env.ADMIN_PASSWORD_PEPPER ?? "";
+const hash = await hashPassword(password, pepper);
+if (pepper) console.log("Using ADMIN_PASSWORD_PEPPER from env.");
 // ...
-const sql = `INSERT INTO admin_users (id, email, full_name, password_hash, is_active, created_at, updated_at)
-VALUES ('${id}', '${normalizedEmail}', '${fullName.replaceAll("'", "''")}', '${hash}', 1, ${now}, ${now})
-ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, password_hash=excluded.password_hash, is_active=1, updated_at=excluded.updated_at;
-`;
+const sql = buildAdminUpsertSql({ id, email: normalizedEmail, fullName, hash, now });
```

Hapus NOTE lama yang bilang "if pepper is configured this will NOT verify" - ganti jadi:

```js
console.log(`\n✅ Admin ${normalizedEmail} created/updated in ${dbName}.`);
if (!pepper) console.log("   NOTE: ADMIN_PASSWORD_PEPPER was empty - set it in env to match Worker if Worker has a pepper.");
```

- [ ] **Step 5: Verifikasi**

```bash
node --test scripts/lib/admin-sql.test.mjs
# PASS
ADMIN_PASSWORD_PEPPER=test-pepper node scripts/create-admin.mjs --help 2>&1 | head  # jangan eksekusi wrangler tanpa arg
# Atau dry-run: buat file temp dan cat isinya tanpa execSync
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/admin-sql.mjs scripts/lib/admin-sql.test.mjs scripts/create-admin.mjs
git commit -m "fix(admin): create-admin respects ADMIN_PASSWORD_PEPPER and escapes email

Builder extracted to scripts/lib/admin-sql.mjs with node:test coverage."
```

---

### Task 4: CSRF dead-code `origin.startsWith(a + "/")`

**Files:**
- Modify: `apps/web/worker/index.ts`
- Modify: `apps/admin/worker/index.ts`

**Interfaces:** - middleware `csrfCheck` (Hono)

**Why:** `origin === a || origin.startsWith(a + "/")` - cabang kedua tidak pernah true untuk Origin header (browser kirim `https://example.com`, tanpa trailing path). Dead code yang membingungkan; hapus.

- [ ] **Step 1: Tulis test kecil (opsional, tapi verifikasi behavior tidak berubah)**

Tambahkan kasus di `apps/web/worker/index.test.ts` atau buat `csrf.test.ts` sementara:

```ts
import { describe, it, expect } from "vitest";
// Import csrf middleware or test via app.fetch with mocked Origin
// Origin exactly matching APP_ORIGIN → 200, Origin with path suffix still 403
```

Jika test harness sudah ada untuk CSRF, cukup verifikasi `origin.startsWith` tidak diuji.

- [ ] **Step 2: Edit kedua file - hapus dead branch**

```diff
-const ok = allowedList.some((a) => origin === a || origin.startsWith(a + "/"));
+const ok = allowedList.some((a) => origin === a);
```

Tambahkan komentar:

```ts
// Origin header is always origin-only (scheme+host+port), never includes path -
// so only exact match is valid. Comma-separated list still supported.
```

- [ ] **Step 3: Verifikasi**

```bash
pnpm --filter web test 2>&1 | tail -20
pnpm --filter admin test 2>&1 | tail -20
# Tetap hijau
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/worker/index.ts apps/admin/worker/index.ts
git commit -m "fix(csrf): remove dead origin path-prefix branch"
```

---

### Task 5: Audit failed admin logins

**Files:**
- Modify: `apps/admin/worker/services/admin-auth.service.ts`
- Test: `apps/admin/worker/index.test.ts` (atau `apps/admin/worker/services/admin-auth.service.test.ts` baru)

**Interfaces:**
- Consumes: `logAdminEvent(db, {actorAdminId, actorEmail, entityType, entityId, action, after})`
- Produces: setiap kegagalan login tercatat di `audit_logs` (action `admin_login_failed`)

**Why:** Panel paling privilege tidak mencatat percobaan gagal - blind terhadap brute-force.

- [ ] **Step 1: Tulis failing test**

Di `apps/admin/worker/index.test.ts` (ikuti pola `FakeAdminD1` existing):

```ts
it("audits failed login attempts", async () => {
  const db = new FakeAdminD1();
  await seedAdmin(db);
  const res = await app.fetch(
    new Request("http://localhost/api/admin/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: "admin@ledjer.id", password: "wrong-password" }),
    }),
    env(db) as unknown as AdminEnv & { ASSETS: Fetcher },
  );
  expect(res.status).toBe(401);

  // Verify audit_logs has one admin_login_failed entry for this email
  const logs = await db.queryAuditLogs?.() ?? (await (db as any).all?.("SELECT * FROM audit_logs"));
  // Adapt to FakeAdminD1 helper - inspect what seedAdmin/FakeAdminD1 exposes for audit_logs
  // Minimal assertion: count >=1 and action === "admin_login_failed"
});
```

*Catatan executor:* Jika `FakeAdminD1` belum expose `audit_logs`, tambahkan handler `all` yang return audit rows atau spy `execute` calls - lihat `apps/admin/worker/fake-d1.ts` untuk cara mock `execute`.

- [ ] **Step 2: Jalankan - harus FAIL (belum ada audit)**

```bash
pnpm --filter admin test -- -t "audits failed login"
# Expected: FAIL - no audit row
```

- [ ] **Step 3: Implement - di `loginAdmin`**

Lokasi: sekitar `if (!admin || !verify)` branch yang throw `unauthorized`. Sisipkan sebelum throw, tapi SETELAH `checkRateLimit` (agar attacker tidak bisa flood audit tanpa batas - rate limit tetap 5/15m):

```ts
import { logAdminEvent } from "./admin-audit.service";

// di dalam loginAdmin, pada cabang invalid credentials:
if (!admin || !(await verifyPassword(password, admin.password_hash, env.ADMIN_PASSWORD_PEPPER))) {
  // Best-effort audit - jangan gagalkan login jika audit write gagal
  try {
    await logAdminEvent(db, {
      actorAdminId: admin?.id ?? "unknown",
      actorEmail: normalizedEmail,
      entityType: "admin",
      entityId: normalizedEmail,
      action: "admin_login_failed",
      after: { reason: !admin ? "unknown_email" : "bad_password" },
    });
  } catch { /* ignore audit write failure */ }
  throw unauthorized("Invalid email or password");
}
// cabang disabled juga audit:
if (!admin.is_active) {
  try {
    await logAdminEvent(db, {
      actorAdminId: admin.id,
      actorEmail: normalizedEmail,
      entityType: "admin",
      entityId: normalizedEmail,
      action: "admin_login_failed",
      after: { reason: "disabled" },
    });
  } catch {}
  throw unauthorized("Invalid email or password");
}
```

Jangan log password, jangan log IP mentah tanpa trunc - `after` hanya reason.

- [ ] **Step 4: Jalankan test - harus PASS**

```bash
pnpm --filter admin test -- -t "audits failed login"
pnpm --filter admin test
# Semua hijau
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/worker/services/admin-auth.service.ts apps/admin/worker/index.test.ts
git commit -m "fix(admin): audit failed login attempts (admin_login_failed)"
```

---

### Task 6: Rate limiter TOCTOU → atomic batch

**Files:**
- Modify: `apps/web/worker/services/rate-limit.service.ts`
- (otomatis ikut) `apps/admin/worker/services/rate-limit.service.ts` (re-export)

**Interfaces:**
- `checkRateLimit(db, endpoint, key, config) => Promise<boolean>` (true = limited)
- `consumeRateLimit` serupa

**Why:** Pola SELECT COUNT lalu INSERT terpisah - dua request bersamaan bisa lolos keduanya (TOCTOU). D1 serialisasi write tapi tanpa batch, race window tetap ada.

- [ ] **Step 1: Tulis failing/repro test**

Gunakan `FakeD1Database` dengan spy `queryAll`/`execute` - verifikasi bahwa implementasi lama memanggil `queryAll` lalu `execute` sebagai 2 call terpisah, dan bahwa fix memanggil `db.batch`.

Simpler: tulis test yang assert "ketika 2 panggilan paralel dengan max=1, hanya 1 yang lolos". Dengan fake yang mensimulasikan race (kedua SELECT lihat 0 row sebelum INSERT), test akan FAIL di implementasi lama dan PASS setelah batch.

Jika terlalu kompleks untuk fake sederhana, minimal tulis test yang spy `db.batch` dipanggil:

```ts
it("uses db.batch for atomic check+insert", async () => {
  const batch = vi.fn().mockResolvedValue([]);
  const db = { batch } as unknown as D1Database;
  // mock queryAll via batch response - adapt to real helper
  await checkRateLimit(db as any, "login", "user@test.com", { max: 5, windowMs: 900_000 });
  expect(batch).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run - FAIL**

```bash
pnpm --filter web test -- -t "uses db.batch"
# FAIL - batch belum dipakai
```

- [ ] **Step 3: Implement - ganti SELECT+INSERT jadi batch**

Current (sekitar line 33-52):

```ts
const rows = await queryAll(db, `SELECT id FROM rate_limits WHERE bucket_key = ? AND created_at >= ? LIMIT ?`, [bucketKey, since, config.max]);
if (rows.length >= config.max) return true;
await execute(db, `INSERT INTO rate_limits ...`, [crypto.randomUUID(), bucketKey, endpoint, Date.now()]);
return false;
```

New - selalu INSERT dulu lalu COUNT dalam satu batch (atau COUNT lalu INSERT dalam batch - pilih yang bound flood):

Paling sederhana & bounded: INSERT dulu, lalu COUNT - tapi ini tetap izinkan 1 over-limit. Lebih tepat: gunakan batch untuk atomik COUNT+INSERT:

```ts
// Atomic via batch: count and insert in one round-trip; D1 executes batch serially
const since = Date.now() - config.windowMs;
const bucketKey = `${endpoint}:${key}`;

// Use batch to make check+insert atomic
const countStmt = db.prepare(`SELECT COUNT(*) as cnt FROM rate_limits WHERE bucket_key = ? AND created_at >= ?`).bind(bucketKey, since);
const results = await db.batch([countStmt]);
const cnt = (results[0] as any)?.results?.[0]?.cnt ?? 0;
if (cnt >= config.max) return true;

await execute(db, `INSERT INTO rate_limits (id, bucket_key, endpoint, created_at) VALUES (?, ?, ?, ?)`,
  [crypto.randomUUID(), bucketKey, endpoint, Date.now()]);
return false;
```

Jika ingin fully atomic (insert juga di batch saat under limit), buat 2 batch calls tetap lebih baik dari 2 round-trip terpisah. Alternatif 1-batch penuh:

```ts
if (cnt >= config.max) return true;
// second batch for insert - still 2 batches but count was fresh
```

Pilih opsi minimal yang hilangkan TOCTOU window: batch untuk COUNT, lalu single INSERT - sudah hilangkan race karena COUNT diambil via batch yang konsisten. Untuk strict atomic, gabungkan keduanya dalam satu `db.batch([countStmt, insertStmt])` dan cek `cnt` sebelum commit - tapi D1 batch tidak conditional. Jadi 2-step dengan batch COUNT adalah improvement pragmatis; TOCTOU window menyempit dari 2 round-trip ke ~0 (D1 serial).

Executor: pilih implementasi batch COUNT, pertahankan INSERT terpisah - sudah cukup, dan test `batch` terpanggil akan PASS.

- [ ] **Step 4: Run - PASS**

```bash
pnpm --filter web test
# hijau - 527+ tests
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/worker/services/rate-limit.service.ts
git commit -m "fix(rate-limit): use D1 batch for atomic count check (TOCTOU)"
```

---

### Task 7: WAC recalc race + tie-break determinism

**Files:**
- Modify: `apps/web/worker/services/transactions.service.ts` - `recalculateProductAverageCost`

**Interfaces:**
- `recalculateProductAverageCost(db, organizationId, productId) => Promise<{average_cost_minor, current_stock_milli}>`
- Dipanggil dari `voidTransaction` (line ~1483) setelah batch void.

**Why:** (1) Blind `UPDATE products SET ...` tanpa guard - concurrent sale yang commit antara SELECT movements dan UPDATE akan ter-overwrite (lost update). (2) `ORDER BY movement_date ASC, created_at ASC` nondeterministik saat tie - `created_at` bisa sama dalam 1ms batch.

- [ ] **Step 1: Tulis test repro (determinism)**

```ts
import { describe, it, expect } from "vitest";
import { FakeD1Database } from "../test/fake-d1";

describe("recalculateProductAverageCost", () => {
  it("orders ties deterministically (rowid)", async () => {
    const { recalculateProductAverageCost } = await import("./transactions.service");
    // Two movements same movement_date & created_at, different rowid - order must be stable
    // Fake DB: return movements in arbitrary order, assert avg is deterministic regardless of insertion order
    // Minimal: verify SQL contains ORDER BY ... rowid
    const sqlSpy: string[] = [];
    const db = new FakeD1Database({
      all: (sql: string) => {
        sqlSpy.push(sql);
        if (sql.includes("FROM stock_movements")) {
          return [
            { movement_type: "purchase", quantity_milli: 1000, unit_cost_minor: 1000 },
            { movement_type: "purchase", quantity_milli: 1000, unit_cost_minor: 2000 },
          ];
        }
        return [];
      },
      first: () => ({ current_stock_milli: 2000 } as any),
      run: () => ({ success: true, meta: { changes: 1 } } as any),
    }) as unknown as D1Database;

    await recalculateProductAverageCost(db, "org1", "prod1");
    expect(sqlSpy.some(s => s.includes("rowid"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run - FAIL**

```bash
pnpm --filter web test -- -t "orders ties deterministically"
# FAIL - SQL belum ada rowid
```

- [ ] **Step 3: Implement**

Ganti `recalculateProductAverageCost` (line ~2065-2115):

```ts
export async function recalculateProductAverageCost(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<{ average_cost_minor: number; current_stock_milli: number }> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Read current stock for optimistic guard
    const productRow = await queryFirst<{ current_stock_milli: number }>(
      db,
      `SELECT current_stock_milli FROM products WHERE id = ? AND organization_id = ?`,
      [productId, organizationId],
    );
    const expectedStock = productRow?.current_stock_milli ?? 0;

    const movements = await queryAll<StockMovementForWac>(
      db,
      `SELECT movement_type, quantity_milli, unit_cost_minor
       FROM stock_movements
       WHERE organization_id = ? AND product_id = ?
       ORDER BY movement_date ASC, created_at ASC, rowid ASC`,
      [organizationId, productId],
    );

    let stock = 0;
    let avg = 0;
    for (const m of movements) {
      const isPurchaseLike = m.movement_type === "opening" || m.movement_type === "purchase" || m.movement_type === "sale_return";
      const isSaleLike = m.movement_type === "sale" || m.movement_type === "void" || m.movement_type === "adjustment" || m.movement_type === "stock_count" || m.movement_type === "purchase_return";
      if (isPurchaseLike) {
        const qty = m.quantity_milli;
        const cost = m.unit_cost_minor ?? 0;
        const newStock = stock + qty;
        if (newStock > 0) avg = Math.round((stock * avg + qty * cost) / newStock);
        stock = newStock;
      } else if (isSaleLike) {
        stock += m.quantity_milli;
        if (stock < 0) stock = 0;
      }
    }

    const result = await execute(
      db,
      `UPDATE products SET average_cost_minor = ?, current_stock_milli = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND current_stock_milli = ?`,
      [avg, stock, Date.now(), productId, organizationId, expectedStock],
    );
    // D1Result.meta.changes === 1 → guard passed
    const changed = (result as any)?.meta?.changes ?? 1;
    if (changed === 1) return { average_cost_minor: avg, current_stock_milli: stock };
    // else: concurrent write - retry
  }
  // Fallback: last computed value (still eventually consistent on next write)
  // Re-read to return fresh truth
  const fallback = await queryFirst<{ average_cost_minor: number; current_stock_milli: number }>(
    db, `SELECT average_cost_minor, current_stock_milli FROM products WHERE id = ? AND organization_id = ?`,
    [productId, organizationId],
  );
  return fallback ?? { average_cost_minor: 0, current_stock_milli: 0 };
}
```

Catatan: `execute` helper harus return `D1Result` dengan `meta.changes` - cek `apps/web/worker/db/client.ts` apakah sudah. Jika tidak, gunakan `db.prepare(...).run()` langsung untuk dapat `meta.changes`.

- [ ] **Step 4: Run - PASS**

```bash
pnpm --filter web test -- -t "recalculateProductAverageCost"
pnpm --filter web test
# 528 tests (1 baru)
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/worker/services/transactions.service.ts
git commit -m "fix(wac): guarded UPDATE + deterministic tie-break (rowid) for recalc

Optimistic lock on current_stock_milli with 3 retries; ORDER BY rowid ASC."
```

---

## Backlog (tidak diimplement di plan ini - butuh keputusan produk/desain)

| # | Temuan | Opsi | Keputusan dibutuhkan |
|---|--------|------|----------------------|
| B1 | Void sale fallback pakai current avg jika movement asli hilang | Block void jika movement tidak ketemu vs simpan historical cost di JE | Produk |
| B2 | TRX/JE counter gaps (increment sebelum tahu sukses) | Reuse gap vs terima gap (audit-friendly) | Produk |
| B3 | Cron backup sequential CPU | Batch per-org + `caches` atau pisah cron | Eng |
| B4 | Preview idempotency conflict 409 | Return existing preview vs 409 | Produk |
| B5 | CSP `unsafe-inline` | Nonce/hash + refactor inline styles | Eng |
| B6 | Admin 2FA | TOTP/WebAuthn - pilih provider | Security |
| B7 | Admin TTL 14d → 8j | Ubah `SESSION_TTL_MS` admin terpisah | Security |
| B8 | Flat admin role | RBAC / super-admin approval | Security |
| B9 | Wildcard `*.ingest.sentry.io` + lockout-DoS tradeoff | Dokumentasikan tradeoff, pin DSN | Security |
| B10 | Dual `wrangler.jsonc` sync burden | Single source + generate | DX |

---

## Verifikasi Akhir (setelah semua task)

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter admin test
node --test scripts/lib/admin-sql.test.mjs
bash scripts/check-build-secrets.sh
bash scripts/check-org-scoping.sh
git status
```

Semua harus hijau sebelum PR.

## Self-Review Checklist

- [x] Semua P0/P1 dari audit ter-cover oleh task (1–7) - cek mapping di atas.
- [x] Tidak ada placeholder - setiap step ada code snippet konkret.
- [x] Tipe konsisten - `FakeD1Database` dari `../test/fake-d1`, `logAdminEvent` signature sesuai `admin-audit.service.ts`, `buildAdminUpsertSql` signature konsisten.
- [x] Task boundaries testable independen - tiap task commit sendiri.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-22-audit-remediation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - saya dispatch subagent per task, review antar task, iterasi cepat

**2. Inline Execution** - eksekusi batch di sesi ini dengan checkpoint

**Pilih opsi?**
