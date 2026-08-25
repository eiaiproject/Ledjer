# Ledjer - UI/UX Consistency, Proportion & Symmetry Audit

**Date:** 2026-08-11
**Method:** `apps/web/e2e/consistency-audit.spec.ts` (Playwright + Chromium)
**Pages audited:** 10 public pages (`/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/privacy`, `/terms`, `/contact`, `/security`, `/refund`)
**Source data:** `apps/web/e2e/.audit-results.json`

---

## TL;DR

| Metric | Status |
|---|---|
| HTTP 200 on all pages | OK |
| `<h1>` present on every page | OK |
| Form inputs labeled | OK (0 unlabeled) |
| Body text contrast ≥ 4.5:1 | OK (15.12 across all) |
| CTA button contrast ≥ 4.5:1 | OK (5.6 across all) |
| Font family drift | OK (1 family site-wide) |
| **Page chrome (header/main/nav/footer)** | **FAIL - only landing has it** |
| **Heading hierarchy** | **WARN - `/reset-password` and `/refund` skip h2** |
| **Container width consistency** | **WARN - 3 distinct breakpoints (1280/768/384)** |
| **Touch targets ≥ 44×44** | **FAIL - every page has sub-44 targets** |
| **H1 size consistency** | **WARN - 4 distinct sizes (20/24/30/64px)** |

---

## 1. Konsistensi (Consistency)

### 1.1 Font family - PASS

One typeface site-wide: `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif`. No drift. ✅

### 1.2 Design token usage - PARTIAL

- **Radii** (6 distinct): `0px, 4px, 8px, 12px, 16px, 9999px` - drifting, no single scale
- **Font sizes** (8 distinct): `12, 14, 16, 18, 20, 24, 30, 64` - `64px` only used on `/` hero (intentional), the rest cluster at standard 4-pt increments ✅
- **H1 font size drift** - 4 distinct values:
  - `/`: `64px` (hero)
  - `/privacy`, `/terms`, `/contact`, `/security`: `24px` (legal/info)
  - `/login`, `/register`, `/forgot-password`, `/reset-password`, `/refund`: `20px` (auth)
- **Recommendation:** lock h1 to `text-4xl` (36px) or a Tailwind `text-h1` token across content pages; `64px` ok only for landing hero.

### 1.3 Form consistency - PASS

All forms use `autocomplete` attributes. Login → 2 inputs, register → 4 inputs, forgot-password → 1 input. No unlabeled inputs anywhere.

### 1.4 Page chrome (header/main/nav/footer) - FAIL

| Page | header | main | nav | footer |
|---|---|---|---|---|
| `/` (landing) | 1 | 1 | 4 | 1 |
| Every other page | 0 | 0 | 0 | 0 |

**This is the single largest consistency gap.** Only the landing page is wrapped in a layout with header/footer/main landmarks. All other public pages render in a "naked" frame - no shared nav, no breadcrumbs, no "Back to home" affordance beyond what's in markup.

**Impact:**
- Users deep in `/terms` have no way to return to marketing context except the back button.
- Screen-reader users lose site-wide navigation landmarks after leaving landing.
- SEO: search engines see 9/10 pages without nav, weakening internal-link graph.

**Recommendation:** add a minimal `<Layout>` wrapper (header with logo + back link + footer with mini-nav) for all public pages. The marketing header can stay full on `/`; pages like `/login` can use a stripped variant.

### 1.5 Heading hierarchy - WARN

| Page | h1 | h2 | h3 | Notes |
|---|---|---|---|---|
| `/` | 1 | 10 | 0 | marketing sections |
| `/login` | 1 | 1 | 0 | ✅ |
| `/register` | 1 | 1 | 0 | ✅ |
| `/forgot-password` | 1 | 1 | 0 | ✅ |
| `/reset-password` | 1 | 0 | 0 | **skips h2** |
| `/privacy` | 1 | 10 | 0 | sectioned legal doc |
| `/terms` | 1 | 11 | 0 | sectioned legal doc |
| `/contact` | 1 | 1 | 3 | h3 sub-blocks under h2 (likely FAQ cards) |
| `/security` | 1 | 4 | 6 | mixed sub-blocks |
| `/refund` | 1 | 0 | 0 | **404 page has no h2** |

**Issues:**
- `/reset-password` jumps from h1 to nothing - no "instructions" subheading. Mild a11y regression for screen readers who expect hierarchy.
- `/refund` (the 404 page) is bare. Add at least an h2 like "Buton berguna" or "Coba:" with nav links.

---

## 2. Proporsi (Proportion)

### 2.1 Container widths - WARN

Three breakpoints in active use:

