import { describe, expect, it } from "vitest";
import { luhn, mask, preview, resolveOverlaps, scanWithRegex } from "../src/detection";

function countsFor(text: string) {
  return mask(text, scanWithRegex(text)).counts;
}

describe("regex pass", () => {
  it("detects each supported type in a mixed record", () => {
    const text = [
      "Email: rohan.sharma@example.com",
      "Phone: (912) 555-0173",
      "SSN: 123-45-6789",
      "Card: 4111 1111 1111 1111",
      "Host: 192.168.1.42",
      "Key: sk-abcdef1234567890abcdef",
      "IBAN: DE89370400440532013000",
    ].join("\n");

    expect(countsFor(text)).toEqual({
      EMAIL: 1,
      PHONE: 1,
      SSN: 1,
      CREDIT_CARD: 1,
      IP_ADDRESS: 1,
      API_KEY: 1,
      IBAN: 1,
    });
  });

  it("rejects a 16-digit number that fails the Luhn check", () => {
    expect(countsFor("Order reference 1234567890123456 shipped.")).toEqual({});
  });

  it("rejects an IPv4 address with an out-of-range octet", () => {
    expect(countsFor("Build 999.1.1.1 was promoted.")).toEqual({});
  });

  it("rejects SSNs in reserved ranges", () => {
    expect(countsFor("SSN 666-45-6789")).toEqual({});
    expect(countsFor("SSN 123-00-6789")).toEqual({});
  });

  it("does not let the IP rule split an email address", () => {
    const text = "Reach 10.0.0.1user@example.com for access.";
    expect(countsFor(text)).toEqual({ EMAIL: 1 });
  });
});

describe("masking", () => {
  it("assigns one placeholder per distinct value", () => {
    const text = "SSN 123-45-6789 also appears as 123-45-6789 and 456-78-1234.";
    const result = mask(text, scanWithRegex(text));

    expect(result.counts.SSN).toBe(3);
    expect(result.redactedText).toContain("[REDACTED_SSN_1]");
    expect(result.redactedText).toContain("[REDACTED_SSN_2]");
    expect(result.redactedText).not.toContain("[REDACTED_SSN_3]");
  });

  it("never leaks the original value into a finding", () => {
    const text = "SSN 123-45-6789";
    const result = mask(text, scanWithRegex(text));

    expect(JSON.stringify(result.findings)).not.toContain("123-45-6789");
    expect(result.findings[0]?.preview).toBe("*******6789");
  });

  it("leaves surrounding text byte-for-byte intact", () => {
    const text = 'prefix {"ssn":"123-45-6789"} suffix';
    const result = mask(text, scanWithRegex(text));

    expect(result.redactedText).toBe('prefix {"ssn":"[REDACTED_SSN_1]"} suffix');
  });

  it("keeps the longest span when two rules overlap", () => {
    const spans = [
      { type: "CREDIT_CARD" as const, value: "4111111111111111", start: 0, end: 16, source: "regex" as const },
      { type: "PHONE" as const, value: "111-1111", start: 8, end: 16, source: "regex" as const },
    ];

    expect(resolveOverlaps(spans)).toHaveLength(1);
    expect(resolveOverlaps(spans)[0]?.type).toBe("CREDIT_CARD");
  });
});

describe("helpers", () => {
  it("validates card numbers with the Luhn algorithm", () => {
    expect(luhn("4111111111111111")).toBe(true);
    expect(luhn("4111111111111112")).toBe(false);
    expect(luhn("411111")).toBe(false);
  });

  it("caps the preview mask length", () => {
    expect(preview("a".repeat(80))).toBe(`${"*".repeat(12)}aaaa`);
  });
});
