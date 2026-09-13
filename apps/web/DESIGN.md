---
name: Ledjer
description: Calm double-entry bookkeeping for Indonesian UMKM.
colors:
  primary: "#8B5A3C"
  primary-deep: "#533525"
  ink: "#2A1B17"
  neutral-bg: "#F9F4EB"
  neutral-surface: "#FDFBF6"
  neutral-border: "#E4D0BA"
  success: "#54733D"
  warning: "#8E4528"
  premium: "#6F5519"
  info: "#3D5F7A"
  error: "#A12D1E"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  input:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "40px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Ledjer

## 1. Overview

**Creative North Star: "The Calm Bookkeeper"**

Ledjer is a quiet desk, not a trading floor. A calming earthy bookkeeping system for Indonesian UMKM owners moving off spreadsheets and notebooks into balanced double-entry, where every rupiah in and out lands in a journal that stays balanced. The surface stays paper-calm so long sessions of cash sales, expenses, transfers, and reports feel manageable, never gamified.

Density is task-focused in-app and persuasive-but-concrete on the landing page: business outcome before software feature, accounting correctness as a trust signal without jargon, Rupiah and cash/bank context always visible. This system explicitly rejects cold enterprise fintech, generic gradient SaaS, childish bookkeeping software, and decorative finance landing pages that hide correctness behind noise. It also rejects surfaces that look expensive for their own sake, vague business-growth promises without concrete workflows, and over-simplified accounting that weakens trust.

**Key Characteristics:**
- Paper-calm, earthy, and forgiving — cream surfaces, teak ink, tabular numerals
- Dense but scannable — predictable nav, forgiving forms, clear error recovery
- Trust through correctness — balanced journals, CSV export, no ads or data sale

## 2. Colors

Earthy paper neutrals carry the surface; teak brown carries action; leaf, clay, honey, and sky carry meaning only.

