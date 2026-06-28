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
  JWT_INVALID: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  JWT_EXPIRED: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  invalid_credentials: 'Email atau password salah.',
  // PHASE 8 FIX: Generic message prevents user enumeration
  user_not_found: 'Email atau password salah.',
  weak_password: 'Password terlalu lemah. Gunakan minimal 8 karakter.',
  email_not_confirmed: 'Silakan verifikasi email Anda terlebih dahulu.',
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
