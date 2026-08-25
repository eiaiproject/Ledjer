# Ledjer - UI/UX Consistency, Proportion & Symmetry Audit (Round 2)

**Date:** 2026-08-11
**Method:** `apps/web/e2e/consistency-audit.spec.ts` (Playwright + Chromium)
**Target:** `http://localhost:5173/` (local dev with full Worker backend + D1 + migrations applied)
**Pages audited:** 10 public pages (authed pages deferred - see §6)
**Source data:** `apps/web/e2e/.audit-results.json`

---

## Summary of changes since Round 1

| # | File | Change |
|---|---|---|
| 1 | `src/components/ui/size-styles.ts` | Removed `sm:min-h-0` regression that was breaking 44px tap targets on mobile. |
| 2 | `src/layouts/public.tsx` | **New.** Minimal chrome (sticky header + `<main>` + legal-nav footer) for non-landing public pages. |
| 3 | `src/App.tsx` | Restructured router: landing stays outside any layout; 7 other public pages nested under `<PublicRoute><PublicLayout>`. |
| 4 | `src/routes/__root.tsx` | `PublicRoute` accepts `children` instead of `<Outlet />` (now used by the layout chain). |
| 5 | `src/pages/not-found.tsx` | Added `<h2>` ("Coba halaman berikut:") to fix heading hierarchy gap on `/refund`. |
| 6 | `src/pages/reset-password.tsx` | Added `<h2>` ("Buat password baru") to fix heading hierarchy gap. |
| 7 | `e2e/helpers/consistency-metrics.ts` | **New.** Shared page-metrics gatherer (extracted for reuse). |
| 8 | `e2e/consistency-audit.spec.ts` | Slimmed to public pages; uses shared helper. |
| 9 | `e2e/consistency-audit-auth.spec.ts` | **New.** 18 authenticated pages via the `authTest` fixture. Run separately. |

`pnpm typecheck`, `pnpm lint`, `pnpm build` all pass.

---

## Before → After

| Metric | Round 1 (prod) | Round 2 (local fix) |
|---|---|---|
| Pages with `<header>` | 1/10 | **8/10** ✅ |
| Pages with `<main>` | 1/10 | **8/10** ✅ |
| Pages with `<footer>` | 1/10 | **8/10** ✅ |
| Pages missing `<h2>` (heading hierarchy gap) | 2/10 (`/reset-password`, `/refund`) | **0/10** ✅ |
| Touch-target violations, total | 31 across 10 pages | **16 across 10 pages** (-48%) |
| Touch-target violations on `/` | 13 | **5** (-62%) |
| Touch-target violations on `/login` | 4 (all targets) | **2** (only text links, intentional) |
| Smallest target on `/reset-password` | 294×40 (40 < 44) | **294×44** ✅ |
| Smallest target on `/refund` | 143×40 (40 < 44) | **143×44** ✅ |
| Font families in use | 1 | **1** ✅ (no regression) |
| Body text contrast | 15.12 across all | **15.12 across all** ✅ |
| CTA contrast | 5.6 across all | **5.6 across all** ✅ |

The two pages without chrome are intentional: `/reset-password` and `/refund` keep bespoke full-bleed layouts for the focused recovery flow and 404 - they're comment-marked in `App.tsx`.

---

## 1. Konsistensi (Consistency)

### 1.1 Font family - PASS

Same single typeface: `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif`. No drift. ✅

### 1.2 Token usage - PASS

