import { config } from "../config";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpContentBlock {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  content?: McpContentBlock[];
  isError?: boolean;
}

export class McpError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "McpError";
  }
}

let requestId = 0;

/**
 * Streamable HTTP transport, stateless mode: each call is a self-contained
 * POST. The server may answer with JSON or with a single SSE frame, so both
 * shapes are accepted.
 */
async function readBody(res: Response): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  const body = await res.text();

  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(body);
  }

  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    return JSON.parse(payload);
  }

  throw new McpError("no JSON-RPC payload in SSE response");
}

/**
 * Node's fetch (undici) collapses every network failure — DNS, TCP refusal,
 * TLS, a proxy block, an abort — into "fetch failed" and puts the actual
 * reason on `err.cause`. Surface that here so the error means something.
 */
function describeNetworkFailure(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") {
    return `timed out after ${config.mcp.timeoutMs}ms`;
  }
  const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
  if (cause?.code) return `${cause.code}${cause.message ? `: ${cause.message}` : ""}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function rpc<T>(method: string, params?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.mcp.timeoutMs);

  let res: Response;
  try {
    res = await fetch(config.mcp.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": config.mcp.protocolVersion,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    });
  } catch (err) {
    throw new McpError(`could not reach ${config.mcp.url} (${describeNetworkFailure(err)})`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new McpError(`${method} failed with HTTP ${res.status}`, res.status);
  }

  const body = await readBody(res);
  if (body.error) throw new McpError(body.error.message, body.error.code);
  return body.result as T;
}

export function initialize() {
  return rpc<{ serverInfo?: { name?: string; version?: string } }>("initialize", {
    protocolVersion: config.mcp.protocolVersion,
    capabilities: {},
    clientInfo: { name: "mcp-guard", version: "0.3.0" },
  });
}

export async function listTools(): Promise<McpTool[]> {
  const result = await rpc<{ tools?: McpTool[] }>("tools/list");
  return result.tools ?? [];
}

export function callTool(name: string, args: Record<string, unknown> = {}) {
  return rpc<McpToolResult>("tools/call", { name, arguments: args });
}

export function flattenContent(result: McpToolResult): string {
  if (!Array.isArray(result?.content)) return JSON.stringify(result ?? {});
  return result.content
    .map((block) => (typeof block.text === "string" ? block.text : JSON.stringify(block)))
    .join("\n");
}
