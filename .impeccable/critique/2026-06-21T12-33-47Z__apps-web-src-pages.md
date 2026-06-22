---
target: apps/web/src/pages
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-21T12-33-47Z
slug: apps-web-src-pages
---
# Ledjer Evaluate Report: apps/web pages

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading, usage, save and toast states exist; some async auth/error states are still sparse. |
| 2 | Match System / Real World | 3 | UMKM/accounting language is concrete; several accounting terms still need contextual help for first-timers. |
| 3 | User Control and Freedom | 3 | Filters reset, onboarding skip, modals close, unsaved changes guard exists; bulk/undo paths are limited. |
| 4 | Consistency and Standards | 3 | Strong shared component vocabulary; a few local size overrides break the target vocabulary. |
| 5 | Error Prevention | 3 | Validation, confirmations, smart defaults are present; no draft recovery/autosave for long forms. |
| 6 | Recognition Rather Than Recall | 3 | Labels and command palette help; report/account concepts still rely on prior knowledge. |
| 7 | Flexibility and Efficiency | 2 | Cmd+K and shortcuts exist, but no bulk actions and limited accelerators for dense workflows. |
| 8 | Aesthetic and Minimalist Design | 3 | Clearer than before; landing mockup still uses nested panel/card structure. |
| 9 | Error Recovery | 3 | Inline errors and retry states exist; some backend messages can leak implementation detail. |
| 10 | Help and Documentation | 2 | Inline hints exist, but no task help for accounting/report interpretation. |
| **Total** | | **28/40** | **Good** |

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Muted small text fails 4.5:1; mobile controls are often 40px high. |
| 2 | Performance | 3 | Build is healthy and routes are split; transaction/team modules are large. |
| 3 | Responsive Design | 3 | Browser metrics show no horizontal overflow at 390px; touch targets remain the main gap. |
| 4 | Theming | 3 | Tokens are strong; muted token and hard-coded Google SVG fills are exceptions. |
| 5 | Anti-Patterns | 3 | CLI detector clean; browser overlay flags mostly intentional palette/font plus some nested card structure. |
| **Total** | | **14/20** | **Good** |

## Anti-Patterns Verdict

Does it look AI-generated? Not strongly. The current direction has a credible, grounded accounting identity. The deterministic CLI detector returned `[]` across pages/components/layouts. Browser overlay injection found 4 issues on landing, 2 on login, 1 on register: low contrast text, nested-card structure in the landing mockup, and palette/font warnings. Palette/font are mostly false positives because Ledjer has an explicit documented cream/wood identity, but the low-contrast and nested-card signals are valid enough to address.

## Overall Impression

Ledjer now feels coherent and trustworthy: warm accounting surfaces, concrete Rupiah examples, restrained product UI, and useful state feedback. The biggest opportunity is not more decoration; it is accessibility hardening and power-user efficiency across the dense bookkeeping workflows.

## What's Working

- The landing page has a concrete bookkeeping story rather than abstract fintech promises.
- Forms, empty states, modals, and data tables use a consistent product vocabulary.
- Responsive layout is structurally solid: CDP reported `clientWidth=390` and `scrollWidth=390` on the landing page.

## Priority Issues

### [P1] Muted text contrast is below WCAG AA

Why it matters: Small helper/security/footer/meta text using `text-wood-400` is around 3.4-3.6:1 on cream surfaces, below the 4.5:1 requirement for normal text. Users with low vision will miss supporting information.

Fix: Darken the muted text token or reserve `text-wood-400` for icons/decorative metadata; use `text-wood-500` or stronger for readable text.

Suggested command: `$impeccable audit apps/web`

### [P1] Mobile touch targets are below the 44px product standard

Why it matters: Inputs/buttons often render at 40px high, while local overrides reduce some icon buttons to 32px. This is fragile for one-handed mobile use and motor accessibility.

Fix: Make mobile controls at least 44px high, and remove `h-8 w-8 min-h-0 min-w-0` overrides from mobile-reachable icon actions.

Suggested command: `$impeccable adapt apps/web`

### [P2] Auth pages lose a visible h1 on mobile

Why it matters: Login/register use a desktop-only brand-panel h1, leaving mobile with only an h2 as the first visible heading. Screen reader and document outline semantics become weaker.

Fix: Render the form title as h1 on mobile, or provide a visually hidden h1 when the brand panel is hidden.

Suggested command: `$impeccable harden apps/web/pages/login apps/web/pages/register`

### [P2] Dense workflows lack enough power-user acceleration

Why it matters: Transaction entry, product management, and reports are repeated daily tasks. Cmd+K helps navigation, but there are no bulk actions, saved filters, or strong recent-template paths.

Fix: Add recent transaction templates, saved report filters, and batch affordances where the data model supports them.

Suggested command: `$impeccable shape apps/web/src/pages/transactions`

### [P2] Large page modules make future UI quality harder to maintain

Why it matters: `transactions/new.tsx` is 1057 lines, `_components.tsx` is 873 lines, and `settings/team.tsx` is 658 lines. This increases regression risk for design-system behavior and state handling.

Fix: Split by stable responsibility: selectors, review panel, submit state, permission card, and product form sections.

Suggested command: `$impeccable extract apps/web/src/pages/transactions`

## Persona Red Flags

**Jordan (First-Timer)**: The landing page explains value well, but inside the app terms like Buku Besar, Neraca Saldo, HPP, and CoA still assume accounting familiarity. Jordan needs contextual definitions at report and transaction decision points.

**Sam (Accessibility-Dependent User)**: Labels, roles, and focus styles are generally present, but muted contrast and sub-44px controls make long sessions harder. Mobile auth heading hierarchy also needs correction.

**Alex (Power User)**: Cmd+K exists, but repeated bookkeeping workflows still require one-record-at-a-time operation. Alex will want templates, recent transactions, saved filters, and batch actions.

**Sari (UMKM Owner)**: Sari can understand the landing page quickly, but after sign-up she may not know which report answers which business question. Report pages need plain-language context, not just accounting labels.

## Minor Observations

- Google icon colors in login are hard-coded SVG fills. Acceptable for brand fidelity, but they are outside the token system.
- The landing mockup still contains panels inside panels; it is a contained demo, not a systemic failure.
- The live overlay palette/font warnings are mostly false positives because the project intentionally documents those choices.

## Questions to Consider

- Should Ledjer optimize next for accessibility compliance or daily bookkeeping speed?
- Which accounting terms should be taught inline instead of assumed?
- Are repeated transactions common enough to justify templates before any new feature work?
