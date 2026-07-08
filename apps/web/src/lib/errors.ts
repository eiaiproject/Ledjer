const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email atau password salah.',
  unauthorized: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  rate_limited: 'Terlalu banyak percobaan gagal. Coba lagi nanti.',
  oauth_not_configured: 'Masuk dengan Google belum tersedia.',
  email_already_registered: 'Email sudah terdaftar.',
  organization_forbidden: 'Anda tidak memiliki akses ke organisasi ini.',
  organization_required: 'Selesaikan onboarding organisasi terlebih dahulu.',
  permission_denied: 'Anda tidak memiliki izin untuk aksi ini.',
  missing_query_param: 'Parameter export tidak lengkap.',
  date_range_invalid: 'Rentang tanggal tidak valid.',
  from_date_invalid: 'Tanggal awal tidak valid.',
  to_date_invalid: 'Tanggal akhir tidak valid.',
  as_of_date_invalid: 'Tanggal laporan tidak valid.',
  opening_balances_not_supported: 'Saldo awal tidak dapat diisi setelah onboarding selesai.',
  account_name_duplicate: 'Nama akun sudah digunakan.',
  account_code_duplicate: 'Kode akun sudah digunakan.',
  account_code_range_full: 'Kode akun untuk jenis ini sudah penuh.',
  account_locked: 'Akun ini terkunci dan tidak dapat diubah.',
  account_protected: 'Akun bawaan atau terkunci tidak dapat dihapus/dinonaktifkan.',
  product_code_duplicate: 'Kode produk sudah digunakan.',
  product_not_found: 'Produk tidak ditemukan.',
  initial_stock_not_supported: 'Stok awal tidak dapat diisi setelah onboarding selesai. Catat lewat pembelian atau penyesuaian stok nanti.',
  insufficient_stock: 'Stok tidak mencukupi.',
  transaction_not_found: 'Transaksi tidak ditemukan.',
  transaction_not_posted: 'Hanya transaksi posted yang dapat dibatalkan.',
  transaction_type_unsupported: 'Jenis transaksi belum didukung.',
  transaction_before_books_start: 'Tanggal transaksi sebelum tanggal mulai pembukuan.',
  idempotency_key_required: 'Token transaksi tidak valid. Muat ulang halaman dan coba lagi.',
  period_locked: 'Tanggal ini berada dalam periode yang terkunci.',
  party_required: 'Isi nama pihak untuk jenis transaksi ini.',
  cash_account_required: 'Pilih akun kas/bank.',
  cash_account_invalid: 'Akun kas/bank tidak valid.',
  destination_cash_account_invalid: 'Akun tujuan tidak valid.',
  cash_transfer_same_account: 'Akun sumber dan tujuan harus berbeda.',
  debit_account_required: 'Pilih akun CoA.',
  debit_account_invalid: 'Akun CoA tidak valid untuk transaksi ini.',
  partial_amount_invalid: 'Jumlah pembayaran sebagian tidak valid.',
  product_amount_mismatch: 'Nominal harus sama dengan kuantitas dikali harga satuan.',
  product_zero_cost: 'Harga pokok produk belum tersedia. Atur harga beli/stok produk dulu.',
  product_accounts_missing: 'Akun persediaan produk belum lengkap.',
  journal_unbalanced: 'Jurnal transaksi tidak seimbang.',
  partial_void_not_supported: 'Transaksi kredit dengan pembayaran parsial belum bisa dibatalkan langsung.',
  reversal_not_voidable: 'Transaksi pembatalan tidak dapat dibatalkan.',
  invitation_token_required: 'Token undangan tidak valid.',
  invitation_email_invalid: 'Format email undangan tidak valid.',
  invitation_not_found: 'Undangan tidak ditemukan atau sudah tidak berlaku.',
  invitation_not_pending: 'Undangan sudah digunakan, dibatalkan, atau kedaluwarsa.',
  invitation_expired: 'Undangan sudah kedaluwarsa. Minta link baru dari pemilik bisnis.',
  invitation_email_mismatch: 'Undangan ini ditujukan untuk email lain.',
  invitation_already_member: 'Email ini sudah menjadi anggota organisasi.',
  member_not_found: 'Anggota tim tidak ditemukan.',
  member_role_invalid: 'Role anggota tidak valid.',
  member_role_protected: 'Role pemilik tidak dapat diubah atau dihapus dari halaman ini.',
  member_self_remove_forbidden: 'Anda tidak dapat menghapus diri sendiri.',
  weak_password: 'Password terlalu lemah. Gunakan minimal 8 karakter.',
  email_not_confirmed: 'Silakan verifikasi email Anda terlebih dahulu.',
  token_expired: 'Token telah kedaluwarsa atau tidak valid. Silakan minta ulang.',
  same_password: 'Password baru harus berbeda dari password lama.',
};

const MESSAGE_PATTERNS: Array<[string, string]> = [
  ['Invalid email or password', 'Email atau password salah.'],
  ['Invalid current password', 'Password saat ini salah.'],
  ['Token has expired', 'Token telah kedaluwarsa atau tidak valid. Silakan minta ulang.'],
  ['Password should be different', 'Password baru harus berbeda dari password lama.'],
  ['Failed to fetch', 'Gagal terhubung ke server. Periksa koneksi internet Anda.'],
  ['NetworkError', 'Gagal terhubung ke server. Periksa koneksi internet Anda.'],
];

export function translateError(error: unknown): string {
  if (!error) return 'Terjadi kesalahan. Silakan coba lagi.';

  const errorObj = error as Record<string, unknown>;
  if (errorObj && typeof errorObj === 'object') {
    const code = errorObj.code as string | undefined;
    const message = errorObj.message as string | undefined;

    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

    if (message) {
      const translated = translateMessage(message);
      if (translated) return translated;
    }
  }

  if (error instanceof Error) {
    const message = error.message;
    const code = (error as unknown as Record<string, unknown>).code as string | undefined;

    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

    const translated = translateMessage(message);
    if (translated) return translated;
  }

  return 'Terjadi kesalahan. Silakan coba lagi.';
}

function translateMessage(message: string): string | undefined {
  for (const [needle, translated] of MESSAGE_PATTERNS) {
    if (message.includes(needle)) return translated;
  }
  for (const [code, translated] of Object.entries(ERROR_MESSAGES)) {
    if (message.toLowerCase().includes(code.toLowerCase())) return translated;
  }
  return undefined;
}
