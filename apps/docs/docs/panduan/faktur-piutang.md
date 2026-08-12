# Faktur & Piutang

Terbitkan faktur untuk penjualan kredit dan lacak piutang pelanggan — semuanya otomatis masuk pembukuan.

## Membuat faktur

1. Buka **Faktur → Faktur Baru**.
2. Pilih **pelanggan** (atau buat baru).
3. Atur **tanggal faktur** dan **jatuh tempo**.
4. Tambahkan item: deskripsi, jumlah, dan harga.
5. Atur diskon dan pajak bila ada, lalu **Simpan Faktur**.

Saat faktur diterbitkan, Ledjer otomatis membuat jurnal: **Debit Piutang Usaha** (atau Kas untuk faktur tunai) dan **Kredit Pendapatan**. Anda tidak perlu mencatat jurnal terpisah.

## Status faktur

| Status | Arti |
|--------|------|
| **Belum dibayar** | Belum ada pembayaran |
| **Sebagian** | Sudah ada pembayaran, masih ada sisa |
| **Lunas** | Sudah dibayar penuh |
| **Jatuh tempo** | Belum lunas dan melewati tanggal jatuh tempo |
| **Dibatalkan** | Faktur tidak berlaku |

## Menerima pembayaran

1. Buka detail faktur → **Terima Pembayaran**.
2. Pilih akun kas/bank tujuan dan jumlah.
3. Jurnal otomatis: **Debit Kas**, **Kredit Piutang** — dan status faktur diperbarui.

Pembayaran juga bisa dicatat lewat transaksi **Penerimaan Piutang** biasa.

## Nota kredit

Jika faktur perlu dikurangi (retur, diskon setelah faktur, atau kesalahan):

1. Buka detail faktur → **Buat Nota Kredit**.
2. Isi item yang dikurangi dan alasan.
3. Sistem membuat **nota kredit** yang mengurangi piutang — bisa digunakan untuk pelunasan di kemudian hari (di-*credit* ke faktur lain).

## Email faktur

Kirim faktur langsung ke email pelanggan dari halaman detail — pelanggan mendapat salinan untuk arsip.

## Peringatan

Piutang yang melewati jatuh tempo muncul sebagai notifikasi **Piutang Jatuh Tempo** dan terlihat di laporan **Aging**. Gunakan itu untuk menagih sebelum umur piutang membengkak.
