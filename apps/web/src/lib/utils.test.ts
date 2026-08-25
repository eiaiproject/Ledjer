import { describe, expect, it } from "vitest";
import { formatDecimalIDR, formatDecimalInput, formatNumber, formatQuantity, parseSignedDecimalInput } from "./utils";

describe("parseSignedDecimalInput", () => {
  it("parses plain integers", () => {
    expect(parseSignedDecimalInput("5")).toBe(5);
    expect(parseSignedDecimalInput("0")).toBe(0);
    expect(parseSignedDecimalInput("007")).toBe(7);
  });

  it("accepts number values directly and rejects objects", () => {
    expect(parseSignedDecimalInput(-5)).toBe(-5);
    expect(parseSignedDecimalInput(0.5)).toBe(0.5);
    expect(parseSignedDecimalInput({})).toBeUndefined();
    expect(parseSignedDecimalInput(["1"], 0)).toBe(0);
  });

  it("accepts a leading minus typed first", () => {
    expect(parseSignedDecimalInput("-5")).toBe(-5);
    expect(parseSignedDecimalInput("-")).toBeUndefined();
    expect(parseSignedDecimalInput("-", 0)).toBe(0);
  });

  it("parses decimals with dot or comma separator", () => {
    expect(parseSignedDecimalInput("0.5")).toBe(0.5);
    expect(parseSignedDecimalInput("0,5")).toBe(0.5);
    expect(parseSignedDecimalInput("-1,75")).toBe(-1.75);
    expect(parseSignedDecimalInput("-.5")).toBe(-0.5);
  });

  it("parses Indonesian grouped values", () => {
    expect(parseSignedDecimalInput("1.234,5")).toBe(1234.5);
    expect(parseSignedDecimalInput("1.234.567")).toBe(1234567);
    expect(parseSignedDecimalInput("-1.234,5")).toBe(-1234.5);
  });

  it("caps precision to 3 decimals (milli units)", () => {
    expect(parseSignedDecimalInput("1.23456")).toBe(1.235);
    expect(parseSignedDecimalInput("-0.0004")).toBe(0);
  });

  it("returns emptyValue for blank or garbage", () => {
    expect(parseSignedDecimalInput("", 0)).toBe(0);
    expect(parseSignedDecimalInput("  ", undefined)).toBeUndefined();
    expect(parseSignedDecimalInput("abc", undefined)).toBeUndefined();
    // trailing minus is ignored, value still parses
    expect(parseSignedDecimalInput("5-", undefined)).toBe(5);
  });
});

describe("formatNumber (blur display contract for signed-decimal inputs)", () => {
  it("formats with id-ID separators and keeps the sign", () => {
    expect(formatNumber(1234.5, 3)).toBe("1.234,5");
    expect(formatNumber(-12, 3)).toBe("-12");
    expect(formatNumber(0, 3)).toBe("0");
    expect(formatNumber(0.5, 3)).toBe("0,5");
    expect(formatNumber(-0.5, 3)).toBe("-0,5");
  });
});

describe("formatQuantity (stock/quantity display)", () => {
  it("renders whole values as plain integers, never 3-decimal padding", () => {
    expect(formatQuantity(0)).toBe("0");
    expect(formatQuantity(250)).toBe("250");
    expect(formatQuantity(-3)).toBe("-3");
    expect(formatQuantity(15000)).toBe("15.000"); // id-ID thousands separator
    expect(formatQuantity("0.000")).toBe("0");
    expect(formatQuantity("250.000")).toBe("250");
  });

  it("keeps true fractions up to 3 decimals with id-ID comma", () => {
    expect(formatQuantity(0.5)).toBe("0,5");
    expect(formatQuantity(250.5)).toBe("250,5");
    expect(formatQuantity(1.992)).toBe("1,992");
    expect(formatQuantity(-0.5)).toBe("-0,5");
    expect(formatQuantity("250.5")).toBe("250,5");
  });

  it("handles missing or invalid values", () => {
    expect(formatQuantity(null)).toBe("0");
    expect(formatQuantity(undefined)).toBe("0");
    expect(formatQuantity("")).toBe("0");
    expect(formatQuantity("abc")).toBe("0");
  });
});

describe("formatDecimalInput (unit-price input display)", () => {
  it("formats whole values without decimals (dot = thousands)", () => {
    expect(formatDecimalInput(1992)).toBe("1.992");
    expect(formatDecimalInput(500000)).toBe("500.000");
    expect(formatDecimalInput(0)).toBe("0");
  });

  it("formats fractional values with id-ID comma decimals (up to 4dp)", () => {
    expect(formatDecimalInput(1992.03)).toBe("1.992,03");
    expect(formatDecimalInput(0.5)).toBe("0,5");
    expect(formatDecimalInput(1234.567)).toBe("1.234,567");
    expect(formatDecimalInput(1992.0319)).toBe("1.992,0319");
  });

  it("supports blankWhenZero for input display", () => {
    expect(formatDecimalInput(0, true)).toBe("");
    expect(formatDecimalInput(1992.03, true)).toBe("1.992,03");
    expect(formatDecimalInput(null, true)).toBe("");
    expect(formatDecimalInput(undefined, true)).toBe("");
  });
});

describe("formatDecimalIDR (unit-price display)", () => {
  // Intl currency output uses a non-breaking space (U+00A0) after "Rp" -
  // same convention as formatIDR. Normalize it here for readable assertions.
  const nbsp = "\u00A0";
  const render = (v: number | null | undefined) => formatDecimalIDR(v).replaceAll(nbsp, " ");

  it("renders whole amounts exactly like formatIDR", () => {
    expect(render(1992)).toBe("Rp 1.992");
    expect(render(500000)).toBe("Rp 500.000");
  });

  it("preserves up to 4 fractional digits with comma (matches 4dp average cost)", () => {
    expect(render(1992.03)).toBe("Rp 1.992,03");
    expect(render(1234.567)).toBe("Rp 1.234,567");
    expect(render(1992.0319)).toBe("Rp 1.992,0319");
  });

  it("returns em dash for missing values", () => {
    expect(formatDecimalIDR(null)).toBe("-");
    expect(formatDecimalIDR(undefined)).toBe("-");
  });
});
