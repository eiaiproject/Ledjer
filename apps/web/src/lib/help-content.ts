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
  cash_flow: {
    title: "Arus Kas",
    explanation:
      "Laporan Arus Kas menunjukkan pergerakan uang masuk dan keluar dalam periode tertentu. Dibagi tiga aktivitas: Operasi (dari kegiatan utama bisnis), Investasi (dari pembelian/penjualan aset tetap), dan Pendanaan (dari pinjaman/modal). Laporan ini penting karena laba di laporan Laba Rugi belum tentu berarti kas tersedia — bisnis bisa untung di kertas tapi bangkrut karena kekurangan kas.",
    example:
      "Laba bersih Rp 10jt, tetapi piutang naik Rp 8jt → kas dari operasi hanya Rp 2jt. Beli mesin Rp 5jt (investasi) → arus kas negatif Rp 3jt.",
    related: ["profit_loss", "balance_sheet"],
  },
};
