import { describe, expect, it } from "vitest";
import { formatNumber, parseSignedDecimalInput } from "./utils";

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
