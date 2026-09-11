# Quick Entry Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat input di halaman Transaksi yang memahami `jual|beli <produk> <qty> <harga>` dan mencatat via endpoint existing setelah pratinjau editabel.

**Architecture:** Parser murni client-side (`src/lib/quick-entry.ts`, tanpa I/O) + komponen `QuickEntryBar` (input, preview, konfirmasi) yang memanggil `postTransaction` existing. Tanpa endpoint/migrasi baru.

**Tech Stack:** React + TanStack Query + Tailwind (pola `src/pages/products/index.tsx`, `src/pages/reports/general-ledger.tsx`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-quick-entry-chat-design.md`

## Global Constraints

- TDD: tes gagal dulu, saksikan gagal, baru implementasi; satu variabel per perbaikan.
- Bahasa UI: Indonesia; copy error persis seperti di langkah (jangan parafrase).
- Mobile: input `font-size ≥ 16px`, target sentuh ≥ 44px, `enterKeyHint="send"`.
- Uang: integer rupiah; qty maks 3 desimal; tanpa konversi satuan diam-diam.
- Tanpa `any` eksplisit; `pnpm exec tsc -b`, `eslint`, `vitest`, `build` hijau tiap task.
- Satu commit per task; jangan sentuh production; staging/lokal saja.

---

## File Structure

- Baru `apps/web/src/lib/quick-entry.ts` — parser + matcher murni:
  `parseQuickEntryText`, `matchProducts`, `buildDraft`, `levenshtein`,
  tipe `QuickEntryParseResult`, `QuickEntryDraft`, `ProductLite`.
- Baru `apps/web/src/lib/quick-entry.test.ts` — ±25 kasus parser + matcher.
- Baru `apps/web/src/components/transactions/QuickEntryBar.tsx` —
  input + pratinjau + konfirmasi (komposisi komponen kecil satu file).
- Baru `apps/web/src/__tests__/quick-entry-bar.test.tsx` — test komponen.
- Ubah `apps/web/src/pages/transactions/index.tsx` — sisip `<QuickEntryBar/>`
  + CTA sticky mobile.
- Ubah `apps/web/e2e/quick-entry.spec.ts` (baru, pola `products.spec.ts`) —
  1 happy path lokal.
- Baca-saja: `src/lib/api/transactions.ts` (`postTransaction`,
  `PostTransactionInput`), `src/lib/api/products.ts` (`listProducts`),
  `src/lib/api/accounts.ts` (`listAccounts`, `listCashBankAccounts`).

---

### Task 1: Parser inti (verb + nama + qty + harga satuan)

**Files:**
- Create: `apps/web/src/lib/quick-entry.ts`
- Test: `apps/web/src/lib/quick-entry.test.ts`

**Interfaces:**
- Consumes: tidak ada.
- Produces:
  - `parseQuickEntryText(text: string): QuickEntryParseResult`
  - `type QuickEntryParseResult = { ok: true; kind: "sale" | "purchase"; productQuery: string; quantity: number; unit?: string; unitPriceIdr?: number; totalIdr?: number } | { ok: false; message: string }`
  - Aturan Task 1: harga telanjang bulat (`50000`) = satuan; `total` dan sufiks ditunda ke Task 2 (kembalikan error `Harga belum didukung, contoh: jual kopi 10pcs 50000` bila pola tak cocok).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/quick-entry.test.ts
import { describe, expect, it } from "vitest";
import { parseQuickEntryText } from "./quick-entry";

describe("parseQuickEntryText (inti)", () => {
  it("memahami jual dengan qty dan harga satuan", () => {
    expect(parseQuickEntryText("jual kopi 10pcs 50000")).toEqual({
      ok: true, kind: "sale", productQuery: "kopi",
      quantity: 10, unit: "pcs", unitPriceIdr: 50000, totalIdr: undefined,
    });
  });
  it("memahami beli tanpa satuan", () => {
    expect(parseQuickEntryText("Beli gula 5 20000")).toEqual({
      ok: true, kind: "purchase", productQuery: "gula",
      quantity: 5, unit: undefined, unitPriceIdr: 20000, totalIdr: undefined,
    });
  });
  it("menolak kata kerja asing dengan pesan contoh", () => {
    expect(parseQuickEntryText("makan kopi 10 50000")).toEqual({
      ok: false, message: "Contoh: jual kopi 10pcs 50000",
    });
  });
  it("menolak qty nol", () => {
    expect(parseQuickEntryText("jual kopi 0 50000").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/quick-entry.test.ts`
Expected: FAIL with "Failed to resolve import ./quick-entry".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/quick-entry.ts
export type QuickEntryParseResult =
  | {
      ok: true;
      kind: "sale" | "purchase";
      productQuery: string;
      quantity: number;
      unit?: string;
      unitPriceIdr?: number;
      totalIdr?: number;
    }
  | { ok: false; message: string };

const HELP = "Contoh: jual kopi 10pcs 50000";

export function parseQuickEntryText(text: string): QuickEntryParseResult {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  const verbMatch = /^(jual|beli)\s+(.+)$/.exec(normalized);
  if (!verbMatch) return { ok: false, message: HELP };
  const kind = verbMatch[1] === "jual" ? "sale" : "purchase";
  const rest = verbMatch[2].replace(/^rp\s*/i, "");
  const tailMatch = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-z]*)\s+(\d+)\s*$/.exec(rest);
  if (!tailMatch) return { ok: false, message: HELP };
  const productQuery = tailMatch[1].trim();
  const quantity = Number(tailMatch[2].replace(",", "."));
  const unit = tailMatch[3] === "" ? undefined : tailMatch[3];
  const unitPriceIdr = Number(tailMatch[4]);
  if (!productQuery || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: HELP };
  }
  if (!Number.isInteger(unitPriceIdr) || unitPriceIdr <= 0) {
    return { ok: false, message: HELP };
  }
  return { ok: true, kind, productQuery, quantity, unit, unitPriceIdr, totalIdr: undefined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/quick-entry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quick-entry.ts apps/web/src/lib/quick-entry.test.ts
git commit -m "feat(quick-entry): core parser for jual/beli with qty and unit price"
```

---

### Task 2: Varian harga (rb/ribu/jt/juta, pemisah, koma desimal, keyword total)

**Files:**
- Modify: `apps/web/src/lib/quick-entry.ts`
- Test: `apps/web/src/lib/quick-entry.test.ts`

**Interfaces:**
- Consumes: `parseQuickEntryText` dari Task 1 (tanda tangan sama).
- Produces: perilaku tambahan yang sama persis:
  - `50rb`, `50 rb`, `50ribu` → 50000; `1,5jt`, `1juta`, `1 jt` → 1500000;
    `50.000` → 50000; `2,5` sebagai qty → 2.5.
  - `total 500rb` di posisi harga → `{ unitPriceIdr: undefined, totalIdr: 500000 }`.
  - Harga pecahan (`50000.5`) → error.

- [ ] **Step 1: Write the failing tests (append describe baru)**

```ts
describe("parseQuickEntryText (varian harga)", () => {
  it.each([
    ["jual kopi 10pcs 50rb", 50000, undefined],
    ["jual kopi 10pcs 50 ribu", 50000, undefined],
    ["jual kopi 10pcs 50.000", 50000, undefined],
    ["jual kopi 10pcs 1,5jt", 1500000, undefined],
    ["beli gula 5kg 1juta", 1000000, undefined],
  ])("memahami %s", (text, price) => {
    const result = parseQuickEntryText(text);
    expect(result).toMatchObject({ ok: true, unitPriceIdr: price });
  });
  it("memahami qty desimal koma", () => {
    expect(parseQuickEntryText("beli gula 2,5kg 20000")).toMatchObject({
      ok: true, quantity: 2.5, unit: "kg", unitPriceIdr: 20000,
    });
  });
  it("memahami keyword total", () => {
    expect(parseQuickEntryText("jual kopi 10pcs total 500rb")).toMatchObject({
      ok: true, unitPriceIdr: undefined, totalIdr: 500000,
    });
  });
  it("menolak harga pecahan", () => {
    expect(parseQuickEntryText("jual kopi 10 50000.5").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/quick-entry.test.ts`
Expected: FAIL (5+1+1+1 kasus baru gagal; inti tetap hijau).

- [ ] **Step 3: Write minimal implementation**

Ganti ekstraksi harga di `parseQuickEntryText` dengan dua helper
di file yang sama (tanpa mengubah tanda tangan):

```ts
function parsePriceToken(token: string): number | null {
  const cleaned = token.toLowerCase().replace(/\s+/g, "");
  const match = /^(\d+(?:[.,]\d+)?)(rb|ribu|jt|juta)?$/.exec(cleaned);
  if (!match) return null;
  const [, digits, suffix] = match;
  // Titik = pemisah ribuan ("50.000"); koma = desimal ("1,5").
  const normalized = suffix || digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : digits.replace(/\./g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const multiplier = suffix === "jt" || suffix === "juta" ? 1_000_000
    : suffix === "rb" || suffix === "ribu" ? 1_000 : 1;
  const result = value * multiplier;
  return Number.isInteger(result) ? result : null;
}
```

dan cabang `total`:

```ts
  // ... setelah productQuery/quantity/unit terurai dari ekor:
  const pricePart = <sisa string setelah qty+unit>.trim();
  const totalMatch = /^total\s+(.+)$/i.exec(pricePart);
  if (totalMatch) {
    const totalIdr = parsePriceToken(totalMatch[1]);
    if (totalIdr === null || totalIdr <= 0) return { ok: false, message: HELP };
    return { ok: true, kind, productQuery, quantity, unit, unitPriceIdr: undefined, totalIdr };
  }
  const unitPriceIdr = parsePriceToken(pricePart);
  if (unitPriceIdr === null || unitPriceIdr <= 0) return { ok: false, message: HELP };
  return { ok: true, kind, productQuery, quantity, unit, unitPriceIdr, totalIdr: undefined };
```

Regex ekor Task 1 boleh disesuaikan agar `pricePart` mentah
tertangkap (nama produk = greedy awal, qty = angka pertama
setelah nama, sisanya = pricePart). Contoh bentuk akhir ekor:

```ts
  const tailMatch = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-z]*)\s+(.+?)\s*$/.exec(rest);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/quick-entry.test.ts`
Expected: PASS (semua kasus inti + varian).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quick-entry.ts apps/web/src/lib/quick-entry.test.ts
git commit -m "feat(quick-entry): price variants rb/jt, separators, total keyword"
```

---

### Task 3: Pencocokan produk + draft (typo-toleran, filter stok)

**Files:**
- Modify: `apps/web/src/lib/quick-entry.ts`
- Test: `apps/web/src/lib/quick-entry.test.ts`

**Interfaces:**
- Consumes: `QuickEntryParseResult` (Task 1–2).
- Produces:
  - `interface ProductLite { id: string; name: string; unit: string; is_active: number; current_stock: number }`
  - `levenshtein(a: string, b: string): number` (jarak sunting standar).
  - `matchProducts(query: string, products: ProductLite[], kind: "sale" | "purchase"): { id: string; name: string }[]` —
    kandidat terurut (exact > awalan > mengandung > typo jarak ≤ 2
    untuk nama ≥ 4 huruf); jual = aktif + stok > 0; beli = aktif.
  - `interface QuickEntryDraft { kind; productId: string; candidates: { id: string; name: string }[]; quantity: number; unit?: string; unitMismatch: boolean; unitPriceIdr: number; totalIdr: number; warnings: string[] }`
  - `buildDraft(parsed: Extract<QuickEntryParseResult, { ok: true }>, products: ProductLite[]): QuickEntryDraft | { error: string }` —
    0 kandidat → `{ error: "Produk 'X' tidak ditemukan. Buat dulu di halaman Produk." }`;
    harga dari `totalIdr` → `unitPriceIdr = Math.round(totalIdr / quantity)`;
    `unitMismatch = unit && unit !== produk.unit`; warning untuk
    pembulatan total dan mismatch satuan.

- [ ] **Step 1: Write the failing tests**

```ts
describe("matchProducts", () => {
  const catalog = [
    { id: "p1", name: "Kopi Tubruk", unit: "pcs", is_active: 1, current_stock: 14 },
    { id: "p2", name: "Kopi Susu", unit: "pcs", is_active: 1, current_stock: 0 },
    { id: "p3", name: "Gula", unit: "kg", is_active: 0, current_stock: 9 },
  ];
  it("exact di atas mengandung", () => {
    expect(matchProducts("kopi", catalog, "purchase").map((c) => c.id)).toEqual(["p1", "p2"]);
  });
  it("jual menyembunyikan stok kosong dan nonaktif", () => {
    expect(matchProducts("kopi", catalog, "sale").map((c) => c.id)).toEqual(["p1"]);
  });
  it("toleran typo 1 huruf", () => {
    expect(matchProducts("kopy", catalog, "purchase").map((c) => c.id)).toEqual(["p1", "p2"]);
  });
});

describe("buildDraft", () => {
  it("menghitung total dari satuan dan menandai mismatch satuan", () => {
    const parsed = parseQuickEntryText("jual kopi 10kg 50000");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const draft = buildDraft(parsed, [
      { id: "p1", name: "Kopi", unit: "pcs", is_active: 1, current_stock: 14 },
    ]);
    expect(draft).toMatchObject({
      productId: "p1", quantity: 10, unitPriceIdr: 50000,
      totalIdr: 500000, unitMismatch: true,
    });
  });
  it("total eksplisit dipecah ke satuan dengan pembulatan", () => {
    const parsed = parseQuickEntryText("jual kopi 3pcs total 100000");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(buildDraft(parsed, [
      { id: "p1", name: "Kopi", unit: "pcs", is_active: 1, current_stock: 14 },
    ])).toMatchObject({ unitPriceIdr: 33333, totalIdr: 100000 });
  });
  it("produk tak dikenal → error ramah", () => {
    const parsed = parseQuickEntryText("jual zebra 1 10000");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(buildDraft(parsed, [])).toEqual({
      error: "Produk 'zebra' tidak ditemukan. Buat dulu di halaman Produk.",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/quick-entry.test.ts -t "matchProducts"`
Expected: FAIL with "matchProducts is not defined" (dan buildDraft).

- [ ] **Step 3: Write minimal implementation** (fungsi-fungsi di atas
  di `src/lib/quick-entry.ts` persis sesuai tanda tangan; normalisasi
  nama = lowercase + rapikan spasi).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/quick-entry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quick-entry.ts apps/web/src/lib/quick-entry.test.ts
git commit -m "feat(quick-entry): typo-tolerant product matching and draft builder"
```

---

### Task 4: Komponen QuickEntryBar (input + pratinjau editabel + konfirmasi)

**Files:**
- Create: `apps/web/src/components/transactions/QuickEntryBar.tsx`
- Test: `apps/web/src/__tests__/quick-entry-bar.test.tsx`

**Interfaces:**
- Consumes: `parseQuickEntryText`, `matchProducts`, `buildDraft`
  (Task 1–3); `listProducts` (`src/lib/api/products.ts`);
  `listCashBankAccounts`, `listAccounts` (`src/lib/api/accounts.ts`,
  pendapatan = filter client `account_class === "income" && is_active === 1`);
  `postTransaction`, `PostTransactionInput` (`src/lib/api/transactions.ts`);
  `translateError` (`src/lib/errors.ts`); `toast` (`src/components/ui/toast`);
  pola query/mock persis `src/__tests__/products-expand.test.tsx`.
- Produces: `<QuickEntryBar />` tanpa props — alur:
  ketik + Kirim/Enter → kartu pratinjau (ringkasan + field edit:
  Produk dropdown kandidat, Qty, Harga satuan, Total, Akun kas)
  → Catat (disabled bila invalid) → `postTransaction` → toast +
  invalidate `products`, `transactions`, `dashboard` → reset.
  - sale: `{ transactionType: "cash_in", transactionDate: today,
    cashAccountId, counterAccountId: incomeAccountId,
    amountIdr: total, description: \`Jual {qty} {unit} {nama} (via cepat)\`,
    idempotencyKey: crypto.randomUUID(), items: [{ productId, quantity, unitPriceIdr }] }`
  - purchase: `{ transactionType: "purchase", ... tanpa counterAccountId/amountIdr,
    description: \`Beli ...\`, items: [{ productId, quantity, unitCostIdr }] }`
  - Error parse → kartu contoh ketuk-isi; 0 produk → error + link
    `/products`; multi → chip; stok kurang → inline + Catat mati.
  - Input: `font-size ≥ 16px` (class `text-base`), `enterKeyHint="send"`,
    tombol Kirim `min-h-[44px]`, hasil/error dalam `aria-live="polite"`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/quick-entry-bar.test.tsx
// Mock: @/contexts/auth-context, @/hooks/useOrganization (salin dari
// products-expand.test.tsx), @/lib/api/products (listProducts),
// @/lib/api/accounts (listAccounts, listCashBankAccounts),
// @/lib/api/transactions (postTransaction).
// Data: produk Kopi (stok 14, pcs, aktif); akun Kas (id kas-1);
// akun Pendapatan (id rev-1).
// Tes 1 "ketik jual → pratinjau tampil": isi input compact
// "jual kopi 10pcs 50000", klik Kirim → tampil teks "Rp500.000"
// dan tombol "Catat" enabled.
// Tes 2 "stok kurang mematikan Catat": "jual kopi 99pcs 50000"
// → tampil peringatan stok + tombol Catat disabled.
// Tes 3 "konfirmasi memanggil postTransaction bentuk sale":
// klik Catat → postTransaction dipanggil dengan
// { transactionType: "cash_in", counterAccountId: "rev-1",
//   amountIdr: 500000, items: [{ productId: "p-kopi", quantity: 10, unitPriceIdr: 50000 }] }
// (gunakan expect.objectContaining) + toast sukses (mock toast).
```

(Tulis lengkap mengikuti pola mock products-expand.test.tsx;
gagal karena komponen belum ada.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/__tests__/quick-entry-bar.test.tsx`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write minimal implementation**

`QuickEntryBar.tsx`: state `text`, `draft: QuickEntryDraft | null`,
`error: string | null`, field edit lokal (productId, quantity,
unitPriceIdr, totalIdr, cashAccountId, incomeAccountId), `useQuery`
produk (`queryKeys.products.all`) + akun kas + akun pendapatan
(enabled saat pratinjau dibuka agar ringan), `useMutation` atau
`postTransaction` langsung + `useQueryClient` invalidate
(`queryKeys.products.allProducts()`, `queryKeys.transactions.all()`,
`queryKeys.dashboard...` — samakan dengan invalidasi form
`new.tsx`; bila ragu pakai ketiga prefix di atas).
Ringkasan: `Jual {nama} ×{qty} @{unit} = {total} · stok {sisa}`.
Total override menghitung ulang satuan (`Math.round`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/__tests__/quick-entry-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/transactions/QuickEntryBar.tsx apps/web/src/__tests__/quick-entry-bar.test.tsx
git commit -m "feat(quick-entry): chat bar with editable preview and confirm"
```

---

### Task 5: Pasang di halaman Transaksi + CTA sticky mobile

**Files:**
- Modify: `apps/web/src/pages/transactions/index.tsx`
- Test: tambah 1 kasus di `apps/web/src/__tests__/quick-entry-bar.test.tsx`
  (render dalam route `/transactions`? tidak — cukup test HTML:
  render `TransactionsPage`? berat. Ganti: verifikasi manual +
  E2E Task 6. Task ini tanpa test baru — nyatakan eksplisit.)

**Interfaces:**
- Consumes: `<QuickEntryBar />` (Task 4).
- Produces: `/transactions` menampilkan chat card di atas daftar;
  tombol "Transaksi Baru" header dibungkus sticky mobile:
  `className="sticky bottom-[calc(56px+env(safe-area-inset-bottom,0px)+12px)] z-[var(--z-sticky)] lg:static"`
  pada pembungkus actions (desktop tak berubah).

- [ ] **Step 1: Edit halaman** — import + `<QuickEntryBar />` setelah
  `PageHeader`, sebelum filter/daftar; tambahkan class sticky
  pada container tombol "Transaksi Baru".

- [ ] **Step 2: Verifikasi render**

Run: `cd apps/web && pnpm exec tsc -b --pretty false && pnpm exec eslint src/pages/transactions/index.tsx src/components/transactions/QuickEntryBar.tsx && pnpm --filter web build 2>&1 | tail -1`
Expected: bersih + build sukses.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/transactions/index.tsx
git commit -m "feat(quick-entry): mount chat bar on transactions with sticky mobile CTA"
```

---

### Task 6: E2E happy path + kunci akhir

**Files:**
- Create: `apps/web/e2e/quick-entry.spec.ts` (pola `products.spec.ts`:
  nama unik per run, akun seeded, `@smoke` bila konvensi ada).
- Test: suite penuh + build.

**Interfaces:**
- Consumes: semua Task 1–5 (halaman `/transactions` live).
- Produces: 1 skenario: login sesi seeded → `/transactions` →
  ketik `jual {PRODUK_E2E} 2pcs {HARGA}` (produk berstok dari
  fixture/seed lokal) → pratinjau tampil → edit qty → Catat →
  toast sukses → buka `/products`, expand produk → baris mutasi
  baru tampil. (Bila seed lokal tak punya produk berstok yang
  stabil, buat via API di `beforeAll` memakai `createProduct` +
  purchase seperti `products.spec.ts`.)

- [ ] **Step 1: Write spec** (gagal: komponen sudah ada — tandai
  `test.fixme` dulu? Tidak: tulis spec, jalankan, saksikan gagal
  bila alur belum sinkron, perbaiki komponen.)

- [ ] **Step 2: Run E2E lokal**

Run: sesuai `scripts/ci-local.sh --full`? BERAT (wipe DB lokal).
Ringan: `E2E_MODE=local E2E_BASE_URL=http://localhost:4173 pnpm exec playwright test e2e/quick-entry.spec.ts`
dengan preview + `LEDJER_E2E_LOCAL=1` (pola `playwright.config.ts`).
Expected: PASS.

- [ ] **Step 3: Full gate + commit**

Run: `pnpm --filter web test`, `tsc -b`, `eslint`, `build`.
```bash
git add apps/web/e2e/quick-entry.spec.ts
git commit -m "test(quick-entry): e2e happy path chat sale to movement history"
```

---

## Self-Review

1. **Spec coverage:** grammar §4 → Task 1–2; matching §5 → Task 3;
   preview/confirm §6 → Task 4 (counter income via `listAccounts`
   filter client — tanpa endpoint baru, sesuai §9 spec);
   mobile UX §7 → Task 4–5 (16px, send, 44px, sticky CTA);
   error §8 → Task 1–4; testing §9 → tiap task + Task 6.
2. **Placeholder scan:** tidak ada TBD/TODO/"nanti"; semua langkah
   berisi kode/perintah persis. Pengecualian sadar: Task 5 tanpa
   test baru (dinyatakan + dicover E2E Task 6).
3. **Type consistency:** `QuickEntryParseResult`/`QuickEntryDraft`/
   `ProductLite` didefinisikan Task 1/3, dipakai Task 4 apa adanya;
   `postTransaction` shape = `PostTransactionInput` existing
   (sale: cash_in+items+amountIdr+counterAccountId;
   purchase: items+unitCostIdr, tanpa counter/amount — cermin
   `new.tsx` baris 233).
