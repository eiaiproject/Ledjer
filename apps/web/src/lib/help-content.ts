/**
 * Centralized repository of plain Indonesian explanations for accounting concepts.
 * Used by HelpTooltip components throughout the app.
 */
export interface HelpContent {
  title: string;
  explanation: string;
  example?: string;
  related?: string[];
}

export const HELP: Record<string, HelpContent> = {
  debit_credit: {
    title: "Debit dan Kredit",
    explanation:
      "Dalam pembukuan double-entry, setiap transaksi memengaruhi minimal dua akun. Debit (kiri) dan Kredit (kanan) adalah posisi dalam jurnal, bukan 'plus' atau 'minus'. Aturan dasarnya: Aset dan Beban bertambah di Debit, sedangkan Kewajiban, Ekuitas, dan Pendapatan bertambah di Kredit. Total Debit harus selalu sama dengan total Kredit — jika tidak, jurnal tidak balance.",
    example:
      "Saat Anda mencatat penjualan tunai Rp 100.000: Debit pada akun Kas (aset bertambah), Kredit pada akun Pendapatan (pendapatan bertambah).",
    related: ["jurnal", "posting"],
  },
  cogs: {
    title: "Harga Pokok Penjualan (HPP)",
    explanation:
      "HPP adalah biaya langsung yang dikeluarkan untuk menghasilkan barang yang dijual. Untuk bisnis dagang, HPP dihitung dari: Persediaan Awal + Pembelian - Persediaan Akhir. Saat Anda mencatat penjualan produk, sistem otomatis menghitung HPP berdasarkan metode rata-rata tertimbang (Weighted Average Cost). HPP akan mengurangi laba kotor Anda.",
    example:
      "Beli 10 unit @ Rp 5.000 = total Rp 50.000. Jual 3 unit @ Rp 5.000 = HPP Rp 15.000. Sisa stok 7 unit dengan total nilai Rp 35.000.",
    related: ["inventory_valuation", "gross_profit"],
  },
  inventory_valuation: {
    title: "Valuasi Persediaan",
    explanation:
      "Ledjer menggunakan metode rata-rata tertimbang (Weighted Average Cost / WAC) untuk menilai persediaan. Setiap kali Anda membeli produk dengan harga berbeda, sistem menghitung ulang harga rata-rata. Metode ini sederhana dan cocok untuk UMKM karena tidak perlu melacak batch barang satu per satu.",
    example:
      "Stok awal 10 unit @ Rp 5.000 = Rp 50.000. Beli lagi 10 unit @ Rp 6.000 = Rp 60.000. Harga rata-rata baru: (50.000 + 60.000) / 20 = Rp 5.500 per unit.",
    related: ["cogs", "stock"],
  },
  equity: {
    title: "Ekuitas / Modal",
    explanation:
      "Ekuitas adalah hak pemilik atas aset bisnis setelah dikurangi semua kewajiban. Rumusnya: Ekuitas = Aset - Kewajiban. Ekuitas bertambah saat pemilik menyetor modal atau bisnis menghasilkan laba. Ekuitas berkurang saat pemilik mengambil prive (uang untuk keperluan pribadi) atau bisnis merugi.",
    example:
      "Setoran modal awal Rp 10.000.000. Setelah setahun, laba ditahan Rp 2.000.000. Prive Rp 500.000. Total ekuitas: Rp 11.500.000.",
    related: ["balance_sheet", "owner_draw"],
  },
  trial_balance: {
    title: "Neraca Saldo (Trial Balance)",
    explanation:
      "Neraca Saldo adalah daftar semua akun beserta saldo debit dan kredit pada tanggal tertentu. Tujuannya untuk memastikan total debit sama dengan total kredit — bukti bahwa jurnal sudah balance. Jika tidak balance, pasti ada kesalahan pencatatan. Neraca Saldo adalah langkah awal sebelum menyusun laporan keuangan.",
    example:
      "Total Debit: Rp 50.000.000 (Kas + Piutang + Persediaan + Beban). Total Kredit: Rp 50.000.000 (Utang + Modal + Pendapatan). Balance!",
    related: ["balance_sheet", "profit_loss"],
  },
  balance_sheet: {
    title: "Neraca (Balance Sheet)",
    explanation:
      "Neraca adalah laporan yang menunjukkan posisi keuangan bisnis pada tanggal tertentu. Terdiri dari tiga unsur: Aset (harta), Kewajiban (utang), dan Ekuitas (modal). Rumus dasarnya: Aset = Kewajiban + Ekuitas. Laporan ini disebut 'balance' karena kedua sisi harus selalu sama. Neraca adalah potret kondisi keuangan sesaat.",
    example:
      "Aset: Kas Rp 15jt + Piutang Rp 5jt + Persediaan Rp 10jt = Rp 30jt. Kewajiban: Utang Rp 5jt. Ekuitas: Modal Rp 25jt. Total: Rp 30jt = Rp 30jt",
    related: ["trial_balance", "equity"],
  },
  period_closing: {
    title: "Penutupan Periode",
    explanation:
      "Menutup periode berarti mengunci transaksi pada periode tertentu agar tidak bisa diubah lagi. Ini penting untuk menjaga integritas laporan keuangan. Setelah periode ditutup, transaksi baru hanya bisa dicatat di periode yang lebih baru. Sebelum menutup, pastikan semua rekonsiliasi bank selesai, stok sudah dihitung, dan tidak ada transaksi draft.",
    example:
      "Tutup periode Januari 2026: semua transaksi tanggal 1-31 Januari tidak bisa diubah. Transaksi baru akan dicatat mulai 1 Februari.",
    related: ["period_lock", "reconciliation"],
  },
  void_reversal: {
    title: "Pembatalan dan Reversal",
    explanation:
      "Pembatalan (void) adalah cara yang benar untuk membatalkan transaksi yang sudah diposting. Sistem TIDAK menghapus transaksi asli — sebaliknya, sistem membuat transaksi reversal otomatis yang membalikkan semua jurnal. Dengan cara ini, jejak audit tetap lengkap dan saldo akun kembali seperti sebelum transaksi. Selalu berikan alasan pembatalan yang jelas.",
    example:
      "Transaksi penjualan Rp 100.000 dibatalkan. Sistem membuat jurnal reversal: Debit Pendapatan Rp 100.000, Kredit Kas Rp 100.000. Transaksi asli tetap ada dengan status 'voided'.",
    related: ["audit", "correction"],
  },
  reconciliation: {
    title: "Rekonsiliasi Bank",
    explanation:
      "Rekonsiliasi bank adalah proses mencocokkan catatan kas internal bisnis dengan laporan bank. Tujuannya memastikan saldo kas yang tercatat sesuai dengan saldo riil di bank. Perbedaan bisa terjadi karena: biaya bank, bunga, cek belum cair, atau setoran dalam perjalanan. Rekonsiliasi rutin (bulanan) membantu mendeteksi kesalahan lebih awal.",
    example:
      "Saldo buku Rp 10.000.000, saldo bank Rp 9.800.000. Setelah dicocokkan: ada biaya admin bank Rp 200.000 yang belum dicatat. Catat beban bank → saldo menjadi sama.",
    related: ["cash", "period_closing"],
  },
  aging: {
    title: "Aging Piutang & Utang",
    explanation:
      "Laporan aging mengelompokkan piutang (tagihan ke pelanggan) dan utang (tagihan dari pemasok) berdasarkan usia jatuh temponya. Kelompok umum: Lancar (0-30 hari), 31-60 hari, 61-90 hari, dan >90 hari. Semakin tua usia piutang, semakin besar risiko tidak tertagih. Laporan ini membantu Anda mengelola arus kas dan menagih lebih proaktif.",
    example:
      "Total piutang Rp 50jt: Lancar Rp 30jt, 31-60 hari Rp 12jt, 61-90 hari Rp 5jt, >90 hari Rp 3jt. Fokus tagih yang >60 hari dulu!",
    related: ["receivables", "cash_flow"],
  },
  gross_profit: {
    title: "Laba Kotor",
    explanation:
      "Laba Kotor adalah selisih antara Pendapatan (penjualan) dengan Harga Pokok Penjualan (HPP). Rumus: Laba Kotor = Penjualan - HPP. Laba kotor menunjukkan seberapa efisien bisnis Anda dalam memproduksi atau membeli barang. Semakin tinggi laba kotor, semakin baik. Laba kotor belum dikurangi beban operasional seperti gaji, sewa, dan listrik.",
    example:
      "Penjualan Rp 100jt, HPP Rp 60jt. Laba Kotor = Rp 40jt (40% margin). Setelah dikurangi beban operasional Rp 25jt, Laba Bersih = Rp 15jt.",
    related: ["cogs", "profit_loss"],
  },
  profit_loss: {
    title: "Laporan Laba Rugi",
    explanation:
      "Laporan Laba Rugi (Profit & Loss) menunjukkan kinerja keuangan bisnis selama periode tertentu. Dimulai dari Pendapatan, dikurangi Harga Pokok Penjualan (HPP) untuk mendapatkan Laba Kotor. Kemudian dikurangi Beban Operasional untuk mendapatkan Laba Operasional. Ditambah pendapatan lain dan dikurangi beban lain, hasilnya adalah Laba Bersih (atau Rugi Bersih). Laporan ini penting untuk mengevaluasi apakah bisnis Anda menguntungkan.",
    example:
      "Pendapatan Rp 100jt - HPP Rp 60jt = Laba Kotor Rp 40jt. Laba Kotor Rp 40jt - Beban Rp 25jt = Laba Operasional Rp 15jt. + Pendapatan Lain Rp 1jt - Beban Lain Rp 500rb = Laba Bersih Rp 15,5jt.",
    related: ["gross_profit", "cogs", "cash_flow"],
  },
  business_type: {
    title: "Jenis Bisnis",
    explanation:
      "Jenis bisnis menentukan struktur akun otomatis yang dibuat sistem. 'Jual Beli Barang' membuat akun persediaan dan HPP untuk pencatatan stok. 'Penyedia Jasa' tidak memakai akun persediaan karena tidak ada barang dagang. Pilihan ini menentukan bagan akun, mapping transaksi otomatis, dan laporan yang relevan. Dapat diubah nanti di Pengaturan, tetapi struktur akun yang sudah terlanjur dipakai tetap ada.",
    example:
      "Toko kelontong memilih 'Jual Beli Barang' → sistem membuat akun Persediaan (1140), HPP, dan akun penjualan. Konsultan memilih 'Penyedia Jasa' → tanpa akun persediaan.",
    related: ["account_mapping", "cogs"],
  },
  account_locked: {
    title: "Akun Terkunci",
    explanation:
      "Akun sistem dibuat otomatis oleh Ledjer dan terkunci agar tidak bisa diubah atau dihapus. Ini menjaga konsistensi laporan keuangan: jika kode atau nama akun sistem berubah, semua laporan lama ikut berubah dan menjadi tidak bisa dibandingkan. Akun kas/bank yang Anda tambahkan sendiri bisa diedit namanya.",
    example:
      "Akun 'Kas Besar' (kode 1110) terkunci. Nama rekening bank Anda sendiri bisa diubah kapan saja.",
    related: ["account_mapping"],
  },
  account_mapping: {
    title: "Mapping Akun Otomatis",
    explanation:
      "Saat Anda mencatat transaksi, Ledjer otomatis memilih akun debit dan kredit berdasarkan jenis transaksi dan mapping yang sudah disiapkan. Misalnya penjualan tunai otomatis men-debit Kas dan meng-kredit Pendapatan Penjualan. Anda tidak perlu memilih akun setiap kali mencatat transaksi.",
    example:
      "Catat penjualan tunai Rp 100.000 → sistem otomatis: Debit Kas 100.000, Kredit Pendapatan 100.000.",
    related: ["debit_credit", "account_locked"],
  },
  transaction_status: {
    title: "Status Transaksi",
    explanation:
      "Transaksi mengalir melalui status: Draft (belum final, bisa diedit) → Diposting (sudah memengaruhi laporan keuangan) → Dibatalkan (void, tidak dihapus tetapi dibalik dengan jurnal reversal). Transaksi kredit juga punya status pembayaran: Belum Dibayar → Sebagian → Lunas. Tombol aksi hanya muncul jika status memungkinkan.",
    example:
      "Transaksi draft belum muncul di laporan. Setelah diposting, baru terlihat di Laba Rugi dan Neraca.",
    related: ["void_reversal", "posting"],
  },
  journal_types: {
    title: "Jenis Jurnal Manual",
    explanation:
      "Jurnal Manual untuk pencatatan umum sehari-hari. Jurnal Penyesuaian untuk koreksi di akhir periode (misal penyusutan, beban dibayar di muka). Jurnal Penutup untuk menutup akun nominal ke laba ditahan saat pergantian periode. Ketiganya sama-sama jurnal double-entry; perbedaannya hanya label untuk memudahkan identifikasi di laporan.",
    example:
      "Akhir bulan: catat beban penyusutan aset sebagai Jurnal Penyesuaian, bukan Manual.",
    related: ["debit_credit", "period_closing"],
  },
  invoice_journal: {
    title: "Faktur dan Jurnal Otomatis",
    explanation:
      "Setiap faktur yang diterbitkan otomatis membuat jurnal akuntansi: Debit Piutang Usaha (atau Kas jika tunai) dan Kredit Pendapatan. Saat faktur dibayar atau dibuatkan nota kredit, sistem memperbarui jurnal terkait. Anda tidak perlu mencatat jurnal terpisah untuk faktur — laporan keuangan sudah terisi otomatis.",
    example:
      "Faktur Rp 500.000 ke pelanggan → Debit Piutang 500.000, Kredit Pendapatan 500.000.",
    related: ["debit_credit", "receivables"],
  },
  notification_triggers: {
    title: "Pemicu Notifikasi",
    explanation:
      "Ledjer mengirim notifikasi untuk kejadian yang butuh tindakan: faktur jatuh tempo, stok menipis, transaksi draft belum diposting, statement bank belum direkonsiliasi, dan periode yang belum dikunci. Notifikasi bersifat informasi — tidak ada alur persetujuan antar anggota tim.",
    example:
      "Faktur mendekati jatuh tempo → notifikasi 'Faktur segera jatuh tempo' muncul di pusat notifikasi.",
    related: ["aging", "period_closing"],
  },
  period_lock: {
    title: "Kunci Periode",
    explanation:
      "Mengunci periode membekukan semua transaksi sampai tanggal tertentu — transaksi baru atau perubahan di periode terkunci akan ditolak. Ini melindungi laporan yang sudah final dari revisi tidak sengaja. Periode yang belum terkunci bisa diubah; periode yang sudah terkunci hanya bisa dibuka ulang dengan alasan, dan semua perubahan tercatat.",
    example:
      "Kunci hingga 31 Januari → transaksi Februari tetap bisa dicatat, tetapi transaksi Januari ditolak.",
    related: ["period_closing", "audit"],
  },
  opening_balance_guide: {
    title: "Saldo Awal per Akun",
    explanation:
      "Saldo awal diisi dengan aturan: Aset (kas, bank, piutang, persediaan) memakai Debit (positif). Kewajiban (utang) dan Ekuitas (modal) memakai Kredit (negatif). Pendapatan dan Beban biasanya saldonya nol di awal. Total Debit harus sama dengan total Kredit — ini memastikan persamaan akuntansi seimbang sejak hari pertama.",
    example:
      "Kas Rp 10jt (Debit) + Piutang Rp 2jt (Debit) = Utang Rp 3jt (Kredit) + Modal Rp 9jt (Kredit). Total debit 12jt = total kredit 12jt.",
    related: ["debit_credit", "balance_sheet"],
  },
  initial_stock: {
    title: "Stok Awal Produk",
    explanation:
      "Stok awal hanya bisa diisi saat produk dibuat sebelum onboarding selesai. Setelah onboarding selesai, stok masuk melalui alur pembelian atau penyesuaian stok — sehingga setiap perubahan stok selalu punya jejak audit. Harga beli pertama menjadi biaya rata-rata awal.",
    example:
      "Produk pertama dengan stok awal 10 unit @ Rp 5.000 → biaya rata-rata Rp 5.000. Pembelian berikutnya menggeser rata-ratanya.",
    related: ["inventory_valuation", "cogs"],
  },
  general_ledger: {
    title: "Buku Besar",
    explanation:
      "Buku Besar (General Ledger) menampilkan semua pergerakan setiap akun dalam rentang tanggal: saldo awal, setiap jurnal yang masuk (debit/kredit), dan saldo berjalan. Ini adalah jejak audit lengkap — dari sini Anda bisa menelusuri setiap angka laporan ke jurnal asalnya.",
    example:
      "Akun Kas: saldo awal 10jt, +5jt (penjualan), -2jt (pembelian) → saldo akhir 13jt.",
    related: ["trial_balance", "debit_credit"],
  },
  party_statement: {
    title: "Laporan Pelanggan/Vendor",
    explanation:
      "Laporan ini menampilkan seluruh transaksi dengan satu pelanggan atau vendor: faktur yang diterbitkan, pembayaran yang diterima, dan saldo terutang. Berguna untuk mengingatkan tagihan atau memverifikasi riwayat transaksi dengan pihak tertentu.",
    example:
      "Laporan pelanggan Toko Maju: faktur 2jt, bayar 1,5jt → saldo terutang 500rb.",
    related: ["aging", "receivables"],
  },
  cash_flow: {
    title: "Arus Kas",
    explanation:
      "Laporan Arus Kas menunjukkan pergerakan uang masuk dan keluar dalam periode tertentu. Dibagi tiga aktivitas: Operasi (dari kegiatan utama bisnis), Investasi (dari pembelian/penjualan aset tetap), dan Pendanaan (dari pinjaman/modal). Laporan ini penting karena laba di laporan Laba Rugi belum tentu berarti kas tersedia — bisnis bisa untung di kertas tapi bangkrut karena kekurangan kas.",
    example:
      "Laba bersih Rp 10jt, tetapi piutang naik Rp 8jt → kas dari operasi hanya Rp 2jt. Beli mesin Rp 5jt (investasi) → arus kas negatif Rp 3jt.",
    related: ["profit_loss", "balance_sheet"],
  },
};
