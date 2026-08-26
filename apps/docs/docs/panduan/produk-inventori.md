<Reicon name="Package" size="28" class="page-header-icon" />

# Produk & Inventori

Kelola daftar barang dagangan dan pantau stok - terhubung langsung dengan transaksi dan laporan.

## Menambah produk

1. Buka **Produk → Tambah Produk**.
2. Isi nama, kode (opsional), harga beli, harga jual, dan **stok minimum** (untuk peringatan stok menipis).
3. Simpan. Produk siap dipakai di transaksi penjualan/pembelian.

## Harga pokok & stok

Ledjer memakai metode **biaya rata-rata tertimbang (weighted average cost / WAC)**:

- Saat **pembelian**, harga pokok produk diperbarui menjadi rata-rata dari stok lama + pembelian baru.
- Saat **penjualan**, HPP (harga pokok penjualan) dihitung dari biaya rata-rata tersebut dan stok berkurang otomatis.
- **Retur penjualan** menambah stok kembali; **retur pembelian** menguranginya.

Konsekuensi penting: **stok tidak boleh minus**. Jika stok tidak cukup untuk penjualan, sistem menolaknya - tambah stok dulu lewat pembelian atau penyesuaian.

## Mutasi stok

Buka **Inventori → Mutasi Stok** untuk melihat riwayat lengkap pergerakan: pembelian, penjualan, retur, penyesuaian, dan pembatalan - lengkap dengan kuantitas, biaya per unit, dan stok setelahnya.

## Penyesuaian stok

Untuk koreksi stok (misal barang hilang, rusak, atau stok fisik berbeda):

1. Buka **Inventori → Sesuaikan Stok**.
2. Pilih produk, jumlah selisih, dan alasan.
3. Sistem mencatat mutasi **penyesuaian** - tidak membuat jurnal akuntansi (kecuali dibutuhkan, gunakan [Jurnal Manual](/panduan/periode-penutupan#jurnal-manual)).

## Peringatan stok menipis

Produk yang stoknya **≤ stok minimum** muncul sebagai peringatan di beranda dan daftar produk. Juga dikirim sebagai notifikasi dalam aplikasi.

## Peringatan "Stok Tidak Sesuai Pembukuan"

Berbeda dengan peringatan stok menipis, alert ini muncul ketika **nilai persediaan di pembukuan (akun Persediaan / 1300)** tidak sama dengan **nilai stok produk** (Σ stok × biaya rata-rata). Contoh: pembukuan mencatat Rp 75.150 tetapi nilai stok fisik hanya Rp 18.900, selisih Rp 56.250.

Penyebab umum:
- Pembatalan (void) transaksi yang tidak mencatat jurnal balik secara bersih.
- Penyesuaian stok yang jurnalnya tidak terposting.
- Drift pembulatan WAC (biasanya < Rp 1.000 — **tidak** memicu alert).

Cara menanganinya:
1. Buka **Produk** untuk memeriksa mutasi dan stok tiap produk.
2. Jika selisih wajar (pembulatan), abaikan — sistem menoleransi drift kecil.
3. Jika selisih nyata, buat **Jurnal Manual** penyesuaian: debet akun selisih (mis. Laba/Rugi atau Beban) dan kredit akun Persediaan sebesar selisih, agar buku kembali sama dengan nilai stok.

Setelah koreksi, alert akan hilang saat beranda di-refresh. Untuk memeriksa ulang secara langsung tanpa menunggu cache, developer dapat memanggil endpoint `GET /api/dashboard/inventory-reconciliation` (mengembalikan `account_balance`, `stock_value`, `diff`, dan `matched`).

## Impor produk massal

Punya banyak produk? Gunakan menu **Impor → Produk**:

1. Unduh template CSV.
2. Isi data (nama, harga beli, harga jual, stok awal, dll.).
3. Unggah, **pratinjau** untuk memeriksa, lalu jalankan.

Impor bisa dibatalkan (undo) jika terjadi kesalahan.
