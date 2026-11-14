import { describe, expect, it } from "vitest";
import { formatPhone, formatPhoneLocal, isValidPhone, normalizePhone } from "@fuego/shared";

describe("phone helpers (+216, 8 digits, xx xxx xxx)", () => {
  it("keeps only digits and caps at 8", () => {
    expect(normalizePhone("22 123 456")).toBe("22123456");
    expect(normalizePhone("ab22-123.456xyz")).toBe("22123456");
    expect(normalizePhone("221234567890")).toBe("22123456");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
  });

  it("drops a typed or pasted country prefix", () => {
    expect(normalizePhone("+216 22 123 456")).toBe("22123456");
    expect(normalizePhone("0021622123456")).toBe("22123456");
    expect(normalizePhone("21622123456")).toBe("22123456");
  });

  it("does not eat a national number that merely starts with 216", () => {
    expect(normalizePhone("21612345")).toBe("21612345");
  });

  it("validates exactly 8 digits", () => {
    expect(isValidPhone("22123456")).toBe(true);
    expect(isValidPhone("2212345")).toBe(false);
    expect(isValidPhone("22 123 456")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  it("groups as xx xxx xxx, also while typing", () => {
    expect(formatPhoneLocal("22123456")).toBe("22 123 456");
    expect(formatPhoneLocal("221")).toBe("22 1");
    expect(formatPhoneLocal("2")).toBe("2");
    expect(formatPhoneLocal("")).toBe("");
  });

  it("displays with the constant +216 prefix", () => {
    expect(formatPhone("22123456")).toBe("+216 22 123 456");
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });

  it("leaves older free-text values untouched", () => {
    expect(formatPhone("71 234")).toBe("71 234");
  });
});
