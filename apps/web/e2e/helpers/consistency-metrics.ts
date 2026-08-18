/**
 * Shared page-metric gatherer used by both consistency-audit.spec.ts
 * (public pages) and consistency-audit-auth.spec.ts (authenticated pages).
 *
 * Cognitive complexity stays under the S3776 ceiling by splitting the
 * per-page DOM collection into small, single-purpose page.evaluate calls
 * instead of one nested object literal.
 */

import type { Page } from "@playwright/test";
import { waitForAppReady } from "./ready";

export type PageMetrics = {
  url: string;
  status: number;
  title: string;
  tokens: {
    fontFamilies: string[];
    fontSizes: string[];
    radii: string[];
    spacings: string[];
    containerMaxWidth: string | null;
    h1FontSize: string | null;
    bodyFontSize: string | null;
  };
  structure: {
    h1Count: number;
    h1Texts: string[];
    headingOrder: string[];
    landmarks: { header: number; main: number; nav: number; footer: number };
  };
  chrome: {
    hasHeader: boolean;
    hasFooter: boolean;
    headerWidth: number;
    footerWidth: number;
    stickyHeader: boolean;
  };
  forms: {
    formCount: number;
    inputsWithoutLabel: number;
    inputsWithAutocomplete: number;
    inputsTotal: number;
  };
  touchTargets: {
    total: number;
    below44: number;
    smallestW: number;
    smallestH: number;
  };
  contrast: {
    body: { fg: string; bg: string; ratio: number; passes: boolean } | null;
    cta: { fg: string; bg: string; ratio: number; passes: boolean } | null;
  };
  whitespace: {
    bodyPaddingTop: number;
    bodyPaddingBottom: number;
    contentWidth: number;
    viewportWidth: number;
  };
};

function srgbToLin(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function luminance(rgb: string): number {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return 0;
  const [r, g, b] = [Number(m[0]), Number(m[1]), Number(m[2])].map(srgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ratioResult(fg: string, bg: string): { ratio: number; passes: boolean } {
  const r = contrastRatio(fg, bg);
  return { ratio: Math.round(r * 100) / 100, passes: r >= 4.5 };
}

// ── In-page metric collectors ──────────────────────────────────
// Each one is a small page.evaluate payload. Keeping each under ~15
// cognitive-complexity per S3776.

function collectTokens(): PageMetrics["tokens"] {
  const q = <T extends Element>(sel: string) => Array.from(document.querySelectorAll(sel)) as T[];
  const uniq = <T>(arr: T[]) => Array.from(new Set(arr));
  const head = q<HTMLElement>("h1, h2, h3, p, button, small").slice(0, 50);
  const radiiEls = q<HTMLElement>("button, input, .card, [class*='rounded']").slice(0, 80);
  const containers = q<HTMLElement>("main, [class*='container'], [class*='max-w-']");
  const widths = containers.map((el) => el.getBoundingClientRect().width);
  const h1 = document.querySelector<HTMLElement>("h1");
  return {
    fontFamilies: uniq(head.map((el) => getComputedStyle(el).fontFamily)).slice(0, 8),
    fontSizes: uniq(head.map((el) => getComputedStyle(el).fontSize)),
    radii: uniq(radiiEls.map((el) => getComputedStyle(el).borderRadius)),
    spacings: uniq(
      q<HTMLElement>("h1, h2, section, button").slice(0, 80).map((el) => {
        const cs = getComputedStyle(el);
        return `${cs.paddingTop}/${cs.paddingBottom}/${cs.marginTop}/${cs.marginBottom}`;
      }),
    ).slice(0, 12),
    containerMaxWidth: widths.length ? String(Math.max(...widths)) : null,
    h1FontSize: h1 ? getComputedStyle(h1).fontSize : null,
    bodyFontSize: getComputedStyle(document.body).fontSize,
  };
}

function collectStructure(): PageMetrics["structure"] {
  const h1 = Array.from(document.querySelectorAll<HTMLElement>("h1"));
  const all = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
  return {
    h1Count: h1.length,
    h1Texts: h1.map((el) => (el.textContent ?? "").trim().slice(0, 80)),
    headingOrder: all.map((el) => el.tagName.toLowerCase()),
    landmarks: {
      header: document.querySelectorAll("header").length,
      main: document.querySelectorAll("main").length,
      nav: document.querySelectorAll("nav").length,
      footer: document.querySelectorAll("footer").length,
    },
  };
}

function collectChrome(): PageMetrics["chrome"] {
  const h = document.querySelector<HTMLElement>("header");
  const f = document.querySelector<HTMLElement>("footer");
  const sticky = h
    ? getComputedStyle(h).position === "sticky" || getComputedStyle(h).position === "fixed"
    : false;
  return {
    hasHeader: !!h,
    hasFooter: !!f,
    headerWidth: h ? h.getBoundingClientRect().width : 0,
    footerWidth: f ? f.getBoundingClientRect().width : 0,
    stickyHeader: sticky,
  };
}

function collectForms(): PageMetrics["forms"] {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("input, textarea, select"),
  );
  let noLabel = 0;
  let withAuto = 0;
  for (const inp of inputs) {
    const id = inp.id;
    const hasLabel =
      (id && document.querySelector(`label[for="${id}"]`)) ||
      inp.closest("label") ||
      inp.getAttribute("aria-label") ||
      inp.getAttribute("aria-labelledby");
    if (!hasLabel) noLabel += 1;
    if (inp.getAttribute("autocomplete")) withAuto += 1;
  }
  return {
    formCount: document.querySelectorAll("form").length,
    inputsWithoutLabel: noLabel,
    inputsWithAutocomplete: withAuto,
    inputsTotal: inputs.length,
  };
}

function collectTouchTargets(): PageMetrics["touchTargets"] {
  const els = Array.from(document.querySelectorAll<HTMLElement>("a, button"));
  let total = 0;
  let below44 = 0;
  let minW = Infinity;
  let minH = Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    total += 1;
    if (r.width < 44 || r.height < 44) below44 += 1;
    if (r.width < minW) minW = r.width;
    if (r.height < minH) minH = r.height;
  }
  return {
    total,
    below44,
    smallestW: minW === Infinity ? 0 : Math.round(minW),
    smallestH: minH === Infinity ? 0 : Math.round(minH),
  };
}

function collectWhitespace(): PageMetrics["whitespace"] {
  const cs = getComputedStyle(document.body);
  return {
    bodyPaddingTop: Number.parseFloat(cs.paddingTop) || 0,
    bodyPaddingBottom: Number.parseFloat(cs.paddingBottom) || 0,
    contentWidth: Math.min(window.innerWidth, document.documentElement.scrollWidth),
    viewportWidth: window.innerWidth,
  };
}

async function readColors(page: Page): Promise<{
  bodyFg: string;
  bodyBg: string;
  ctaFg: string | null;
  ctaBg: string | null;
}> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const btn = document.querySelector<HTMLElement>(
      "button[type='submit'], a[class*='bg-primary'], button[class*='primary'], a[class*='btn-primary'], button.bg-blue-600, button.bg-primary",
    );
    return {
      bodyFg: cs.color,
      bodyBg: cs.backgroundColor,
      ctaFg: btn ? getComputedStyle(btn).color : null,
      ctaBg: btn ? getComputedStyle(btn).backgroundColor : null,
    };
  });
}

