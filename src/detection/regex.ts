import { RULES } from "./patterns";
import type { PiiSpan } from "../types";

export function scanWithRegex(text: string): PiiSpan[] {
  const spans: PiiSpan[] = [];

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.pattern.exec(text)) !== null) {
      const value = match[0];
      if (value.length === 0) {
        rule.pattern.lastIndex++;
        continue;
      }
      if (rule.validate && !rule.validate(value)) continue;

      spans.push({
        type: rule.type,
        value,
        start: match.index,
        end: match.index + value.length,
        source: "regex",
      });
    }
  }

  return spans;
}
