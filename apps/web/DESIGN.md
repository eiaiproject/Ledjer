---
name: Ledjer
description: "Pembukuan UMKM Indonesia yang trustworthy, clear, and grounded."
colors:
  primary-wood: "#8B5A3C"
  primary-wood-hover: "#6F4530"
  primary-wood-active: "#533525"
  dark-wood: "#3A2620"
  deepest-wood: "#2A1B17"
  leaf-accent: "#6B8E4E"
  leaf-success: "#54733D"
  leaf-soft: "#DDEACF"
  cream-background: "#F9F4EB"
  cream-surface: "#FDFBF6"
  cream-muted: "#F0E8D8"
  surface-elevated: "#FFFFFF"
  border-default: "#E4D0BA"
  border-subtle: "#F2E8DC"
  text-primary: "#2A1B17"
  text-secondary: "#533525"
  text-tertiary: "#8B5A3C"
  text-muted: "#A87B52"
  clay-warning: "#8E4528"
  clay-soft: "#FBF0E8"
  error: "#A12D1E"
  error-soft: "#FAEBE5"
  honey-premium: "#B88A2E"
  honey-soft: "#FBF3DC"
  sky-info: "#3D5F7A"
  sky-soft: "#EDF2F7"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(2.25rem, 1.4rem + 0.52vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  numeric:
    fontFamily: "JetBrains Mono, 'Fira Code', ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  xxl: "20px"
  full: "9999px"
spacing:
  page-x-mobile: "1rem"
  page-x-desktop: "2rem"
  page-y-mobile: "1.5rem"
  page-y-desktop: "2.5rem"
  component-sm: "0.75rem"
  component-md: "1rem"
  component-lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary-wood}"
    textColor: "{colors.cream-surface}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-wood-hover}"
    textColor: "{colors.cream-surface}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
    typography: "{typography.label}"
  input-md:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 12px"
    typography: "{typography.label}"
  card-default:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge-success:
    backgroundColor: "{colors.leaf-soft}"
    textColor: "{colors.leaf-success}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.label}"
---

# Design System: Ledjer

## 1. Overview

**Creative North Star: "The Shop Counter Ledger"**

Ledjer should feel like the trustworthy ledger sitting beside a busy shop counter: close to daily business, precise about money, and practical enough to use between sales, purchases, stock checks, and bank transfers. The visual system is grounded in earth tones, warm paper surfaces, and visible accounting structure rather than abstract fintech polish.

The landing page is the primary brand surface. It should persuade through concrete Indonesian UMKM context, real bookkeeping outcomes, and product evidence. The authenticated app then becomes calmer and denser: the same palette and typography, but tuned for repeated financial work, tabular numbers, forms, reports, and permissions.

The system explicitly rejects cold enterprise fintech, generic gradient SaaS, childish bookkeeping software, and decorative finance pages that hide accounting correctness behind visual noise.

**Key Characteristics:**
- Warm paper surfaces with wood-brown structure.
- Leaf green used sparingly for growth, success, and the logo mark.
- Sans-serif headings and UI for a clean, modern feel across all surfaces.
- Monospaced numerals only where money or accounting values need alignment.
- Borders carry most structure; shadows are subtle and purposeful.

## 2. Colors

Ledjer's palette is a grounded trade-and-bookkeeping palette: Wood, Leaf, Cream, Clay, Honey, and Sky.

### Primary
- **Wood Brown**: The primary brand and structure color. Use `primary-wood` for primary buttons and key affordances, `primary-wood-hover` for hover, and `primary-wood-active` for active or selected states.
- **Deep Wood**: The dark sidebar, final CTA, and high-contrast inverse surface. Use it when the product needs authority and anchoring.

### Secondary
- **Leaf Green**: The logo mark, success, positive movement, and a small number of trust signals. Leaf is not general decoration; it earns attention because it is rare.
- **Clay Warning**: Warning, caution, and operational attention. Clay supports accounting seriousness without turning every issue into an error.

