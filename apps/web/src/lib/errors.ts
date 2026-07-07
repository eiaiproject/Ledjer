/**
 * Translate Supabase/PostgreSQL errors to Indonesian user-facing messages.
 */

const ERROR_MAP: Record<string, string> = {
  '23505': 'Data sudah ada (duplikat).',
  '23503': 'Data terkait tidak ditemukan.',
  '42501': 'Anda tidak memiliki izin untuk aksi ini.',
  'P0001': 'Validasi gagal. Periksa kembali input Anda.',
  'P0002': 'Transaksi tidak ditemukan.',
  'P0003': 'Transaksi sudah dibatalkan.',
  'PGRST202': 'Database belum siap. Hubungi administrator.',
};

const AUTH_MESSAGES: Record<string, string> = {
  // Keys are matched against both error.message (substring) and error.code (exact).
  // Keys with underscores match code values; keys with spaces match message substrings.
  JWT_INVALID: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  JWT_EXPIRED: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
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
  opening_balances_not_supported: 'Saldo awal belum tersedia di backend baru. Buat organisasi dengan saldo 0 dulu.',
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
  'Invalid login credentials': 'Email atau password salah.',
  // PHASE 8 FIX: Generic message prevents user enumeration
  user_not_found: 'Email atau password salah.',
  'User not found': 'Email atau password salah.',
  weak_password: 'Password terlalu lemah. Gunakan minimal 8 karakter.',
  email_not_confirmed: 'Silakan verifikasi email Anda terlebih dahulu.',
  'Email not confirmed': 'Silakan verifikasi email Anda terlebih dahulu.',
  token_expired: 'Token telah kedaluwarsa atau tidak valid. Silakan minta ulang.',
  'Token has expired': 'Token telah kedaluwarsa atau tidak valid. Silakan minta ulang.',
  'Invalid grant': 'Kode verifikasi tidak valid. Silakan coba lagi.',
  'Password should be different': 'Password baru harus berbeda dari password lama.',
  same_password: 'Password baru harus berbeda dari password lama.',
};

export function translateError(error: unknown): string {
  if (!error) return 'Terjadi kesalahan. Silakan coba lagi.';

  // Handle Supabase error objects with code property (e.g. PostgrestError)
  const errorObj = error as Record<string, unknown>;
  if (errorObj && typeof errorObj === 'object') {
    const code = errorObj.code as string | undefined;
    const message = errorObj.message as string | undefined;

    // P0001 is user-defined exception (RAISE EXCEPTION) in Postgres
    if (code === 'P0001' && message) {
      return message;
    }

    if (code && ERROR_MAP[code]) return ERROR_MAP[code];

    // Also check code against AUTH_MESSAGES (Supabase auth uses codes like "invalid_credentials")
    if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];

    // Supabase Auth errors come as plain objects {message: '...'} without error codes
    if (message) {
      for (const [key, msg] of Object.entries(AUTH_MESSAGES)) {
        if (message.toLowerCase().includes(key.toLowerCase())) return msg;
      }
      if (message.includes('JWT')) return AUTH_MESSAGES.JWT_INVALID;
    }
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message;
    const code = (error as unknown as Record<string, unknown>).code as string | undefined;

    // Check if Postgres SQLSTATE is P0001
    if (code === 'P0001') {
      return message;
    }

    // Check for known Postgres error codes embedded in message
    for (const [c, msg] of Object.entries(ERROR_MAP)) {
      if (message.includes(c)) return msg;
    }

    // Also check code against AUTH_MESSAGES
    if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];

    // Auth errors
    for (const [key, msg] of Object.entries(AUTH_MESSAGES)) {
      if (message.toLowerCase().includes(key.toLowerCase())) return msg;
    }

    // JWT errors
    if (message.includes('JWT')) return AUTH_MESSAGES.JWT_INVALID;

    // Network errors
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
    }
  }

  return 'Terjadi kesalahan. Silakan coba lagi.';
}
