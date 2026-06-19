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
  user_not_found: 'Email tidak terdaftar.',
  weak_password: 'Password terlalu lemah. Gunakan minimal 8 karakter.',
  email_not_confirmed: 'Silakan verifikasi email Anda terlebih dahulu.',
};

export function translateError(error: unknown): string {
  if (!error) return 'Terjadi kesalahan. Silakan coba lagi.';

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message;

    // Check for known Postgres error codes embedded in message
    for (const [code, msg] of Object.entries(ERROR_MAP)) {
      if (message.includes(code)) return msg;
    }

    // Auth errors
    for (const [key, msg] of Object.entries(AUTH_MESSAGES)) {
      if (message.toLowerCase().includes(key.toLowerCase())) return msg;
    }

    // JWT errors
    if (message.includes('JWT')) return AUTH_MESSAGES.JWT_INVALID;

    // RPC exceptions (Postgres RAISE EXCEPTION) — already in Indonesian from backend
    if (/^[A-Z]/.test(message) && message.length > 10) {
      return message;
    }

    // Network errors
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
    }
  }

  // Handle Supabase error objects with code property
  const errorObj = error as Record<string, unknown>;
  if (errorObj && typeof errorObj === 'object') {
    const code = errorObj.code as string | undefined;
    if (code && ERROR_MAP[code]) return ERROR_MAP[code];

    const message = errorObj.message as string | undefined;
    if (message) {
      // RPC exceptions (Postgres RAISE EXCEPTION) — already in Indonesian
      if (/^[A-Z][a-z]/.test(message)) return message;
    }
  }

  return 'Terjadi kesalahan. Silakan coba lagi.';
}
