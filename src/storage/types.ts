import type { AuditEvent, AuditSummary, Origin } from "../types";

export interface ListFilter {
  limit: number;
  direction?: string;
  type?: string;
  origin?: string;
}

export interface AuditStore {
  readonly kind: "mongodb" | "memory";
  append(event: AuditEvent): Promise<void>;
  list(options: ListFilter): Promise<AuditEvent[]>;
  summarise(): Promise<AuditSummary>;
  close(): Promise<void>;
}

const ORIGINS: Origin[] = ["scheduler", "manual", "api", "source"];

export function summarise(events: AuditEvent[]): AuditSummary {
  const byType: Record<string, number> = {};
  const byDirection = { inbound: 0, outbound: 0 };
  const byOrigin = { scheduler: 0, manual: 0, api: 0, source: 0 };
  let totalRedactions = 0;

  for (const event of events) {
    byDirection[event.direction] += 1;
    byOrigin[event.origin] += 1;
    for (const [type, count] of Object.entries(event.counts)) {
      byType[type] = (byType[type] ?? 0) + (count ?? 0);
      totalRedactions += count ?? 0;
    }
  }

  return { totalEvents: events.length, totalRedactions, byType, byDirection, byOrigin };
}

export function matches(event: AuditEvent, filter: Omit<ListFilter, "limit">): boolean {
  if (filter.direction && event.direction !== filter.direction) return false;
  if (filter.type && !(filter.type in event.counts)) return false;
  if (filter.origin && event.origin !== filter.origin) return false;
  return true;
}

export { ORIGINS };
