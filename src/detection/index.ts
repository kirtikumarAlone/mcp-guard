import { scanWithRegex } from "./regex";
import { scanWithLlm } from "./llm";
import { mask } from "./mask";
import type { ScanResult } from "../types";

export { scanWithRegex } from "./regex";
export { mask, resolveOverlaps, preview } from "./mask";
export { RULES, luhn } from "./patterns";

export async function scan(text: string): Promise<ScanResult> {
  const startedAt = Date.now();

  const regexSpans = scanWithRegex(text);
  const llm = await scanWithLlm(text);
  const masked = mask(text, [...regexSpans, ...llm.spans]);

  return {
    ...masked,
    llmPass: {
      ran: llm.skippedReason === null,
      skippedReason: llm.skippedReason,
      truncated: llm.truncated,
    },
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Scans a JSON value and returns it with the same shape. If the redacted
 * text no longer parses, the string form is returned rather than the
 * original object — the pipeline fails closed.
 */
export async function scanJson(value: unknown): Promise<{ clean: unknown; result: ScanResult }> {
  const result = await scan(JSON.stringify(value ?? null));
  try {
    return { clean: JSON.parse(result.redactedText), result };
  } catch {
    return { clean: { redacted: result.redactedText }, result };
  }
}
