# Supabase Auth — Private Beta Production Checklist

## Email Confirmation

**Recommended for private beta:** Enabled.

The app supports email confirmation (`needsEmailConfirmation` flow in `auth.tsx`). The local `config.toml` has `enable_confirmations = false` for development convenience. For private beta, enable it in the Supabase dashboard.

### Why enable email confirmation

- Prevents fake/test accounts from accessing the app.
- Ensures all beta users have a verified email for support contact.
- Required for `invite_staff` to work (it checks `email_confirmed_at`).

### How to enable

Supabase dashboard → Authentication → Providers → Email:

- [ ] **Confirm email** = ON
- [ ] **Double confirm changes** = ON
- [ ] **Enable signup** = ON

## Supabase Dashboard Configuration

Go to Supabase dashboard → Project Settings → Authentication.

### Site URL

```
https://ledjer-ahk.pages.dev
```

### Redirect URLs

Add every URL Supabase may redirect to after auth flows:

```
https://ledjer-ahk.pages.dev
https://ledjer-ahk.pages.dev/auth/callback
https://ledjer-ahk.pages.dev/auth/callback?type=recovery
http://localhost:5173
http://localhost:5173/auth/callback
```

The frontend uses `/auth/callback` as the single entry point for all OTP types (signup, recovery, magiclink, email_change).

### Email Templates

Verify these paths exist in the templates:

- **Confirm signup**: Link should redirect to `<SITE_URL>/auth/callback?type=signup&token={{token}}`
- **Magic Link**: Link should redirect to `<SITE_URL>/auth/callback?type=magiclink&token={{token}}`
- **Change Email**: Link should redirect to `<SITE_URL>/auth/callback?type=email_change&token={{token}}`

### SMTP Provider

For private beta with a small number of users, Supabase's built-in email (Inbucket for local, Resend / SMTP for hosted) is sufficient.

- [ ] **Local:** Inbucket captures emails at `http://localhost:54324`
- [ ] **Hosted:** Configure SMTP in dashboard → Authentication → SMTP Settings

If using a custom SMTP provider (recommended for production):

```
Sender email:  noreply@ledjer.id
SMTP Host:     <your-provider>
SMTP Port:     587
Username:      <your-username>
Password:      <your-password>  (set via Supabase dashboard, not in code)
```

### Password Reset

The frontend has a dedicated reset-password flow:

1. User clicks "Lupa password?" on `/login`
2. User enters email on `/forgot-password`
3. Supabase sends recovery email with link to `/auth/callback?type=recovery`
4. Frontend verifies OTP and redirects to `/reset-password`
5. User sets new password

Verify redirect URLs include the recovery callback path (see above).

### JWT / Session Settings

From `supabase/config.toml` — these are local defaults. For hosted Supabase, configure in dashboard:

- [ ] **JWT expiry:** 3600 seconds (1 hour)
- [ ] **Refresh token rotation:** Enabled
- [ ] **Refresh token reuse interval:** 10 seconds

## Pre-Invite Beta User Checklist

Before inviting the first beta user:

- [ ] Email confirmation enabled in Supabase dashboard
- [ ] Site URL set to `https://ledjer-ahk.pages.dev`
- [ ] Redirect URLs include production domain + `/auth/callback`
- [ ] SMTP configured and tested (send a test email from dashboard)
- [ ] Password reset flow tested end-to-end
- [ ] Email confirmation flow tested end-to-end
- [ ] Auth redirect domain matches production domain (no mismatched redirect errors)

## Local Development Differences

| Setting | Local (`config.toml`) | Production (Dashboard) |
|---------|----------------------|----------------------|
| Email confirmations | `false` | **ON** |
| SMTP | Inbucket (port 54324) | Real SMTP provider |
| Site URL | `https://ledjer-ahk.pages.dev` | `https://ledjer-ahk.pages.dev` |
| Redirect URLs | Includes `localhost:5173` | Production domain only (+ dev for debugging) |
| JWT expiry | 3600 | 3600 |

Local dev remains convenient — `enable_confirmations = false` lets you skip email verification during development. Production/private beta uses email confirmation.
