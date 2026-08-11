/**
 * Shared page-metric gatherer used by both consistency-audit.spec.ts
 * (public pages) and consistency-audit-auth.spec.ts (authenticated pages).
 */

import type { Page } from "@playwright/test";

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

export async function gatherMetrics(page: Page, url: string): Promise<PageMetrics> {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    await page.waitForLoadState("load").catch(() => {});
  }
  await page.waitForTimeout(400);

  const m = await page.evaluate((u: string): PageMetrics => {
    const q = <T extends Element>(sel: string) => Array.from(document.querySelectorAll(sel)) as T[];
    const uniq = <T>(arr: T[]) => Array.from(new Set(arr));

    const h1Els = q<HTMLElement>("h1");
    const allHeadings = q<HTMLElement>("h1, h2, h3, h4, h5, h6");

    const interactives = q<HTMLElement>("a, button");
    let totalT = 0;
    let below44 = 0;
    let minW = Infinity;
    let minH = Infinity;
    for (const el of interactives) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      totalT++;
      if (rect.width < 44 || rect.height < 44) below44++;
      if (rect.width < minW) minW = rect.width;
      if (rect.height < minH) minH = rect.height;
    }

    const inputs = q<HTMLInputElement>("input, textarea, select");
    let noLabel = 0;
    let withAutocomplete = 0;
    for (const inp of inputs) {
      const id = inp.id;
      const hasLabel =
        (id && document.querySelector(`label[for="${id}"]`)) ||
        inp.closest("label") ||
        inp.getAttribute("aria-label") ||
        inp.getAttribute("aria-labelledby");
      if (!hasLabel) noLabel++;
      if (inp.getAttribute("autocomplete")) withAutocomplete++;
    }

    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    const headerSticky = header
      ? getComputedStyle(header).position === "sticky" || getComputedStyle(header).position === "fixed"
      : false;

    const h1 = h1Els[0];
    const body = document.body;

    const viewportW = window.innerWidth;
    const contentW = Math.min(viewportW, document.documentElement.scrollWidth);

    return {
      url: u,
      status: 0,
      title: document.title,
      tokens: {
        fontFamilies: uniq(
          q<HTMLElement>("h1, h2, p, button, a").slice(0, 50).map(
            (el) => getComputedStyle(el).fontFamily,
          ),
        ).slice(0, 8),
        fontSizes: uniq(
          q<HTMLElement>("h1, h2, h3, p, button, small").slice(0, 50).map(
            (el) => getComputedStyle(el).fontSize,
          ),
        ),
        radii: uniq(
          q<HTMLElement>("button, input, .card, [class*='rounded']").slice(0, 80).map(
            (el) => getComputedStyle(el).borderRadius,
          ),
        ),
        spacings: uniq(
          q<HTMLElement>("h1, h2, section, button").slice(0, 80).map((el) => {
            const cs = getComputedStyle(el);
            return `${cs.paddingTop}/${cs.paddingBottom}/${cs.marginTop}/${cs.marginBottom}`;
          }),
        ).slice(0, 12),
        containerMaxWidth: (() => {
          const candidates = q<HTMLElement>("main, [class*='container'], [class*='max-w-']");
          const widths = candidates.map((el) => el.getBoundingClientRect().width);
          return widths.length ? String(Math.max(...widths)) : null;
        })(),
        h1FontSize: h1 ? getComputedStyle(h1).fontSize : null,
        bodyFontSize: getComputedStyle(body).fontSize,
      },
      structure: {
        h1Count: h1Els.length,
        h1Texts: h1Els.map((el) => (el.textContent ?? "").trim().slice(0, 80)),
        headingOrder: allHeadings.map((el) => el.tagName.toLowerCase()),
        landmarks: {
          header: document.querySelectorAll("header").length,
          main: document.querySelectorAll("main").length,
          nav: document.querySelectorAll("nav").length,
          footer: document.querySelectorAll("footer").length,
        },
      },
      chrome: {
        hasHeader: !!header,
        hasFooter: !!footer,
        headerWidth: header ? header.getBoundingClientRect().width : 0,
        footerWidth: footer ? footer.getBoundingClientRect().width : 0,
        stickyHeader: headerSticky,
      },
      forms: {
        formCount: document.querySelectorAll("form").length,
        inputsWithoutLabel: noLabel,
        inputsWithAutocomplete: withAutocomplete,
        inputsTotal: inputs.length,
      },
      touchTargets: {
        total: totalT,
        below44,
        smallestW: minW === Infinity ? 0 : Math.round(minW),
        smallestH: minH === Infinity ? 0 : Math.round(minH),
      },
      contrast: { body: null, cta: null },
      whitespace: {
        bodyPaddingTop: parseFloat(getComputedStyle(body).paddingTop) || 0,
        bodyPaddingBottom: parseFloat(getComputedStyle(body).paddingBottom) || 0,
        contentWidth: contentW,
        viewportWidth: viewportW,
      },
    };
  }, url);

  m.status = resp?.status() ?? 0;

  const contrast = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const fg = getComputedStyle(document.body).color;
    const btn = document.querySelector(
      "button[type='submit'], a[class*='bg-primary'], button[class*='primary'], a[class*='btn-primary'], button.bg-blue-600, button.bg-primary",
    ) as HTMLElement | null;
    const ctaFg = btn ? getComputedStyle(btn).color : null;
    const ctaBg = btn ? getComputedStyle(btn).backgroundColor : null;
    return { bg, fg, ctaFg, ctaBg };
  });
  m.contrast.body = {
    fg: contrast.fg,
    bg: contrast.bg,
    ratio: Math.round(contrastRatio(contrast.fg, contrast.bg) * 100) / 100,
    passes: contrastRatio(contrast.fg, contrast.bg) >= 4.5,
  };
  if (contrast.ctaFg && contrast.ctaBg && contrast.ctaBg !== "rgba(0, 0, 0, 0)") {
    m.contrast.cta = {
      fg: contrast.ctaFg,
      bg: contrast.ctaBg,
      ratio: Math.round(contrastRatio(contrast.ctaFg, contrast.ctaBg) * 100) / 100,
      passes: contrastRatio(contrast.ctaFg, contrast.ctaBg) >= 4.5,
    };
  }
  return m;
}