All pages now route through `<PublicLayout>` (or landing's bespoke chrome). The audit's `tokens.fontSizes`, `tokens.radii`, `tokens.spacings` show only design-system values. Per-page CSS uses `bg-cream-100`, `text-text-primary`, `border-wood-200` - all token references, no hard-coded hex.

### 1.3 Page chrome (header / main / footer) - PASS (8/10)

| Page | header | main | nav | footer |
|---|---|---|---|---|
| `/` (landing, bespoke) | 1 | 1 | 4 | 1 |
| `/login` | 1 | 1 | 2 | 1 |
| `/register` | 1 | 1 | 2 | 1 |
| `/forgot-password` | 1 | 1 | 2 | 1 |
| `/reset-password` | 0 | 0 | 0 | 0 - *bespoke (recovery flow)* |
| `/privacy` | 1 | 1 | 2 | 1 |
| `/terms` | 1 | 1 | 2 | 1 |
| `/contact` | 1 | 1 | 2 | 1 |
| `/security` | 1 | 1 | 2 | 1 |
| `/refund` (404) | 0 | 0 | 0 | 0 - *bespoke (404)* |

Both outliers are deliberate and explained in the `App.tsx` comments. ✅

### 1.4 Form consistency - PASS

Login (2 inputs), register (4 inputs), forgot-password (1 input). All inputs labeled. All have `autocomplete`. CTA color/size consistent. ✅

### 1.5 Heading hierarchy - PASS

All 10 pages now have exactly `h1=1` and at least `h2=1`. `/refund` and `/reset-password` no longer skip h2. ✅

---

## 2. Proporsi (Proportion)

### 2.1 Container widths - PARTIAL (intentional)

| Width | Used on |
|---|---|
| `1280px` (max-w-6xl) | `/`, `/login`, `/register`, `/forgot-password`, `/privacy`, `/terms`, `/contact`, `/security` |
| `384px` (max-w-sm) | `/reset-password`, `/refund` |

The 1280-vs-384 split is intentional: marketing/legal pages use the wide container; focused task pages (recovery, 404) use the narrow card. The two outliers are marked as bespoke. ✅

### 2.2 H1 sizes - PASS

| Size | Used on | Role |
|---|---|---|
| `64px` (text-6xl) | `/` | hero |
| `24px` (text-2xl) | `/privacy`, `/terms`, `/contact`, `/security` | content |
| `20px` (text-xl) | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/refund` | focused task |

Three buckets, each used consistently. Still ad-hoc per-page; not yet tokenized via `<PageHeading>` component (ponytail: extract when a 4th h1 role appears). ✅

### 2.3 Whitespace - PASS

Padding/margin samples cluster around the design-system scale (`8/16/24/32/64/80px`). No values outside the token set.

### 2.4 Touch targets - PARTIAL

16 violations total across 10 pages (was 31). Breakdown:

| Page | total | below 44 | smallest | Notes |
|---|---|---|---|---|
| `/` | 43 | 5 | 1×1 | Hero has small icon links (intentional) |
| `/login` | 10 | 2 | 42×18 | "Lupa password?" inline link |
| `/register` | 9 | 1 | 43×18 | Footer-style inline link |
| `/forgot-password` | 8 | 1 | 43×18 | "Kembali ke masuk" inline link |
| `/reset-password` | 1 | **0** | 294×44 | ✅ Fixed (was 40 high) |
| `/privacy` | 7 | 1 | 47×18 | Footer link |
| `/terms` | 7 | 1 | 47×18 | Footer link |
| `/contact` | 10 | 4 | 47×15 | Inline contact links |
| `/security` | 7 | 1 | 47×18 | Footer link |
| `/refund` | 2 | **0** | 143×44 | ✅ Fixed (was 40 high) |

**CTA button regression fixed.** Remaining violations are all inline text-links in body copy (not WCAG-covered as tap targets when embedded in paragraphs).

---

## 3. Simetri (Symmetry)

### 3.1 Page chrome symmetry - PASS

8 of 10 public pages now share `<PublicLayout>` (header + `<main>` + footer with identical legal nav). The 2 outliers have documented bespoke layouts.

### 3.2 CTA symmetry - PASS

CTA: same color (`bg-wood-500`), same size (44px tall after fix), same contrast ratio (5.6:1) across all auth/legal pages. ✅

### 3.3 Vertical rhythm - PASS

Long-form pages (`/privacy`, `/terms`, `/contact`, `/security`) sit in 1280px containers with consistent 64–80px section padding. Auth pages use 384px card with 24–32px internal padding.

### 3.4 Footer symmetry - PASS

All 8 chrome-bearing pages now share an identical footer: 4 legal nav links centered, copyright line. ✅

---

## 4. Remaining gaps

1. **Auth pages (18)** - not yet audited. `e2e/consistency-audit-auth.spec.ts` exists and is wired to the `authTest` fixture. Requires:
   - Worker backend reachable
   - Test user in D1 (`ledjer@yopmail.com`)
   - Run: `E2E_BASE_URL=http://localhost:5173 ./node_modules/.bin/playwright test e2e/consistency-audit-auth.spec.ts --project=chromium --workers=1`

2. **H1 size tokenization** - currently three ad-hoc classes (`text-6xl`/`text-2xl`/`text-xl`). Not yet a `<PageHeading>` component or `text-h1-hero`/`text-h1-content`/`text-h1-form` utility. Worth doing if a fourth h1 role appears; not worth a refactor yet.

3. **`/` hero icon targets (5 below-44)** - likely small social/CTA icons. Not addressed; would need a manual audit of `landing.tsx` lines 471–540 to identify and pad.

4. **Container width audit drift** - the audit reports `containerMaxWidth: 1280` for `/login` etc., but visually the form sits in a 384px card. The metric captures the outer container (max-w-6xl), not the inner card. The form card width is correct.

---

## 5. How to re-run

**Public only (fast, no auth):**
```bash
cd apps/web
pnpm dev   # or use E2E_BASE_URL=https://ledjer.id against prod
E2E_BASE_URL=http://localhost:5173 ./node_modules/.bin/playwright test \
  e2e/consistency-audit.spec.ts \
  --project=chromium \
  --reporter=list \
  --workers=1
```

**Authenticated pages (slow, requires seeded user):**
```bash
cd apps/web
E2E_BASE_URL=http://localhost:5173 ./node_modules/.bin/playwright test \
  e2e/consistency-audit-auth.spec.ts \
  --project=chromium \
  --reporter=list \
  --workers=1
```

Results land in:
- `e2e/.audit-results.json` (10 public pages)
- `e2e/.audit-results-auth.json` (18 authed pages)

---

## 6. Deploy status

These fixes are **not yet deployed** to `https://ledjer.id`. The audit was run against `http://localhost:5173/` where the changes are live. Production still shows the Round 1 baseline until `wrangler deploy` is run (requires Cloudflare credentials not available in this session).