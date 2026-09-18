import "dotenv/config";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number, got "${raw}"`);
  return parsed;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: int("PORT", 5000),

  mcp: {
    url: process.env.MCP_SERVER_URL ?? "https://mcp.dlptest.com/api/mcp/",
    protocolVersion: "2025-06-18",
    timeoutMs: int("MCP_TIMEOUT_MS", 20_000),
  },

  llm: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL ?? "openrouter/free",
    maxChars: int("LLM_MAX_CHARS", 6000),
    timeoutMs: int("LLM_TIMEOUT_MS", 30_000),
  },

  mongo: {
    uri: process.env.MONGODB_URI ?? "",
    db: process.env.MONGODB_DB ?? "mcpguard",
    collection: "audit_events",
  },

  // Step 5 of the pipeline (send redacted text to an AI for analysis) reuses
  // the same OpenRouter key as the detection pass, so no separate provider
  // account is required. Point ANALYSIS_MODEL at a different OpenRouter
  // model if you want analysis and detection to use different models.
  analysis: {
    model: process.env.ANALYSIS_MODEL ?? process.env.OPENROUTER_MODEL ?? "openrouter/free",
    timeoutMs: int("ANALYSIS_TIMEOUT_MS", 30_000),
  },

  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  // Live connectors, configured per-request from the dashboard rather than
  // .env — credentials are never persisted, only used for the one call.
  sources: {
    timeoutMs: int("SOURCE_TIMEOUT_MS", 15_000),
    maxChars: int("SOURCE_MAX_CHARS", 20_000),
    defaultLimit: int("SOURCE_DEFAULT_LIMIT", 20),
    maxLimit: int("SOURCE_MAX_LIMIT", 200),
  },
} as const;

export type Config = typeof config;
