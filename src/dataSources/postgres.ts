/**
 * PostgreSQL connector. Runs one read-only query against a database the
 * user supplies a connection string for, and hands the rows to the
 * detection pipeline as JSON.
 *
 * The connection string and query text are used for this single request
 * only — never logged, never written to the audit trail, never persisted.
 */
import { Client } from "pg";
import { config } from "../config";
import { HttpError } from "../middleware/errors";

export interface PostgresSourceInput {
  connectionString: string;
  query: string;
  limit?: number;
}

const WRITE_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|vacuum|merge)\b/i;

/**
 * Best-effort guard against accidental writes during a live demo — not a
 * substitute for a database user that only has SELECT privileges, which is
 * the actual protection and what the dashboard tells people to use.
 */
export function assertReadOnlySelect(query: string): string {
  const trimmed = query.trim().replace(/;+\s*$/, "");
  if (trimmed.length === 0) throw new HttpError(400, "query is empty");
  if (!/^select\b/i.test(trimmed)) throw new HttpError(400, "only SELECT queries are allowed");
  if (trimmed.includes(";")) throw new HttpError(400, "only a single statement is allowed");
  if (WRITE_KEYWORDS.test(trimmed)) throw new HttpError(400, "query contains a disallowed keyword");
  return trimmed;
}

export function withLimit(query: string, limit: number): string {
  return /\blimit\b/i.test(query) ? query : `${query} LIMIT ${limit}`;
}

export function clampLimit(requested: number | undefined): number {
  const value = requested ?? config.sources.defaultLimit;
  return Math.max(1, Math.min(value, config.sources.maxLimit));
}

export async function fetchPostgresSource(input: PostgresSourceInput): Promise<string> {
  const safeQuery = withLimit(assertReadOnlySelect(input.query), clampLimit(input.limit));

  const client = new Client({
    connectionString: input.connectionString,
    connectionTimeoutMillis: config.sources.timeoutMs,
    statement_timeout: config.sources.timeoutMs,
  });

  try {
    await client.connect();
    const result = await client.query(safeQuery);
    return JSON.stringify(result.rows, null, 2).slice(0, config.sources.maxChars);
  } catch (err) {
    throw new HttpError(502, `postgres query failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await client.end().catch(() => {});
  }
}