### Tertiary
- **Honey Premium**: Premium or billing-adjacent emphasis only. It should not compete with Wood as the primary CTA color.
- **Sky Info**: Informational status, report helper states, and neutral educational prompts.

### Neutral
- **Cream Background**: The main page background. It keeps the app approachable, but it must stay paired with dark Wood text for contrast.
- **Cream Surface**: Cards, navigation bars, form controls, and light panels.
- **Elevated White**: Use for surfaces that need to sit above Cream, especially mockups, modals, and important containers.
- **Wood Text Ramp**: Text runs from `text-primary` for dense reading to `text-muted` for secondary hints. Do not use muted text for core financial values.
- **Wood Borders**: Borders are warm and visible enough to define structure without making the UI feel boxed in.

### Named Rules

**The Shop Counter Rule.** Cream is the working surface, Wood is the accounting structure, and Leaf is the earned signal. Do not reverse those roles.

**The Accent Rarity Rule.** Leaf, Honey, Clay, and Sky should clarify status or business meaning. If a color does not explain state, action, or accounting context, remove it.

## 3. Typography

**Primary Font:** Plus Jakarta Sans (with system-ui and Apple system fallback)
**Numeric Font:** JetBrains Mono for numeric alignment only

**Character:** Plus Jakarta Sans provides a clean, modern feel throughout the interface—from headlines to forms to navigation. JetBrains Mono is a precision tool for Rupiah values and account numbers, ensuring financial data aligns properly.

### Hierarchy
- **Display** (700, `clamp(2.25rem, 1.4rem + 0.52vw, 2.75rem)`, 1.2): Landing-page hero and major persuasive moments.
- **Headline** (600, `1.5rem`, 1.2): Page headings, modal headings, onboarding headings, and key section headers.
- **Title** (600, `1rem`, 1.5): Component headers, card headings, table group labels, and dashboard action labels.
- **Body** (400, `1rem`, 1.5): Explanatory text, form copy, and landing-page paragraphs. Keep long prose around 65-75ch.
- **Label** (500, `0.875rem`, 1.5): Buttons, labels, nav items, helper text, and compact interface text.
- **Numeric** (500, `0.875rem`, 1.5): Currency, account balances, financial report values, and transaction amounts.

### Named Rules

**The Numbers Mean Money Rule.** Use JetBrains Mono only where alignment improves financial comprehension. Never use monospace as a lazy shorthand for "technical".

## 4. Elevation

Ledjer uses warm paper layering: borders define most surfaces, while shadows provide slight lift for elevated panels, mockups, drawers, modals, and hover emphasis. Default app surfaces should feel stable and flat enough for repeated work; large, blurry decorative shadows are forbidden.

### Shadow Vocabulary
- **Hairline Lift** (`0 1px 2px 0 rgba(58, 38, 32, 0.05)`): Small affordances and quiet hover states.
- **Low Paper Lift** (`0 2px 4px -1px rgba(58, 38, 32, 0.08), 0 1px 2px -1px rgba(58, 38, 32, 0.04)`): Primary buttons and elevated cards.
- **Panel Lift** (`0 4px 8px -2px rgba(58, 38, 32, 0.10), 0 2px 4px -1px rgba(58, 38, 32, 0.06)`): Popovers and panels that need separation.
- **Mockup Lift** (`0 12px 20px -4px rgba(58, 38, 32, 0.12), 0 4px 8px -2px rgba(58, 38, 32, 0.06)`): Landing-page product mockups and active feature surfaces.
- **Modal Lift** (`0 20px 32px -8px rgba(58, 38, 32, 0.18), 0 8px 16px -4px rgba(58, 38, 32, 0.08)`): Dialogs, mobile drawers, and top-layer surfaces.

### Named Rules

**The Border Before Shadow Rule.** If a surface only needs grouping, use a warm border. Add shadow only when the element is actually elevated, interactive, or top-layer.

## 5. Components

### Buttons

Buttons are tactile, plain-spoken, and trustworthy.

