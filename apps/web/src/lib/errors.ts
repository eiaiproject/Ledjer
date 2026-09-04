const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email atau password salah.',
  unauthorized: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  rate_limited: 'Terlalu banyak permintaan. Coba lagi nanti.',
  email_taken: 'Email sudah terdaftar.',
  user_disabled: 'Akun Anda telah dinonaktifkan.',
  organization_forbidden: 'Anda tidak memiliki akses ke organisasi ini.',
  organization_required: 'Anda belum terhubung ke organisasi mana pun.',
  permission_denied: 'Anda tidak memiliki izin untuk aksi ini.',
  account_name_taken: 'Nama akun sudah dipakai dalam organisasi ini.',
  account_inactive: 'Akun ini tidak aktif. Pilih akun lain.',
  account_protected: 'Akun sistem tidak dapat dinonaktifkan.',
  account_in_use: 'Akun sudah dipakai transaksi dan tidak dapat dinonaktifkan.',
  counter_account_invalid: 'Akun lawan tidak sesuai jenis transaksi.',
  same_transfer_account: 'Akun sumber dan tujuan tidak boleh sama.',
  future_date_not_allowed: 'Tanggal transaksi tidak boleh lebih dari hari ini.',
  invalid_amount: 'Nominal harus berupa bilangan bulat rupiah lebih dari 0.',
  transaction_not_found: 'Transaksi tidak ditemukan.',
  transaction_not_posted: 'Hanya transaksi posted yang dapat dibatalkan.',
  idempotency_key_invalid: 'Token transaksi tidak valid. Muat ulang halaman dan coba lagi.',
  journal_unbalanced: 'Jurnal transaksi tidak seimbang.',
  journal_line_invalid: 'Satu baris jurnal hanya boleh memiliki debit atau kredit.',
  date_range_invalid: 'Rentang tanggal tidak valid.',
  validation_error: 'Data yang dikirim tidak valid.',
  invalid_json: 'Format data tidak valid.',
  csrf_invalid: 'Permintaan ditolak karena asal tidak dikenal. Nonaktifkan ekstensi browser (ad blocker), lalu segarkan halaman.',
  csrf_missing_origin: 'Permintaan ditolak. Nonaktifkan ekstensi browser (ad blocker), lalu segarkan halaman.',
};

// Compact fallback for common English API messages
const MSG_FALLBACKS: [string, string][] = [
  ['invalid email or password', 'Email atau password salah.'],
  ['failed to fetch', 'Gagal terhubung ke server. Periksa koneksi internet Anda.'],
  ['networkerror', 'Gagal terhubung ke server. Periksa koneksi internet Anda.'],
];

export function translateError(error: unknown): string {
  if (!error) return 'Terjadi kesalahan. Silakan coba lagi.';
  const obj = error as Record<string, unknown>;
  const code = obj?.code as string | undefined;
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  const msg = (obj?.message as string | undefined) || (typeof error === 'string' ? error : undefined);
  if (msg) {
    const lower = msg.toLowerCase();
    for (const [needle, translated] of MSG_FALLBACKS) {
      if (lower.includes(needle)) return translated;
    }
  }
  return 'Terjadi kesalahan. Silakan coba lagi.';
}