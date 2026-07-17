#!/usr/bin/env bash
# Script untuk membantu diagnosa masalah PASSWORD_PEPPER
# Menampilkan sample hash dari database untuk verifikasi format
set -euo pipefail

echo "=== Mengecek sample user dari database ==="
npx wrangler d1 execute ledjer-production \
  --command "SELECT id, email, substr(password_hash, 1, 50) as hash_prefix, email_verified_at, status FROM users LIMIT 5"

echo ""
echo "=== Verifikasi format hash ==="
echo "Format yang diharapkan: pbkdf2-sha256\$100000\$base64salt\$base64hash"
echo "Atau legacy: pbkdf2-sha256\$210000\$base64salt\$base64hash"
echo ""
echo "Jika hash tidak diawali 'pbkdf2-sha256', ada masalah dengan hashing."
echo ""
echo "=== Untuk reset password user via SQL ==="
echo "Catatan: tidak bisa generate hash PBKDF2 via SQL murni."
echo "Gunakan endpoint /api/auth/forgot-password untuk kirim email reset."
echo "Atau buat user baru untuk test."
