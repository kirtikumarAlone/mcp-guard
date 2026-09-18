import type { AuditEvent } from "../types";
import { matches, summarise, type AuditStore, type ListFilter } from "./types";

const CAPACITY = 1000;

export class MemoryAuditStore implements AuditStore {
  readonly kind = "memory" as const;
  private events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.unshift(event);
    if (this.events.length > CAPACITY) this.events.length = CAPACITY;
  }

  async list(options: ListFilter): Promise<AuditEvent[]> {
    return this.events.filter((e) => matches(e, options)).slice(0, options.limit);
  }

  async summarise() {
    return summarise(this.events);
  }

  async close(): Promise<void> {}
}
