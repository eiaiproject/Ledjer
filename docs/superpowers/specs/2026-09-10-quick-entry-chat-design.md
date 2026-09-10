# Quick Entry Chat (Input Cepat ala Chat) — Design Spec

Tanggal: 2026-09-10 · Status: disetujui user (scope A, Opsi 1, parser client-side)

## 1. Tujuan

Pengguna mengetik `jual kopi 10pcs 50000` di halaman Transaksi → chat
memahami → pratinjau yang bisa diedit → satu ketuk Catat → tercatat
sebagai penjualan (kas masuk + stok berkurang, terlihat di expand
mutasi produk). Scope tahap pertama: **jual & beli barang saja**.

## 2. Non-tujuan (eksplisit)

- Kas biasa (terima/bayar/transfer), setoran/tarikan modal, retur/void
  via chat — menyusul setelah pola konfirmasi terbukti.
- AI/LLM eksternal: tidak dipakai (biaya, latensi, privasi, determinisme).
- Logika posting baru, endpoint baru, migrasi baru: tidak ada.

## 3. Arsitektur

Parser 100% client-side (murni, tanpa I/O) → pratinjau editabel →
konfirmasi memakai endpoint existing. Alasan mobile: 0 roundtrip
(instan di HP kentang, hemat kuota, toleran sinyal buruk).

```
[QuickEntryBar] --teks--> parseQuickEntry() --Draft|Error--> [PreviewCard] --Konfirmasi--> POST /api/transactions
                                                              (edit: produk/qty/harga/akun)
```

## 4. Grammar (`parseQuickEntry`, file baru `src/lib/quick-entry.ts`)

Normalisasi: lowercase, rapikan spasi, `Rp` opsional.

- Kata kerja: `jual` → sale; `beli` → purchase. Selain itu → error.
- Bentuk: `<verb> <nama> <qty>[satuan] <harga>`.
- Qty: desimal Indonesia (`2,5kg`, `10`, `10pcs`); maks 3 desimal
  (batas `quantityToMilli` existing).
- Harga: `50rb`, `50 rb`, `50ribu`, `1,5jt`, `1juta`, `50.000`,
  `50000`. Angka telanjang = **harga satuan**. Keyword `total X`
  = total eksplisit → satuan = round(total/qty) dan ditampilkan
  di pratinjau (bisa dikoreksi).
- Satuan beda dari `product.unit` → peringatan di pratinjau,
  bukan blokir (tidak ada konversi diam-diam: kg vs g berbahaya).
- Gagal parse → kartu bantuan berisi 2 contoh yang bisa diketuk
  (ketuk = isi input).

Draft yang dihasilkan:

```ts
interface QuickEntryDraft {
  kind: "sale" | "purchase";
  productId: string;          // kandidat terbaik
  candidates: { id: string; name: string }[]; // semua kandidat (untuk dropdown)
  quantity: number;
  unit?: string;              // satuan yang diketik (opsional)
  unitMismatch: boolean;
  unitPriceIdr: number;
  totalIdr: number;
  warnings: string[];
}
```

## 5. Pencocokan produk (client, dari `listProducts()` yang di-cache)

- Urutan: exact > awalan > mengandung > **typo 1–2 huruf**
  (Levenshtein ≤ 2 untuk nama ≥ 4 karakter — keyboard HP).
- Kandidat jual: `is_active === 1` DAN `current_stock > 0`.
  Kandidat beli: `is_active === 1` (stok 0 boleh dibeli).
- 1 cocok → terisi otomatis. >1 → chip pilihan. 0 → error
  "tidak ditemukan" + tombol ke `/products` (tidak pernah
  auto-buat produk — master data tidak boleh kotor oleh typo).

## 6. Pratinjau + konfirmasi (`QuickEntryPreview`)

Kartu ringkasan kalimat + field edit: Produk (dropdown kandidat),
Qty, Harga satuan, Total (auto = qty × satuan; override total
menghitung ulang satuan), Akun kas (dropdown `listCashBankAccounts()`,
default akun pertama). Tanggal = hari ini (tetap).

Validasi live → tombol Catat nonaktif bila: qty ≤ 0, harga ≤ 0 /
non-integer, produk kosong, stok kurang (jual), akun kosong.

Konfirmasi memanggil client existing (bentuk identik form):
- sale → `postTransaction({ transactionType: "cash_in", items: [{ productId, quantity, unitPriceIdr }], amountIdr: total, ... })`
  dengan `counterAccountId` = default form (lihat `new.tsx`;
  bila form memakai akun pendapatan default, pakai yang sama).
- purchase → `postTransaction({ transactionType: "purchase", items: [{ productId, quantity, unitCostIdr }], ... })`.
- `description` auto: `Jual {qty} {unit} {nama} (via cepat)` /
  `Beli ...`; `transactionDate` = hari ini; `idempotencyKey`
  = UUID fresh tiap konfirmasi.
- Sukses → toast + invalidate (`products`, `transactions`,
  `dashboard`) + chat reset. Hasil terlihat di expand mutasi
  `/products` (tidak ada deep-link expand — di luar scope).
- Gagal → toast error existing (`translateError`), pratinjau
  dipertahankan.

## 7. Mobile UX (Android & iOS) — `QuickEntryBar` di `/transactions`

- Posisi: kartu chat di atas form halaman `/transactions/new`
  (muara semua tombol Transaksi Baru dari manapun).
- Input: `font-size ≥ 16px` (cegah auto-zoom iOS),
  `enterKeyHint="send"`, Enter = kirim, tombol Kirim ≥ 44px.
  Autocorrect tetap ON (matcher toleran typo).
- Tombol "Transaksi Baru" jadi **sticky bottom di mobile**
  (`position: sticky`, hormati safe-area + bottom nav) agar
  selalu terlihat saat scroll — tanpa mengubah desktop.
- A11y: label input, `aria-live` untuk hasil/error,
  fokus kembali ke input setelah Catat.

## 8. Error handling

| Kasus | Perlakuan |
|---|---|
| Teks tak terparse | Kartu contoh ketuk-isi |
| Produk 0 cocok | Error + link /products |
| Produk >1 cocok | Chip pilihan |
| Satuan beda | Warning chip di pratinjau |
| Stok kurang (jual) | Error inline, Catat mati |
| Total tak habis dibagi | Satuan dibulatkan + ditampilkan |
| POST gagal | Toast, pratinjau utuh |

## 9. Testing

- Parser: ±25 kasus (verb, satuan, rb/jt/ribu/juta, pemisah
  ribuan, koma desimal, keyword total, typo, sampah).
- Matching: exact/awalan/mengandung/typo/filter stok-aktif.
- Komponen: ketik→pratinjau→edit→catat; tiap baris tabel
  error §8; sukses mereset + invalidate.
- E2E lokal 1 happy path: chat jual → expand mutasi produk
  menampilkan barisnya.
- Tidak ada migrasi; tidak ada endpoint baru.

## 10. File yang tersentuh (rencana)

- Baru: `src/lib/quick-entry.ts` (+ `src/lib/quick-entry.test.ts`),
  komponen `QuickEntryBar`/`QuickEntryPreview`
  (di `src/components/transactions/`), test komponen.
- Ubah: `src/pages/transactions/index.tsx` (sisip chat + sticky CTA),
  `apps/web/e2e/*.spec.ts` (1 skenario happy path).
- Sentuh baca-saja: `src/lib/api/transactions.ts`,
  `src/lib/api/products.ts`, `src/lib/api/accounts.ts`,
  `src/pages/transactions/new.tsx` (default counter account).