function buildContrast(
  colors: Awaited<ReturnType<typeof readColors>>,
): PageMetrics["contrast"] {
  const body = { fg: colors.bodyFg, bg: colors.bodyBg, ...ratioResult(colors.bodyFg, colors.bodyBg) };
  let cta: PageMetrics["contrast"]["cta"] = null;
  if (colors.ctaFg && colors.ctaBg && colors.ctaBg !== "rgba(0, 0, 0, 0)") {
    cta = { fg: colors.ctaFg, bg: colors.ctaBg, ...ratioResult(colors.ctaFg, colors.ctaBg) };
  }
  return { body, cta };
}

export async function gatherMetrics(page: Page, url: string): Promise<PageMetrics> {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAppReady(page);
  // waitForAppReady resolves as soon as the shell renders without a loading
  // indicator, which can be a tick before the lazy route chunk mounts the
  // page's real content (the shell's <main> may already be present). Each
  // audit test opens a fresh browser context, so route chunks are
  // re-downloaded and the race shows up as spurious h1=0 on cold staging
  // workers. Wait for the page's h1 — the actual content — before measuring
  // structure metrics.
  await page.waitForSelector("h1", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(200);

  const [tokens, structure, chrome, forms, touchTargets, whitespace] = await Promise.all([
    page.evaluate(collectTokens),
    page.evaluate(collectStructure),
    page.evaluate(collectChrome),
    page.evaluate(collectForms),
    page.evaluate(collectTouchTargets),
    page.evaluate(collectWhitespace),
  ]);
  const colors = await readColors(page);

  return {
    url,
    status: resp?.status() ?? 0,
    title: await page.title(),
    tokens,
    structure,
    chrome,
    forms,
    touchTargets,
    contrast: buildContrast(colors),
    whitespace,
  };
}