### Primary
- **Aged Teak** (#8B5A3C, wood-500): Primary buttons, active controls. Always with cream-50 text (#FDFBF6).
- **Deep Teak** (#533525, wood-700): Button hover/active, sidebar inverse surface, secondary text. The workhorse ink after Ledger Bark.
- **Ledger Bark** (#2A1B17, wood-900): Primary text on cream. 14.6:1 on cream-50.

### Secondary
- **Sawah Leaf** (#54733D, leaf-600): Success, growth, secondary CTA on success screens only. Background leaf-50 (#F1F6EC), border leaf-200 (#B8D29C).

### Tertiary
- **Wild Honey** (#6F5519, honey-700): Premium tag only. Background honey-50 (#FBF3DC), border honey-200 (#ECC968).
- **Terracotta Clay** (#8E4528, clay-600): Warning and highlights. Background clay-50 (#FBF0E8), border clay-200 (#E9BCA1).
- **Monsoon Sky** (#3D5F7A, sky-600): Info only. Background sky-50 (#EDF2F7), border sky-200 (#B0C6DD).

### Neutral
- **Kertas Kas** (#F9F4EB, cream-100): Page background.
- **Fresh Ledger** (#FDFBF6, cream-50): Default surface, text-on-primary.
- **Ledger Edge** (#E4D0BA, wood-200): Default border; strong border wood-300 (#C9A787), subtle border wood-100 (#F2E8DC).
- **Brick Red** (#A12D1E): Error text. Background #FAEBE5, border #E8B5A8.

### Named Rules
**The Paper-First Rule.** Cream carries 90%+ of every screen. Saturated color appears only on action or status. If the screen looks colorful at arm's length, remove color.
**The One-Voice Rule.** Wood-500 is the single action voice. Leaf never acts as primary except on a confirmed-success screen.
**The Status-With-Shape Rule.** Status is never hue alone — badge dot + border + label, callout icon + title.

## 3. Typography

**Display Font:** Plus Jakarta Sans (with system-ui fallback)
**Body Font:** Plus Jakarta Sans (with system-ui fallback)
**Label/Mono Font:** JetBrains Mono, Fira Code (with ui-monospace fallback, tabular-nums for all money)

**Character:** Plain-spoken and grounded — single warm sans in two weights does the talking, mono steps in only to keep Rupiah columns honest. No display serif, no costume mono.

### Hierarchy
- **Display** (700, clamp(2.25rem, 5vw, 3rem), 1.2): Landing hero only (`Catat uang masuk & keluar`). Never above 6rem, never tighter than -0.04em.
- **Headline** (600, 1.5rem, 1.2): Page titles, card titles.
- **Title** (600, 1rem, 1.2): Card headings, section titles, table heads in wood-600.
- **Body** (400, 1rem, 1.5): Prose and descriptions in wood-700/wood-600. Max 65–75ch.
- **Label** (500, 0.75rem, 1.5): Badges, captions, helper text in wood-500 minimum. Never wood-400 or wood-300 for body — they fail 4.5:1.

### Named Rules
**The Two-Weight Rule.** 400 for reading, 500–700 for action and hierarchy. No light weights on cream.
**The Mono-For-Money Rule.** All amounts use `num-mono` + `tabular-nums`, right-aligned in currency inputs. Never proportional figures for balances.
**The Balance Rule.** h1–h3 use `text-wrap: balance`, p/li use `text-wrap: pretty`.

## 4. Elevation

Flat by default, lift only on response. Depth comes from 1px wood borders and tonal layering (cream-100 page, cream-50 surface, #FFFFFF elevated), not from permanent shadows. Shadows appear on hover, press, drawer, and elevated tables — then disappear.

### Shadow Vocabulary
- **Resting hairline** (`border: 1px solid #E4D0BA`): Cards, inputs, tables at rest. No shadow.
- **Action lift** (`box-shadow: 0 1px 2px 0 rgba(58,38,32,0.05)` / `shadow-xs`): Primary, success, and destructive buttons at rest.
- **Hover lift** (`box-shadow: 0 2px 4px -1px rgba(58,38,32,0.08)` / `shadow-sm`): Button hover, row hover wash at 50% cream-100.
- **Floating panel** (`box-shadow: 0 12px 20px -4px rgba(58,38,32,0.12)` / `shadow-lg`): Drawers, modals, toasts, elevated tables (`rounded-xl`, `#FFFFFF`).
- **Top sheet** (`box-shadow: 0 20px 32px -8px rgba(58,38,32,0.18)` / `shadow-xl`): Reserved for modal over drawer. Never for cards.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. If it has a shadow and did not just respond to you, remove the shadow.
**The Warm-Shadow Rule.** Shadows are always warm brown rgba(58,38,32). Pure black or blue shadows are forbidden.

## 5. Components

Calm, tactile, and forgiving — 44px targets, visible focus, instant press feedback, no dead ends.

### Buttons
- **Shape:** Gently rounded rectangles (8px `rounded-md`, 12px `rounded-lg` for lg only).
- **Primary:** Aged Teak background (#8B5A3C) + cream-50 text, `h-10 px-3 text-sm` (md), `h-12 px-4 text-base` (lg). Min-height 44px on all sizes.
- **Hover / Focus:** Hover Deep Teak (#533525) + `translateY(-1px)` 200ms `cubic-bezier(0.16,1,0.3,1)`; focus `outline: 2px solid #8B5A3C offset 2px`; active `translateY(0)`; disabled 50% opacity, no lift.
- **Secondary / Ghost / Tertiary:** Secondary cream-50 + wood-700 text + wood-200 border; Outline wood-300 border; Ghost wood-600 text, cream-100 hover; Link wood-600 underline-offset-4; Success leaf-500; Danger/error #A12D1E.

### Chips
- **Style:** Pill (`rounded-full border`), tinted bg + darker text + matching border (e.g. success `bg #F1F6EC / text #54733D / border #B8D29C`).
- **State:** Optional 6px dot in the variant hue; `sm px-2 py-0.5 text-xs`, `md px-2.5 py-1`, `lg px-3 py-1.5 text-sm`. Never hue alone — dot + border + label together.

### Cards / Containers
- **Corner Style:** Softly squared (12px `rounded-lg`, 16px `rounded-xl` when elevated).
- **Background:** Fresh Ledger (#FDFBF6) default; #FFFFFF when elevated for lists, tables, toolbars.
- **Shadow Strategy:** Flat at rest (see Elevation). Elevated uses `shadow-lg` + white bg.
- **Border:** 1px Ledger Edge (#E4D0BA); header divider wood-100 (#F2E8DC).
- **Internal Padding:** 20px (`p-5`); header `px-5 py-4`, title `px-5 pt-4 text-base semibold`.

### Inputs / Fields
- **Style:** Cream-50 fill, 1px wood-200 stroke, 8px radius, `h-10` md. Prefix `Rp` in wood-500, currency right-aligned mono. Under 16px bumps to 16px on phones to prevent auto-zoom.
- **Focus:** White bg + `outline: 2px solid #8B5A3C offset 2px`. No glow, no layout shift.
- **Error / Disabled:** Error `border #A12D1E` + `aria-invalid` + inline message; disabled 50% opacity, no spinners (native number spinners removed globally, text + numeric keypad instead).

### Navigation
- **Style:** Sticky top header, cream-50/95 + `backdrop-blur-sm`, 1px wood-200 bottom border. Max-w-6xl, `px-4 sm:px-6 lg:px-8`, 44px targets. Logo left, Masuk (ghost) + Daftar Gratis (primary sm) right. Footer cream-50, centered `text-xs wood-500`, Trakteer link underlined on hover.

### Ledger Status Callout
Signature status block: tinted bg + matching border + variant icon + optional bold title, `rounded-lg border px-4 py-3 text-sm`. Error uses `role="alert"`. Always icon + text, never color alone.

## 6. Do's and Don'ts

### Do:
- **Do** keep surfaces paper-calm — Kertas Kas page (#F9F4EB), Fresh Ledger cards (#FDFBF6), 1px Ledger Edge borders.
- **Do** use Aged Teak (#8B5A3C) as the single action voice with cream-50 text (7.5:1+).
- **Do** set money in JetBrains Mono, tabular-nums, right-aligned; keep Rupiah, kas, and bank context visible.
- **Do** keep 44px touch targets, 2px wood-500 focus rings, `prefers-reduced-motion` fallbacks (crossfade or instant).
- **Do** pair status hue with shape — badge dot + border, callout icon + title — so meaning survives color-blindness.
- **Do** lead with the business outcome before the software feature, and show balanced debit-credit as the trust signal.

### Don't:
- **Don't** make Ledjer feel like cold enterprise fintech, generic gradient SaaS, childish bookkeeping software, or a decorative finance landing page that hides accounting correctness behind visual noise.
- **Don't** build surfaces that look expensive for their own sake, use vague "business growth" promises without showing concrete workflows, or over-simplify accounting to the point that trust is weakened.
- **Don't** use gradient text (`background-clip: text` + gradient), glassmorphism cards, or side-stripe `border-left/right >1px` accents — use full borders, background tints, or leading icons instead.
- **Don't** ship the hero-metric template (giant number + small label + gradient), identical icon+heading+text card grids, tiny uppercase tracked eyebrows on every section, or numbered `01/02/03` markers unless the section truly is a sequence.
- **Don't** set body text in wood-400 (#A87B52) or wood-300 (#C9A787) on cream — they fail 4.5:1. Bump to wood-500 minimum, body to wood-700.
- **Don't** animate layout properties, use bounce/elastic easing, or gate visibility on scroll-reveal classes. Ease `cubic-bezier(0.16,1,0.3,1)`, transform/opacity only, content visible by default.
