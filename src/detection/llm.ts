import { config } from "../config";
import { describeError } from "../logger";
import type { PiiSpan, PiiType } from "../types";

const LLM_TYPES: PiiType[] = [
  "PERSON_NAME",
  "ADDRESS",
  "DATE_OF_BIRTH",
  "MEDICAL_RECORD_NUMBER",
  "BANK_ACCOUNT",
];

const SYSTEM_PROMPT = [
  "You are a data loss prevention classifier.",
  "Identify sensitive personal information that has no fixed machine-readable shape:",
  "names, street addresses, dates of birth, medical record numbers, bank account numbers.",
  "",
  "Respond with a JSON array only. No prose, no code fences.",
  'Each element: {"type": "<TYPE>", "value": "<exact substring of the input>"}',
  `Allowed types: ${LLM_TYPES.join(", ")}`,
  "Skip anything already replaced by a [REDACTED_...] placeholder.",
  "Return [] when nothing is found.",
].join("\n");

export interface LlmPassResult {
  spans: PiiSpan[];
  skippedReason: string | null;
  truncated: boolean;
}

async function complete(text: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.llm.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/mcp-guard",
      "X-Title": "MCP-Guard",
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 180)}`);
  }

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "[]";
}

function parseArray(raw: string): { type?: unknown; value?: unknown }[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Second detection pass. The model returns values rather than offsets, so
 * each value is located in the source text; anything it invents will not be
 * found and is discarded. Failures degrade to an empty result — the regex
 * pass still governs the response.
 */
export async function scanWithLlm(text: string): Promise<LlmPassResult> {
  if (!config.llm.apiKey) {
    return { spans: [], skippedReason: "OPENROUTER_API_KEY not set", truncated: false };
  }

  const truncated = text.length > config.llm.maxChars;
  const window = truncated ? text.slice(0, config.llm.maxChars) : text;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);

  let raw: string;
  try {
    raw = await complete(window, controller.signal);
  } catch (err) {
    return { spans: [], skippedReason: describeError(err).slice(0, 200), truncated };
  } finally {
    clearTimeout(timer);
  }

  const spans: PiiSpan[] = [];

  for (const item of parseArray(raw)) {
    const type = String(item.type ?? "").toUpperCase() as PiiType;
    const value = String(item.value ?? "");
    if (!LLM_TYPES.includes(type) || value.length < 2) continue;

    let from = 0;
    for (;;) {
      const index = window.indexOf(value, from);
      if (index === -1) break;
      spans.push({ type, value, start: index, end: index + value.length, source: "llm" });
      from = index + value.length;
    }
  }

  return { spans, skippedReason: null, truncated };
}
