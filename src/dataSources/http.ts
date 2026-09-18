/**
 * Generic external API connector. Pulls a response body from any URL the
 * user points it at and hands the raw text to the detection pipeline —
 * nothing here is specific to any one API.
 */
import { config } from "../config";
import { HttpError } from "../middleware/errors";

export interface HttpSourceInput {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

export async function fetchHttpSource(input: HttpSourceInput): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sources.timeoutMs);

  let res: Response;
  try {
    res = await fetch(input.url, {
      method: input.method ?? "GET",
      signal: controller.signal,
      headers: input.headers,
      body: input.method === "POST" ? input.body : undefined,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new HttpError(
      502,
      timedOut
        ? `request to ${input.url} timed out after ${config.sources.timeoutMs}ms`
        : `could not reach ${input.url} (${err instanceof Error ? err.message : String(err)})`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(502, `${input.url} responded with HTTP ${res.status}`);
  }
  return text.slice(0, config.sources.maxChars);
}
