/**
 * MongoDB connector. Runs one find() against a database the user supplies a
 * connection URI for. This is a separate, short-lived connection from the
 * audit store's own MongoDB client — the two are unrelated even if they
 * happen to point at the same cluster.
 */
import { MongoClient } from "mongodb";
import { config } from "../config";
import { HttpError } from "../middleware/errors";
import { clampLimit } from "./postgres";

export interface MongoSourceInput {
  uri: string;
  database: string;
  collection: string;
  filter?: string;
  limit?: number;
}

function parseFilter(raw: string | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("filter must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new HttpError(400, `filter is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function fetchMongoSource(input: MongoSourceInput): Promise<string> {
  const filter = parseFilter(input.filter);
  const limit = clampLimit(input.limit);

  const client = new MongoClient(input.uri, { serverSelectionTimeoutMS: config.sources.timeoutMs });

  try {
    await client.connect();
    const docs = await client
      .db(input.database)
      .collection(input.collection)
      .find(filter)
      .limit(limit)
      .toArray();
    return JSON.stringify(docs, null, 2).slice(0, config.sources.maxChars);
  } catch (err) {
    throw new HttpError(502, `mongodb query failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await client.close().catch(() => {});
  }
}
