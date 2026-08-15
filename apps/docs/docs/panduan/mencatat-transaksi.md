<Reicon name="Receipt" size="28" class="page-header-icon" />

# Mencatat Transaksi

Ledjer mengubah aktivitas usaha menjadi jurnal **double-entry** otomatis. Anda cukup memilih jenis transaksi dan mengisi datanya — sistem yang menentukan akun debit/kredit yang tepat.

## Jenis transaksi

| Jenis | Untuk apa |
|-------|-----------|
| **Penjualan Tunai** | Jual barang/jasa, uang diterima langsung |
| **Penjualan Kredit** | Jual barang/jasa secara utang (muncul sebagai piutang) |
| **Penerimaan Piutang** | Menerima pembayaran dari pelanggan yang berutang |
| **Pembelian Tunai** | Beli barang dagangan, bayar langsung |
| **Pembelian Kredit** | Beli barang dagangan secara utang (muncul sebagai utang) |
| **Pembayaran Utang** | Membayar utang ke pemasok |
| **Pembayaran Beban** | Bayar sewa, listrik, gaji, internet, dll. |
| **Setoran Modal** | Menyetor uang pribadi ke kas usaha |
| **Prive Pemilik** | Mengambil uang dari usaha untuk pribadi |
| **Transfer Kas** | Pindahkan uang antar rekening kas/bank |
| **Retur Penjualan** | Pelanggan mengembalikan barang |
| **Retur Pembelian** | Mengembalikan barang ke pemasok |

## Alur pencatatan

1. Buka **Transaksi → Catat Transaksi**.
2. Pilih **jenis transaksi** — form menyesuaikan otomatis.
3. Isi tanggal, jumlah, deskripsi, dan data pendukung (pelanggan/pemasok, akun kas, produk).
4. Klik **Pratinjau** untuk melihat dampak jurnal sebelum disimpan — termasuk akun yang terpengaruh dan arah perubahan saldo.
5. Klik **Simpan** untuk memosting transaksi.

> [!NOTE] **Jurnal selalu seimbang.**
> Ledjer menolak transaksi yang debitnya tidak sama dengan kreditnya, jadi buku Anda tidak akan pernah "tidak balance" karena kesalahan pencatatan.

## Aturan penting

- **Tanggal tidak boleh di masa depan**, dan tidak boleh **sebelum tanggal mulai pembukuan** organisasi Anda.
- Tanggal di dalam **periode terkunci** tidak bisa diubah/ditambah — lihat [Periode & Penutupan](/panduan/periode-penutupan).
- **Penjualan produk** memerlukan produk yang sudah ada dan memiliki biaya. **Pembelian** boleh memakai nama produk baru — sistem membuatkannya otomatis.
- Stok tidak boleh minus: penjualan akan ditolak jika stok tidak cukup.

## Pembayaran kredit sebagian

Penjualan/pembelian kredit bisa dibayar bertahap:

1. Saat mencatat, pilih status pembayaran **Sebagian (partial)** dan isi jumlah yang dibayar di awal.
2. Gunakan **Terima Piutang / Bayar Utang** untuk setiap pembayaran berikutnya.
3. Gunakan **Selesaikan (settle)** pada transaksi kredit untuk melunasi sisa dan menutup transaksinya.

## Membatalkan (void) transaksi

Transaksi yang salah bisa dibatalkan dengan alasan yang jelas:

1. Buka detail transaksi → **Batalkan Transaksi**.
2. Isi alasan pembatalan — wajib dan tercatat permanen.
3. Sistem membuat **jurnal pembalik** (debit/kredit dibalik) dan mengembalikan stok jika transaksinya melibatkan barang.

Transaksi yang dibatalkan tetap terlihat di daftar (berlabel **Dibatalkan**) demi jejak audit. Transaksi pembalik tidak bisa dibatalkan lagi. Transaksi kredit yang sudah dibayar sebagian tidak bisa dibatalkan langsung — selesaikan dulu, baru batalkan.

## Saldo awal

Jika Anda mulai memakai Ledjer di tengah tahun buku:

1. Buka **Saldo Awal**.
2. Catat saldo setiap akun (kas, bank, piutang, utang, persediaan, dan lainnya).
3. Sistem membuat **jurnal saldo awal** dengan akun "Saldo Awal" sebagai lawannya.

Ini memastikan neraca Anda benar sejak hari pertama.
