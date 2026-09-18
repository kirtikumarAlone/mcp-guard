/**
 * A single OpenRouter chat-completion client, shared by the detection pass
 * and the analysis step. One account, one key, no other provider required.
 */
import { config } from "./config";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatOptions {
  model: string;
  timeoutMs: number;
  temperature?: number;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export async function chatComplete(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  if (!config.llm.apiKey) throw new OpenRouterError("OPENROUTER_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter asks free-tier callers to identify the app; harmless if ignored.
        "HTTP-Referer": "https://github.com/mcp-guard",
        "X-Title": "MCP-Guard",
      },
      body: JSON.stringify({
        model: options.model,
        temperature: options.temperature ?? 0,
        messages,
      }),
    });

    if (!res.ok) {
      throw new OpenRouterError(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    }

    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if (err instanceof OpenRouterError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenRouterError(`timed out after ${options.timeoutMs}ms`);
    }
    throw new OpenRouterError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