- **Shape:** Gently curved rectangles (`8px` for most buttons, `12px` for large buttons).
- **Primary:** Wood Brown background with Cream text, medium weight label, `40px` default height, `48px` large height.
- **Hover / Focus:** Hover darkens from Wood Brown to Deep Wood; focus uses a `2px` Wood outline with `2px` offset.
- **Secondary / Outline / Ghost:** Secondary buttons use Cream surfaces and Wood borders. Ghost buttons are text-first and only gain Cream fill on hover.
- **Loading / Disabled:** Loading displays an inline spinner. Disabled controls lower opacity and must remain visibly disabled without losing label readability.

### Chips

Badges are status labels, not decoration.

- **Style:** Full-pill shape with a thin border, small label text, and optional dot.
- **State:** Success uses Leaf, warning uses Clay, error uses the explicit red token, info uses Sky, premium uses Honey.
- **Rule:** Pair status color with text and border so color is not the only cue.

### Cards / Containers

Cards and containers should feel like stacked ledger paper.

- **Corner Style:** `12px` for cards, `16px` for featured mockups or major panels.
- **Background:** Cream Surface for ordinary cards, Elevated White for mockups and top surfaces, Cream Background for filled secondary containers.
- **Shadow Strategy:** Border first, shadow second. Default cards use borders only; elevated cards use low paper lift.
- **Border:** Warm Wood borders at `1px`; no colored side stripes.
- **Internal Padding:** `16px`, `20px`, or `24px` depending on density.

### Inputs / Fields

Inputs are quiet and task-focused.

- **Style:** Cream Surface background, Wood border, `8px` radius, `40px` default height, and dark Wood text.
- **Focus:** `2px` Wood outline with `2px` offset. Do not replace focus with color-only border changes.
- **Error / Disabled:** Error uses the red border and readable message text. Disabled controls lower opacity and keep the field shape intact.
- **Currency:** Rupiah fields use `Rp` prefix and right-aligned monospaced numerals.

### Navigation

Navigation is stable, compact, and consistent between landing and app contexts.

- **Landing Header:** Cream Surface with a warm border, compact anchor buttons, and Wood primary CTA.
- **App Sidebar:** Deep Wood surface, Cream active text, and darker Wood selected states. It may collapse, but labels and icons must retain consistent affordance.
- **Mobile:** Sticky Cream header, top-layer Wood drawer, and `44px` minimum touch targets.

### Product Mockups and Stat Cards

The product mockup on the landing page is the proof surface.

- **Mockups:** Use real app vocabulary, Rupiah amounts, and transaction examples. Keep mockup content simple enough to inspect.
- **Stat Cards:** Use `12px` corners, warm borders, Cream surface, and monospaced financial values. Icons sit in soft tone blocks, not large decorative badges.

## 6. Do's and Don'ts

### Do:
- **Do** lead with concrete Indonesian UMKM context: Rupiah, transactions, stock, cash, bank, receivables, payables, and reports.
- **Do** use Wood Brown for primary action and structure, Cream for working surfaces, and Leaf only for the logo, success, or growth.
- **Do** keep financial values dark, legible, and tabular with JetBrains Mono where alignment matters.
- **Do** use borders and `8px` to `16px` radii to make the app feel durable and practical.
- **Do** make accounting correctness visible through balanced journals, audit logs, reports, and precise labels.
- **Do** preserve reduced-motion behavior and clear focus states on every interactive component.

### Don't:
- **Don't** make Ledjer feel like cold enterprise fintech.
- **Don't** use generic gradient SaaS styling, gradient text, or decorative finance glow.
- **Don't** make the product feel like childish bookkeeping software.
- **Don't** create a decorative finance landing page that hides accounting correctness behind visual noise.
- **Don't** make surfaces look expensive for their own sake.
- **Don't** use vague "business growth" promises without showing concrete workflows.
- **Don't** over-simplify accounting to the point that trust is weakened.
- **Don't** use colored side-stripe borders, repeated section eyebrows, or numbered section markers unless the order itself matters.
- **Don't** combine `1px` borders with soft shadows over `16px` blur on the same element as decoration.
- **Don't** use `32px+` card radii, sketchy SVG illustrations, repeating stripe backgrounds, or all-caps body copy.
