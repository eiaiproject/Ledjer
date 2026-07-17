const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email atau password salah.',
  unauthorized: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  rate_limited: 'Terlalu banyak percobaan gagal. Coba lagi nanti.',
  email_already_registered: 'Email sudah terdaftar.',
  organization_forbidden: 'Anda tidak memiliki akses ke organisasi ini.',
  organization_required: 'Selesaikan onboarding organisasi terlebih dahulu.',
  permission_denied: 'Anda tidak memiliki izin untuk aksi ini.',
  account_name_duplicate: 'Nama akun sudah digunakan.',
  account_code_duplicate: 'Kode akun sudah digunakan.',
  product_code_duplicate: 'Kode produk sudah digunakan.',
  insufficient_stock: 'Stok tidak mencukupi.',
  transaction_not_found: 'Transaksi tidak ditemukan.',
  transaction_not_posted: 'Hanya transaksi posted yang dapat dibatalkan.',
  idempotency_key_required: 'Token transaksi tidak valid. Muat ulang halaman dan coba lagi.',
  period_locked: 'Tanggal ini berada dalam periode yang terkunci.',
  party_required: 'Isi nama pihak untuk jenis transaksi ini.',
  cash_account_required: 'Pilih akun kas/bank.',
  cash_account_invalid: 'Akun kas/bank tidak valid.',
  partial_amount_invalid: 'Jumlah pembayaran sebagian tidak valid.',
  product_amount_mismatch: 'Nominal harus sama dengan kuantitas dikali harga satuan.',
  journal_unbalanced: 'Jurnal transaksi tidak seimbang.',
  invitation_expired: 'Undangan sudah kedaluwarsa. Minta link baru dari pemilik bisnis.',
  email_not_confirmed: 'Silakan verifikasi email Anda terlebih dahulu.',
  token_expired: 'Token telah kedaluwarsa atau tidak valid. Silakan minta ulang.',
  same_password: 'Password baru harus berbeda dari password lama.',
  invitation_email_mismatch: 'Undangan ini untuk alamat email yang berbeda. Masuk dengan email yang menerima undangan.',
  csrf_invalid: 'Permintaan ditolak karena asal tidak dikenal. Coba nonaktifkan ekstensi browser (ad blocker) lalu muat ulang.',
  csrf_missing_origin: 'Permintaan ditolak. Coba nonaktifkan ekstensi browser (ad blocker) lalu muat ulang.',
};

// Compact fallback for common English API messages
const MSG_FALLBACKS: [string, string][] = [
  ['invalid email or password', 'Email atau password salah.'],
  ['invalid current password', 'Password saat ini salah.'],
  ['token has expired', 'Token telah kedaluwarsa atau tidak valid. Silakan minta ulang.'],
  ['password should be different', 'Password baru harus berbeda dari password lama.'],
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