| Width | Used on |
|---|---|
| `1280px` | `/` (landing hero container) |
| `768px` | `/privacy`, `/terms`, `/contact`, `/security` (long-form content) |
| `384px` | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/refund` (auth forms) |

The 768/384 split is reasonable (long-form vs. focused forms), but `/privacy` and `/terms` would benefit from the same width as `/contact` and `/security` for cross-doc consistency - they do. ✅ within long-form group.

`/refund` (404) at 384px feels cramped; consider bumping to 768 for parity with other error/info states.

### 2.2 Whitespace - PASS (sampled)

- Body padding-top/bottom: `0px` everywhere (pages handle their own vertical spacing via section padding). Acceptable.
- Long-form pages (`/privacy`, `/terms`, `/contact`, `/security`) sit inside 768px containers with `64-80px` vertical section padding (per token sample). Consistent.

### 2.3 H1 size vs. role - WARN

H1 sizes correlate with content role (hero / content / form), but the choice isn't tokenized:

```
landing hero       64px   text-6xl
legal/info pages   24px   text-2xl
auth/utility pages 20px   text-xl
```

Recommend a `text-h1` token or shared component (`<PageHeading>`) that locks these three buckets.

### 2.4 Touch targets - FAIL

WCAG 2.5.5 / Apple HIG: minimum 44×44 px tap target.

| Page | targets | below 44 | smallest |
|---|---|---|---|
| `/` | 43 | **13** | 1×1 |
| `/login` | 4 | **4** | 42×18 |
| `/register` | 3 | **3** | 43×18 |
| `/forgot-password` | 2 | **2** | 43×18 |
| `/reset-password` | 1 | 1 | 294×40 |
| `/privacy` | 1 | 1 | 115×18 |
| `/terms` | 1 | 1 | 114×17 |
| `/contact` | 4 | **4** | 103×15 |
| `/security` | 1 | 1 | 120×18 |
| `/refund` | 2 | **2** | 143×40 |

The "smallest" measurements on legal pages (`/privacy`, `/terms`, `/contact`, `/security`) are anchor links like "Kontak kami" or "Syarat & Ketentuan" rendered with `h-18` (~18px). These are text-only anchors, not tap targets per WCAG (which exempts inline text), so the count is misleading there. **Real concern:**

- **`/`**: 13 sub-44 targets. Likely icon buttons in nav, social/footer links with no padding, etc. Inspect.
- **`/login`, `/register`, `/forgot-password`**: ALL interactive elements (links) under 44 tall (18px). Likely "Lupa password?", "Sudah punya akun? Masuk" type links. Add `py-3` or `min-h-[44px]` on auth-page text links.
- **`/contact`**: 4 sub-44 - same pattern.
- **`/reset-password`, `/refund`**: 1-2 below-44 - primary CTA buttons (40px tall). Bump to `py-3` (44px).

---

## 3. Simetri (Symmetry)

### 3.1 Page chrome symmetry - FAIL

See 1.4 above. Asymmetry: landing has full chrome, every other public page has none.

### 3.2 Form symmetry - PASS

Auth forms have:
- Same container width (384px)
- Same h1 size (20px)
- Same input padding/height (sampled in token data)
- Same autocomplete attrs
- Same contrast (15.12 body / 5.6 CTA)
- Same CTA position (bottom-center)

Login, register, forgot-password are visually symmetric. Reset-password is bare (no h2, no helper text - minor asymmetry).

### 3.3 CTA symmetry - PASS (sampled)

Primary CTA across auth pages: same color, same size, same contrast ratio (5.6:1).

### 3.4 Vertical rhythm - PASS

Section padding samples on long-form pages cluster around `64-80px` top/bottom - consistent rhythm across `/privacy`, `/terms`, `/security`.

---

## 4. Cross-cutting recommendations

**Quick wins** (≤30 min each):

1. **Add `<Layout>` wrapper to public pages** - header + footer + main on all 10 pages. Fixes 1.4 (biggest finding).
2. **Bump CTA button height to 44px** - `py-3` instead of `py-2` on auth primary buttons. Fixes ~6 touch-target violations.
3. **Add min-h-[44px] to text-link rows in auth pages** - "Lupa password?" / "Sudah punya akun?" links.
4. **Add h2 + nav links to `/refund`** - 404 currently has no actionable next step beyond the browser back button.
5. **Add an h2 to `/reset-password`** - at least a "Instruksi" or "Cek email Anda" helper heading.

**Larger refactor** (when there's time):

6. **Tokenize h1 sizes** - extract three classes into a `<PageHeading variant="hero|content|form">` component or `text-h1-hero/text-h1-content/text-h1-form` Tailwind utilities.
7. **Audit `/` icon buttons** - 13 sub-44 targets on landing needs manual review; likely nav icon links, footer social links.

---

## 5. How to re-run

```bash
cd apps/web
E2E_BASE_URL=https://ledjer.id ./node_modules/.bin/playwright test \
  e2e/consistency-audit.spec.ts \
  --project=chromium \
  --reporter=list \
  --workers=1
```

Results land in `apps/web/e2e/.audit-results.json` (per-page metrics in full).