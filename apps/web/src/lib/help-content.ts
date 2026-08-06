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

/* ────────────────────────────────────────────────────────────────────────
 * Panduan Halaman (Page Guide)
 *
 * Konten langkah-demi-langkah untuk komponen PageGuide — tampil otomatis
 * saat halaman dibuka pertama kali, bisa ditutup, dan dibuka kembali lewat
 * tombol panduan. Key mengikuti rute halaman.
 * ──────────────────────────────────────────────────────────────────────── */

export interface PageGuideContent {
  /** Judul singkat panduan */
  readonly title: string;
  /** Satu kalimat: halaman ini untuk apa */
  readonly summary: string;
  /** Langkah-langkah penggunaan */
  readonly steps: readonly string[];
  /** Tips tambahan (opsional) */
  readonly tip?: string;
}

export const PAGE_GUIDES: Record<string, PageGuideContent> = {
  dashboard: {
    title: "Beranda Bisnis Anda",
    summary: "Ringkasan kondisi keuangan dan stok dalam satu layar.",
    steps: [
      "Lihat saldo kas, penjualan, dan laba rugi periode ini di kartu ringkasan.",
      "Periksa daftar stok menipis — segera tambah stok sebelum kehabisan.",
      "Pilih periode (bulan ini / bulan lalu) untuk melihat perubahan kinerja.",
      "Klik tautan cepat untuk langsung mencatat transaksi atau membuka laporan.",
    ],
    tip: "Angka di Beranda otomatis terisi dari transaksi yang Anda catat — tidak perlu mengisi apa pun di sini.",
  },
  transactions: {
    title: "Daftar Transaksi",
    summary: "Semua pemasukan dan pengeluaran bisnis Anda tercatat di sini.",
    steps: [
      "Ketuk 'Transaksi Baru' untuk mencatat penjualan, pembelian, atau beban.",
      "Gunakan kolom cari dan filter untuk menemukan transaksi tertentu.",
      "Transaksi berstatus Draft belum memengaruhi laporan — posting agar masuk pembukuan.",
      "Buka transaksi untuk melihat detail, mengubah draft, atau membatalkan (void).",
    ],
    tip: "Mencatat transaksi secara rutin (harian/mingguan) membuat laporan keuangan selalu akurat.",
  },
  "transactions/new": {
    title: "Mencatat Transaksi Baru",
    summary: "Form untuk memasukkan pemasukan dan pengeluaran.",
    steps: [
      "Pilih jenis transaksi — sistem otomatis menentukan akun debit/kredit.",
      "Isi tanggal, pihak (jika ada), dan jumlah dalam Rupiah.",
      "Untuk penjualan produk, pilih produk dan jumlah unit — stok & HPP terisi otomatis.",
      "Periksa pratinjau jurnal, lalu simpan. Transaksi langsung masuk laporan keuangan.",
    ],
    tip: "Jika ragu memilih jenis, pilih yang paling mendekati — akun bisa disesuaikan saat dibutuhkan.",
  },
  "transactions/:id": {
    title: "Detail Transaksi",
    summary: "Melihat dan mengelola satu transaksi.",
    steps: [
      "Periksa informasi transaksi dan jurnal debit/kredit yang dihasilkan.",
      "Draft bisa diedit; transaksi terposting hanya bisa dibatalkan (void).",
      "Pembatalan membuat jurnal pembalik otomatis — saldo kembali seperti semula.",
    ],
    tip: "Selalu beri alasan saat membatalkan agar jejak audit tetap jelas.",
  },
  products: {
    title: "Kelola Produk & Stok",
    summary: "Daftar produk, harga, dan tingkat stok toko Anda.",
    steps: [
      "Ketuk 'Produk Baru' untuk menambah produk dengan harga jual dan stok awal.",
      "Klik produk untuk mengubah harga, menambah stok, atau melihat riwayat stok.",
      "Stok menipis ditandai otomatis saat jumlah di bawah batas minimal.",
      "Penjualan otomatis mengurangi stok; pembelian menambahnya.",
    ],
    tip: "Stok Opname = catat hasil hitung fisik; Penyesuaian Stok = ubah stok langsung (misal barang rusak). Keduanya membuat jurnal otomatis.",
  },
  accounts: {
    title: "Kas & Bank (Bagan Akun)",
    summary: "Daftar akun buku besar: kas, bank, piutang, utang, dan lainnya.",
    steps: [
      "Tab Kas & Bank menampilkan rekening kas/bank bisnis Anda.",
      "Ketuk 'Tambah Akun' untuk membuat akun baru (misal rekening bank kedua).",
      "Akun sistem terkunci agar laporan tetap konsisten — tidak perlu diubah.",
      "Anda tidak perlu memilih akun saat bertransaksi: sistem memilihnya otomatis.",
    ],
    tip: "Akun kas/bank yang Anda buat bisa diedit namanya; akun sistem tidak.",
  },
  invoices: {
    title: "Faktur Penjualan",
    summary: "Dokumen tagihan resmi ke pelanggan.",
    steps: [
      "Ketuk 'Faktur Baru' untuk membuat faktur dengan item dan jumlah.",
      "Faktur mengalir: Draft → Diterbitkan → Dibayar / Dibatalkan.",
      "Faktur yang diterbitkan otomatis membuat jurnal piutang.",
      "Saat pelanggan membayar, catat pembayarannya untuk melunasi faktur.",
    ],
    tip: "Penjualan tunai cukup dicatat langsung di Transaksi — faktur khusus untuk penjualan kredit/tagihan.",
  },
  "invoices/new": {
    title: "Membuat Faktur",
    summary: "Form untuk membuat dokumen tagihan baru.",
    steps: [
      "Pilih pelanggan (atau buat baru) dan tanggal faktur.",
      "Tambahkan item produk atau jasa beserta jumlah dan harga.",
      "Atur jatuh tempo — sistem akan mengingatkan saat faktur mendekati jatuh tempo.",
      "Simpan sebagai draft, atau terbitkan langsung agar membuat jurnal.",
    ],
  },
  "invoices/:id": {
    title: "Detail Faktur",
    summary: "Melihat dan mengelola satu faktur.",
    steps: [
      "Periksa status: Draft, Diterbitkan, Dibayar, atau Dibatalkan.",
      "Draft bisa diedit; faktur terbit bisa dibatalkan dengan nota kredit.",
      "Catat pembayaran untuk melacak sisa tagihan pelanggan.",
    ],
  },
  journals: {
    title: "Jurnal Manual",
    summary: "Mencatat jurnal debit/kredit langsung — untuk pengguna yang paham akuntansi.",
    steps: [
      "Isi Tanggal, Jenis Jurnal, dan Deskripsi (wajib).",
      "Pilih akun di semua baris, lalu isi Debit di satu baris dan Kredit di baris lain dengan jumlah sama.",
      "Klik 'Preview' — badge berubah jadi 'Balance' (hijau) jika debit = kredit.",
      "Jika badge merah 'Selisih', samakan total debit dan kredit dulu.",
      "Baru klik 'Posting Jurnal' untuk menyimpan.",
    ],
    tip: "Tombol Preview aktif walau jurnal belum lengkap — pesan peringatan akan muncul menjelaskan apa yang kurang. Jurnal Penyesuaian/ Penutup dipakai saat akhir periode.",
  },
  "opening-balance": {
    title: "Saldo Awal",
    summary: "Memasukkan saldo akun per tanggal mulai pembukuan.",
    steps: [
      "Isi saldo awal per akun sesuai catatan bisnis Anda.",
      "Aturan: Aset = Debit (positif), Utang & Modal = Kredit (negatif).",
      "Total Debit harus sama dengan total Kredit agar balance.",
      "Simpan setelah semua saldo terisi — laporan dihitung dari sini.",
    ],
    tip: "Pendapatan dan Beban biasanya saldonya nol di awal.",
  },
  import: {
    title: "Import Data dari CSV",
    summary: "Pindahkan data lama dari spreadsheet ke Ledjer dalam satu kali proses.",
    steps: [
      "Siapkan file CSV (akun, produk, pihak, atau saldo awal) dari spreadsheet Anda.",
      "Pilih jenis data yang diimpor dan unggah file.",
      "Petakan kolom CSV ke kolom Ledjer, lalu periksa pratinjau.",
      "Konfirmasi untuk menyelesaikan import — data langsung masuk.",
    ],
    tip: "Gunakan template CSV yang disediakan untuk memastikan format benar.",
  },
  reconciliation: {
    title: "Rekonsiliasi Bank",
    summary: "Mencocokkan catatan kas bisnis dengan laporan bank.",
    steps: [
      "Unduh laporan bank (statement) dan unggah sebagai CSV.",
      "Cocokkan setiap baris statement dengan transaksi di Ledjer.",
      "Tandai item yang tidak cocok dan catat biaya/bunga bank jika ada.",
      "Saat saldo seimbang, rekonsiliasi selesai — saldo bank terbukti akurat.",
    ],
    tip: "Lakukan rekonsiliasi rutin (bulanan) untuk mendeteksi kesalahan lebih awal.",
  },
  notifications: {
    title: "Pusat Notifikasi",
    summary: "Daftar hal yang butuh perhatian: tagihan jatuh tempo, stok menipis, dan lainnya.",
    steps: [
      "Baca notifikasi untuk tahu tindakan yang perlu dilakukan.",
      "Ketuk notifikasi untuk langsung membuka halaman terkait.",
      "Notifikasi bersifat informasi — tidak ada alur persetujuan.",
    ],
  },
  "reports/profit-loss": {
    title: "Laporan Laba Rugi",
    summary: "Apakah bisnis Anda untung atau rugi dalam periode tertentu.",
    steps: [
      "Pilih rentang tanggal (misal bulan ini).",
      "Lihat Pendapatan dikurangi HPP = Laba Kotor.",
      "Kurangi beban operasional untuk mendapatkan Laba Bersih.",
      "Ekspor laporan bila perlu dibagikan.",
    ],
    tip: "Laba kotor yang tinggi tapi laba bersih tipis = beban operasional perlu ditekan.",
  },
  "reports/balance-sheet": {
    title: "Neraca",
    summary: "Posisi keuangan bisnis: aset, utang, dan modal pada tanggal tertentu.",
    steps: [
      "Pilih tanggal neraca yang ingin dilihat.",
      "Periksa Aset = Kewajiban + Ekuitas (harus selalu seimbang).",
      "Gunakan untuk menilai kesehatan keuangan jangka panjang.",
    ],
  },
  "reports/cash-flow": {
    title: "Laporan Arus Kas",
    summary: "Uang masuk dan keluar dari operasi, investasi, dan pendanaan.",
    steps: [
      "Pilih periode laporan.",
      "Lihat arus kas dari Operasi — ini yang paling penting untuk usaha kecil.",
      "Arus kas negatif = perlu perhatian, walau laba terlihat positif.",
    ],
    tip: "Bisnis bisa untung di kertas tapi bangkrut karena kehabisan kas — pantau laporan ini rutin.",
  },
  "reports/aging": {
    title: "Piutang & Utang (Aging)",
    summary: "Umur tagihan: siapa yang belum bayar dan berapa lama menunggak.",
    steps: [
      "Pilih tab Piutang (tagihan ke pelanggan) atau Utang (tagihan dari pemasok).",
      "Lihat pengelompokan umur: Lancar, 31-60 hari, 61-90 hari, >90 hari.",
      "Fokus menagih piutang yang sudah tua (>60 hari).",
    ],
  },
  "reports/general-ledger": {
    title: "Buku Besar",
    summary: "Jejak lengkap setiap pergerakan pada tiap akun.",
    steps: [
      "Pilih akun dan rentang tanggal.",
      "Telusuri saldo awal, setiap jurnal, dan saldo berjalan.",
      "Gunakan untuk menelusuri asal setiap angka di laporan.",
    ],
  },
  "reports/trial-balance": {
    title: "Neraca Saldo",
    summary: "Daftar saldo semua akun — memastikan debit = kredit.",
    steps: [
      "Pilih tanggal neraca saldo.",
      "Periksa total Debit dan Kredit harus sama.",
      "Jika tidak sama, ada kesalahan pencatatan yang perlu ditelusuri.",
    ],
  },
  "reports/party-statement": {
    title: "Laporan Pelanggan/Vendor",
    summary: "Seluruh transaksi dengan satu pihak: faktur, pembayaran, dan saldo.",
    steps: [
      "Pilih pihak (pelanggan atau vendor).",
      "Lihat riwayat lengkap dan saldo terutang.",
      "Gunakan untuk menagih atau memverifikasi tagihan.",
    ],
  },
  "settings/organization": {
    title: "Profil Usaha",
    summary: "Informasi bisnis: nama, jenis, mata uang, dan periode pembukuan.",
    steps: [
      "Periksa dan ubah nama serta informasi bisnis.",
      "Struktur akun otomatis mengikuti jenis bisnis yang dipilih.",
      "Perubahan tersimpan otomatis atau lewat tombol Simpan.",
    ],
  },
  "settings/team": {
    title: "Tim & Izin",
    summary: "Mengelola anggota tim dan hak akses mereka.",
    steps: [
      "Ketuk 'Undang' untuk menambah anggota tim lewat email.",
      "Pilih peran: Admin, Staf (mencatat & melihat), atau Viewer (hanya melihat).",
      "Anggota menerima undangan dan bergabung ke organisasi.",
    ],
    tip: "Undang staf dengan peran terbatas agar data tetap aman.",
  },
  "settings/security": {
    title: "Akun & Keamanan",
    summary: "Password, sesi login, dan audit aktivitas.",
    steps: [
      "Ganti password bila perlu.",
      "Kelola sesi login aktif di perangkat lain.",
      "Periksa riwayat aktivitas untuk memantau keamanan akun.",
    ],
  },
  "settings/period-locks": {
    title: "Kunci Periode",
    summary: "Mengunci periode agar transaksi lama tidak bisa diubah.",
    steps: [
      "Pilih tanggal batas — transaksi sebelum tanggal itu terkunci.",
      "Kunci periode setelah laporan final (misal akhir bulan).",
      "Buka kunci hanya bila perlu, dengan alasan yang tercatat.",
    ],
    tip: "Pastikan semua transaksi dan rekonsiliasi selesai sebelum mengunci.",
  },
};
