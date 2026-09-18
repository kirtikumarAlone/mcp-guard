import { RULE_PRECEDENCE } from "./patterns";
import type { Finding, PiiSpan, PiiType } from "../types";

/**
 * Keeps the longest non-overlapping set of spans, breaking ties by rule
 * precedence. Without this, a card number can be partly consumed by the
 * phone rule and the replacement corrupts the surrounding text.
 */
export function resolveOverlaps(spans: PiiSpan[]): PiiSpan[] {
  const ranked = [...spans].sort((a, b) => {
    const byLength = b.end - b.start - (a.end - a.start);
    if (byLength !== 0) return byLength;

    const pa = RULE_PRECEDENCE.get(a.type) ?? Number.MAX_SAFE_INTEGER;
    const pb = RULE_PRECEDENCE.get(b.type) ?? Number.MAX_SAFE_INTEGER;
    return pa !== pb ? pa - pb : a.start - b.start;
  });

  const kept: PiiSpan[] = [];
  for (const span of ranked) {
    if (!kept.some((k) => span.start < k.end && k.start < span.end)) kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Irreversible hint for operators reading the audit log. */
export function preview(value: string): string {
  const tail = value.slice(-4).replace(/[^A-Za-z0-9]/g, "");
  const hidden = Math.max(value.length - tail.length, 0);
  return `${"*".repeat(Math.min(hidden, 12))}${tail}`;
}

export interface MaskResult {
  redactedText: string;
  findings: Finding[];
  counts: Partial<Record<PiiType, number>>;
}

/**
 * Replaces every span with a stable placeholder. Equal values share a
 * placeholder within one call, so a downstream model can still correlate
 * rows without seeing the underlying value.
 */
export function mask(text: string, spans: PiiSpan[]): MaskResult {
  const resolved = resolveOverlaps(spans);
  const placeholders = new Map<string, string>();
  const sequence = new Map<PiiType, number>();
  const findings: Finding[] = [];
  const counts: Partial<Record<PiiType, number>> = {};

  let out = "";
  let cursor = 0;

  for (const span of resolved) {
    const key = `${span.type}::${span.value}`;
    let placeholder = placeholders.get(key);

    if (!placeholder) {
      const n = (sequence.get(span.type) ?? 0) + 1;
      sequence.set(span.type, n);
      placeholder = `[REDACTED_${span.type}_${n}]`;
      placeholders.set(key, placeholder);
    }

    out += text.slice(cursor, span.start) + placeholder;
    cursor = span.end;

    findings.push({
      type: span.type,
      source: span.source,
      placeholder,
      preview: preview(span.value),
    });
    counts[span.type] = (counts[span.type] ?? 0) + 1;
  }

  return { redactedText: out + text.slice(cursor), findings, counts };
}
