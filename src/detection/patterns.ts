import type { PiiType } from "../types";

export interface Rule {
  type: PiiType;
  pattern: RegExp;
  /** Rejects structurally invalid matches (checksums, numeric ranges). */
  validate?: (value: string) => boolean;
}

export function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double && (d *= 2) > 9) d -= 9;
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Ordered by precedence. When two rules match overlapping text the rule
 * listed first wins, so EMAIL is not carved up by IP_ADDRESS or PHONE.
 */
export const RULES: Rule[] = [
  {
    type: "EMAIL",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    type: "API_KEY",
    // Body allows internal "-"/"_" segments (sk-live-..., sk-proj-..., pk-test-...
    // are the real shape most providers use) while still requiring 16+
    // alnum/separator chars total, so plain words like "token of my
    // appreciation" or "keyboard" still don't match.
    pattern: /\b(?:sk|pk|key|token|secret|api[-_]?key)[-_][A-Za-z0-9](?:[A-Za-z0-9_-]{14,}[A-Za-z0-9])\b/gi,
  },
  {
    type: "SSN",
    // Shape-only: redaction cares whether text *looks like* an SSN, not
    // whether it's an SSA-issuable number. A validity filter here just
    // creates false negatives on the reserved/test ranges (000, 666, 900-999,
    // "00" group, "0000" serial) that demo and QA data love to use.
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: "IBAN",
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  },
  {
    type: "CREDIT_CARD",
    // Shape-only, same reasoning as SSN above: most test/demo card numbers
    // (4000..., 4111..., etc.) are not Luhn-valid, so gating on luhn()
    // silently let real-looking card numbers straight through. luhn() is
    // still exported for callers that want to flag "structurally valid"
    // vs. "test-shaped" cards, but it no longer decides whether to redact.
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
  },
  {
    type: "CVV",
    // 3-4 bare digits are too ambiguous to redact on their own (years,
    // counts, etc. would all match), so this only fires right after a
    // CVV/CVC/CID/CSC label. The optional quote/"="/":" segments cover both
    // "CVV: 123" free text and the '"cvv": "123"' shape JSON sources (the
    // Postgres/Mongo connectors) actually produce.
    pattern: /(?<=\b(?:CVV2?|CVC2?|CID|CSC)"?\s{0,3}[:=]?\s{0,3}"?)\d{3,4}\b/gi,
  },
  {
    type: "PHONE",
    pattern: /(?:\+1[-.\s]?)?(?:\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g,
  },
  {
    type: "IP_ADDRESS",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (v) => v.split(".").every((o) => o.length <= 3 && Number(o) <= 255),
  },
];

export const RULE_PRECEDENCE = new Map<PiiType, number>(RULES.map((r, i) => [r.type, i]));
