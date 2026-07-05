# UI/UX Audit Report — Ledjer Web Application

**Date:** July 5, 2026  
**Scope:** Full frontend UI/UX audit and responsive implementation pass  
**Business logic:** Unchanged. No API, auth, permission, or data model modifications.

---

## Files Changed

### Global Foundation
| File | Changes |
|------|---------|
| `apps/web/src/index.css` | Added `box-sizing: border-box` on all elements, `min-width: 320px` on `html`, `overflow-x: hidden` on `body`, `min-height: 100dvh` fallback on `#root`. Added utility classes: `ledger-min-dvh`, `ledger-safe-bottom`, `ledger-mobile-nav`, `ledger-scroll-x`, `ledger-table`, `ledger-mobile-card-stack`. Added `prefers-reduced-motion` hover disable for touch devices. Scoped coarse-pointer touch-target enforcement. |

### Dashboard Shell & Navigation
| File | Changes |
|------|---------|
| `apps/web/src/layouts/dashboard.tsx` | Added permission-filtered mobile bottom navigation (hidden on `/transactions/new` and when sticky bars conflict). Replaced `min-h-screen` with `ledger-min-dvh`. Converted mobile drawer to flex-column layout with scrollable nav area and fixed footer (no absolute positioning). Added `min-h-[44px]` touch targets on all nav items. |

### Base UI Components
| File | Changes |
|------|---------|
| `apps/web/src/components/ui/card.tsx` | Added `min-w-0` to prevent child overflow. |

### Auth, Onboarding & Public Routes
| File | Changes |
|------|---------|
| `apps/web/src/pages/login.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. Improved mobile padding (`p-4 sm:p-6`). |
| `apps/web/src/pages/register.tsx` | Same viewport and padding fixes. |
| `apps/web/src/pages/forgot-password.tsx` | Same viewport and padding fixes. |
| `apps/web/src/pages/reset-password.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. |
| `apps/web/src/pages/auth-callback.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. |
| `apps/web/src/pages/not-found.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. |
| `apps/web/src/pages/onboarding.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. |
| `apps/web/src/pages/invitations/accept.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. Improved mobile padding. |
| `apps/web/src/routes/__root.tsx` | Replaced `h-screen` with `ledger-min-dvh`. |
| `apps/web/src/components/config-error.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. |
| `apps/web/src/components/onboarding-guard.tsx` | Replaced `h-screen` with `ledger-min-dvh`. |

### Transactions
| File | Changes |
|------|---------|
| `apps/web/src/pages/transactions/index.tsx` | Added `ledger-mobile-card-stack` to mobile card list. Replaced `overflow-x-auto` with `ledger-scroll-x` on desktop table. |
| `apps/web/src/pages/transactions/new.tsx` | Added iOS safe-area padding (`env(safe-area-inset-bottom)`) to sticky submit bar. |
| `apps/web/src/pages/transactions/[id].tsx` | Replaced `overflow-x-auto` with `ledger-scroll-x` on journal table. |

### Products
| File | Changes |
|------|---------|
| `apps/web/src/pages/products/index.tsx` | Added `ledger-mobile-card-stack` to mobile card list. Replaced `overflow-x-auto` with `ledger-scroll-x` on desktop table. |

### Accounts
| File | Changes |
|------|---------|
| `apps/web/src/pages/accounts/index.tsx` | Added `min-h-[44px]` touch targets on tab buttons. |

### Reports
| File | Changes |
|------|---------|
| `apps/web/src/pages/reports/trial-balance.tsx` | Replaced `overflow-x-auto` + `w-full text-sm` with `ledger-scroll-x` + `ledger-table`. |
| `apps/web/src/pages/reports/profit-loss.tsx` | Same table standardization. |
| `apps/web/src/pages/reports/balance-sheet.tsx` | Same table standardization (both asset and liability tables). |
| `apps/web/src/pages/reports/general-ledger.tsx` | Same table standardization. |

### Billing
| File | Changes |
|------|---------|
| `apps/web/src/pages/settings/billing.tsx` | Improved responsive vertical padding (`py-6 sm:py-8`). |

### Landing
| File | Changes |
|------|---------|
| `apps/web/src/pages/landing.tsx` | Replaced `min-h-screen` with `ledger-min-dvh`. |

---

## Key UX Improvements

1. **Dynamic viewport** — All full-height containers use `100dvh` with `100vh` fallback, fixing iOS Safari/Android Chrome address bar resizing.
2. **Mobile bottom navigation** — Permission-filtered bottom nav for fast access to Dashboard, Transactions, Accounts, Products. Automatically hidden on `/transactions/new` to avoid conflict with the sticky submit bar.
3. **Drawer scroll safety** — Mobile drawer uses flex-column layout with scrollable nav; footer stays fixed without `absolute` positioning that could cover menu items.
4. **Touch targets** — All buttons, nav items, and interactive controls have `min-h-[44px]` on mobile. Coarse-pointer media query enforces 44px minimum on interactive elements.
5. **Safe-area insets** — iOS notch/home-indicator handled via `env(safe-area-inset-bottom)` on sticky action bars and mobile navigation.
6. **Standardized tables** — `ledger-table` class ensures consistent table sizing, headers, rows, and hover states across all report and data tables.
7. **Horizontal scroll** — `ledger-scroll-x` provides consistent, touch-friendly horizontal scrolling with `-webkit-overflow-scrolling: touch` and `overscroll-behavior-x: contain`.
8. **Card overflow prevention** — `min-w-0` on Card component prevents text/code overflow on narrow screens.
9. **Touch device hover** — Hover `translateY` effects disabled on touch devices to prevent jumpy mobile behavior.
10. **No horizontal overflow** — `body { overflow-x: hidden }` and `min-width: 320px` on `html` prevent accidental page-level scrolling.

---

## Validation Commands Run

| Command | Result |
|---------|--------|
| `tsc --noEmit` | ✅ Passed — zero TypeScript errors |
| `eslint src --max-warnings=50` | ✅ Passed — zero lint errors |

---

## Remaining Recommended Next Steps

1. **Report filter responsiveness** — Make report action buttons (Muat Ulang, Export CSV) stack full-width on mobile in trial-balance, profit-loss, and general-ledger pages.
2. **Team settings page** — Add responsive refinements: full-width stacked CTAs on mobile, improved invitation card layout.
3. **Skeleton alignment** — Align `TransactionListSkeleton` table markup with the `ledger-table` helper class for visual consistency with real tables.
4. **Visual regression testing** — Run Playwright visual tests (`npm run test:visual`) to confirm no layout regressions from CSS changes.
5. **Input/Select disabled states** — Audit all disabled and read-only states for consistent background/cursor behavior across browsers.
