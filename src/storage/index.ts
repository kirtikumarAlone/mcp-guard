import { config } from "../config";
import { log } from "../logger";
import { MemoryAuditStore } from "./memory";
import { MongoAuditStore } from "./mongo";
import type { AuditStore } from "./types";

export type { AuditStore } from "./types";

/** Falls back to in-memory storage so the service starts without MongoDB. */
export async function createAuditStore(): Promise<AuditStore> {
  if (!config.mongo.uri) return new MemoryAuditStore();

  try {
    const store = await MongoAuditStore.connect();
    log.info("audit store connected", { kind: store.kind, db: config.mongo.db });
    return store;
  } catch (err) {
    log.warn("mongodb unavailable, using in-memory audit store", { error: String(err) });
    return new MemoryAuditStore();
  }
}
