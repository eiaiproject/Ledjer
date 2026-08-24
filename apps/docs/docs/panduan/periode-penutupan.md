<Reicon name="Lock" size="28" class="page-header-icon" />

# Periode & Penutupan

Menjaga agar angka bulan lalu tidak berubah adalah kunci pembukuan yang bisa dipercaya. Ledjer menyediakan **kunci periode** dan **jurnal manual** untuk itu.

## Kunci periode

Kunci periode membekukan tanggal tertentu ke belakang:

1. Buka **Pengaturan → Kunci Periode**.
2. Buat kunci dengan tanggal "terkunci hingga" (misal `2026-07-31` untuk menutup Juli).
3. Semua transaksi, void, dan perubahan pada tanggal **≤ tanggal tersebut** otomatis **ditolak**.

> Kunci periode bersifat *sampai dengan* (cumulative): mengunci 31 Juli juga mengunci semua bulan sebelumnya.

### Kapan mengunci

- **Akhir setiap bulan** setelah semua transaksi bulan itu selesai.
- Sebelum **menyusun laporan final** (laporan pajak, laporan bank, dll.).
- Saat ada **audit** - buktikan bahwa angka tidak berubah setelah periode ditutup.

## Jurnal manual

Untuk penyesuaian yang tidak punya jenis transaksi khusus (misal penyusutan aset, koreksi, alokasi):

1. Buka **Jurnal** → **Buat Jurnal**.
2. Pilih akun **debit** dan **kredit** beserta nominalnya.
3. Sistem memastikan jurnal seimbang sebelum disimpan.

Jurnal manual tidak bisa memakai akun kas secara serampangan - gunakan transaksi biasa untuk kas. Semua jurnal manual juga tercatat di audit log.

## Jurnal penutup

Di akhir tahun, gunakan **Jurnal Penutup** untuk memindahkan saldo akun pendapatan dan beban ke **Saldo Laba**. Ledjer menyediakan pratinjau penutupan sebelum dijalankan.

## Template jurnal

Jika Anda rutin membuat jurnal yang sama (misal penyusutan bulanan), simpan sebagai **template** dan pakai kembali - lebih cepat dan konsisten.

## Rekonsiliasi bank

Untuk mencocokkan catatan kas dengan mutasi bank:

1. Buka **Rekonsiliasi**.
2. **Impor laporan bank** (CSV).
3. Tinjau **saran pencocokan** transaksi yang sistem temukan.
4. **Konfirmasi** pasangan yang benar; selisih yang tidak jelas bisa disisakan untuk ditelusuri.

Rekonsiliasi membantu mendeteksi transaksi terlewat atau kesalahan pencatatan di awal, sebelum periode dikunci.
