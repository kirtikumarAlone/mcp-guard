import { MongoClient, type Collection } from "mongodb";
import { config } from "../config";
import type { AuditEvent } from "../types";
import { summarise, type AuditStore, type ListFilter } from "./types";

export class MongoAuditStore implements AuditStore {
  readonly kind = "mongodb" as const;

  private constructor(
    private readonly client: MongoClient,
    private readonly collection: Collection<AuditEvent>,
  ) {}

  static async connect(): Promise<MongoAuditStore> {
    const client = new MongoClient(config.mongo.uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();

    const collection = client.db(config.mongo.db).collection<AuditEvent>(config.mongo.collection);
    await collection.createIndex({ timestamp: -1 });

    return new MongoAuditStore(client, collection);
  }

  async append(event: AuditEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }

  async list(options: ListFilter): Promise<AuditEvent[]> {
    const query: Record<string, unknown> = {};
    if (options.direction) query.direction = options.direction;
    if (options.origin) query.origin = options.origin;
    if (options.type) query[`counts.${options.type}`] = { $exists: true };

    return this.collection
      .find(query, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .limit(options.limit)
      .toArray();
  }

  async summarise() {
    const recent = await this.list({ limit: 1000 });
    return summarise(recent);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
