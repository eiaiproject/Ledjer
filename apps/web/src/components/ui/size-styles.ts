export const SIZE_STYLES = {
  // min-h-[44px] enforces WCAG 2.5.5 / Apple HIG tap targets on every size.
  // Removed the sm:min-h-0 override that was regressing mobile buttons to
  // 32/40px and breaking touch-target audits.
  sm: "min-h-[44px] h-8 px-3 text-sm",
  md: "min-h-[44px] h-10 px-3 text-sm",
  lg: "min-h-[44px] h-12 px-4 text-base",
} as const;
