# Auth Flows

Dokumentasi ini menjelaskan alur autentikasi yang dipakai Ledjer, baik untuk signup, login, maupun password recovery.

## Daftar Alur

1. [Sign up + email confirmation](#sign-up--email-confirmation)
2. [Login](#login)
3. [Password recovery](#password-recovery)
4. [Konfigurasi Supabase yang diperlukan](#konfigurasi-supabase-yang-diperlukan)

---

## Sign up + email confirmation

**Trigger:** user submit form di `/register`.

```
Browser                              Supabase                  Email
  │── signUp(email, password) ────────►│
  │                                    │── kirim email ────────►│
  │◄── { user, session? } ────────────│                         │
  │                                    │                         │
  │ (user klik link di email)         │                         │
  │── GET /auth/callback?type=signup ──►│
  │   &token_hash=...                  │                         │
  │── verifyOtp({ token_hash,          │                         │
  │             type: 'signup' }) ─────►│
  │◄── { session, user } ─────────────│
  │── navigate('/onboarding')                                     │
```

**File yang terlibat:**
- `apps/web/src/contexts/auth.tsx` — `signUp()` calls `supabase.auth.signUp({ ..., emailRedirectTo: ${origin}/auth/callback })`
- `apps/web/src/pages/auth-callback.tsx` — handle `type=signup` → redirect ke `/onboarding`

---

## Login

**Trigger:** user submit form di `/login`.

```
Browser                              Supabase
  │── signInWithPassword(email, pw) ──►│
  │◄── { session, user } ─────────────│
  │── navigate('/dashboard')                                    │
```

**Catatan operasional:**
- Rate limit: Supabase `login_attempts` table + `record_login_attempt` RPC untuk brute-force detection.
- Email-not-confirmed: tampilkan UI khusus dengan tombol "Kirim ulang email".

---

## Password recovery

**Trigger:** user klik "Lupa password?" di `/login`.

```
Browser                              Supabase                  Email
  │── resetPasswordForEmail(          │                         │
  │     email,                        │                         │
  │     { redirectTo:                 │                         │
  │       '/auth/callback?type=       │                         │
  │        recovery' }) ─────────────►│                         │
  │                                    │── kirim email ────────►│
  │◄── { error? } ────────────────────│                         │
  │ (always show 'cek email Anda' regardless of whether email exists)
  │                                    │                         │
  │ (user klik link di email)         │                         │
  │── GET /auth/callback?type=        │                         │
  │   recovery&token_hash=...  ─────►│                         │
  │── verifyOtp({ token_hash,         │                         │
  │             type: 'recovery' }) ──►│
  │◄── { session, user } ─────────────│                         │
  │── navigate('/reset-password')                                │
  │                                                                  │
  │ (user isi password baru)                                          │
  │── updateUser({ password }) ─────►│                              │
  │◄── { user } ──────────────────────│                              │
  │── signOut()  (force re-auth)                                   │
  │── navigate('/login')                                           │
```

**File yang terlibat:**

| File | Peran |
|------|-------|
| `apps/web/src/pages/login.tsx` | Tambah link "Lupa password?" |
| `apps/web/src/pages/forgot-password.tsx` | Form email + `resetPasswordForEmail({ redirectTo })` |
| `apps/web/src/pages/auth-callback.tsx` | Handle `type=recovery` → navigate ke `/reset-password` |
| `apps/web/src/pages/reset-password.tsx` | Validasi password baru + `updateUser({ password })` + signOut |

**Pertahanan berlapis (defense in depth):**

1. **Anti account-enumeration.** `resetPasswordForEmail` selalu menampilkan UI sukses yang sama regardless of apakah email tersebut terdaftar. Attacker tidak bisa menebak daftar user via endpoint ini.
2. **Rate limit server-side.** Supabase auth endpoints punya rate limiting built-in.
3. **Session force-revoke.** Setelah `updateUser({ password })`, frontend secara eksplisit memanggil `signOut()` agar session lama invalidated dan user harus login ulang dengan password baru.
4. **Token expiry.** Supabase recovery token berlaku ~1 jam; setelah itu `verifyOtp` mengembalikan error dan flow berhenti di halaman error `/auth/callback`.
5. **Password policy.** Min 8 karakter, max 72 karakter (bcrypt limit). Validasi client-side via Zod; Supabase juga enforce minimum di server-side.

**Failure modes:**

| Skenario | UI |
|----------|-----|
| Email tidak ditemukan | "Cek email Anda" (sama seperti sukses — anti enumeration) |
| Token expired | `/auth/callback` tampilkan error "Tautan tidak valid atau sudah kedaluwarsa" |
| User buka `/reset-password` tanpa session recovery | "Tautan pemulihan tidak valid. Minta tautan baru." + tombol kembali ke `/login` |
| Rate limit tercapai | "Terlalu banyak percobaan. Coba lagi dalam X detik." |
| `updateUser` gagal (mis. password sama dengan yang lama) | Error dari Supabase ditampilkan via `translateError` |

---

## Konfigurasi Supabase yang diperlukan

### 1. Redirect URLs

Di `supabase/config.toml` section `[auth]`:

```toml
[auth]
additional_redirect_urls = [
  "https://ledjer.id",
  "https://ledjer.id/auth/callback",  # wajib ada untuk recovery
  "http://localhost:5173",                # dev
  "http://localhost:5173/auth/callback",  # dev
]
```

Supabase **hanya** mengizinkan redirect ke URL yang ada di whitelist. Path `/auth/callback` adalah single entry point — `auth-callback.tsx` mendispatch berdasarkan query string `type`.

Untuk production deployment via Supabase Cloud (bukan local stack), edit whitelist via Dashboard → Authentication → URL Configuration → Redirect URLs. **Wildcard tidak didukung** — setiap URL harus exact match.

### 2. Email templates (production)

Supabase mengirim email dengan template default-nya. Untuk customize branding (logo, copy Bahasa Indonesia, dsb.):

1. Dashboard → Authentication → Email Templates
2. Edit **Reset Password** template
3. Set `{{ .ConfirmationURL }}` — ini otomatis berisi token dan redirect ke URL yang kita pass via `redirectTo`
4. Edit **Confirm signup** template similarly

**Tidak perlu** hardcode URL di template karena `redirectTo` parameter dari `resetPasswordForEmail` / `signUp` akan meng-override default.

### 3. Site URL

`site_url` di `config.toml` adalah default redirect ketika tidak ada `redirectTo` parameter. Nilai yang dikomit harus menunjuk ke domain produksi:

```toml
[auth]
site_url = "https://ledjer.id"
```

### 4. JWT expiry

Saat ini `jwt_expiry = 3600` (1 jam). Untuk financial app dengan multi-device login, pertimbangkan menurunkan ke 900 (15 menit) dengan refresh-token rotation. Saat ini rotation sudah enabled (`enable_refresh_token_rotation = true`).

---

## Testing

| Layer | File |
|-------|------|
| Unit — forgot-password | `apps/web/src/__tests__/forgot-password.test.tsx` (6 tests) |
| Unit — auth-callback | `apps/web/src/__tests__/auth-callback.test.tsx` (8 tests) |
| Unit — reset-password | `apps/web/src/__tests__/reset-password.test.tsx` (6 tests) |
| Unit — login link | `apps/web/src/__tests__/login.test.tsx` (3 tests) |
| **Integration — full flow** | `apps/web/src/__tests__/password-recovery-flow.test.tsx` (3 tests) |

Integration test renders the full chain (`/forgot-password` → `/auth/callback` → `/reset-password` → `/login`) with mocked Supabase. If any step regresses (redirect target, OTP type, session handling, signOut, dstb.), the test fails with a clear message.

## Manual verification (production)

Setelah deploy, test recovery flow end-to-end:

1. Buka halaman login di production
2. Klik "Lupa password?"
3. Masukkan email akun yang ada
4. Cek inbox — link harus datang dalam < 1 menit
5. Klik link — harus redirect ke `/auth/callback?type=recovery` lalu ke `/reset-password` (BUKAN ke `/settings/team`)
6. Submit password baru
7. Coba login dengan password lama → harus gagal
8. Coba login dengan password baru → harus berhasil
9. Ulangi dengan email yang TIDAK terdaftar → tetap muncul "Cek email Anda" tanpa bocoran info
