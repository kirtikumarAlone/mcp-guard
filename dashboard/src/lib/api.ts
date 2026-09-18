export type Direction = "inbound" | "outbound";
export type Origin = "scheduler" | "manual" | "api" | "source";

export interface Finding {
  type: string;
  source: "regex" | "llm";
  placeholder: string;
  preview: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  route: string;
  tool?: string;
  origin: Origin;
  direction: Direction;
  findings: Finding[];
  counts: Record<string, number>;
  llmPassRan: boolean;
  durationMs: number;
  redactedText: string;
}

export interface Summary {
  totalEvents: number;
  totalRedactions: number;
  byType: Record<string, number>;
  byDirection: Record<Direction, number>;
  byOrigin: Record<Origin, number>;
}

export interface Health {
  status: string;
  version: string;
  uptimeSeconds: number;
  upstream: string;
  auditStore: "mongodb" | "memory";
  llmPass: { enabled: boolean; model?: string };
  analysis: { enabled: boolean; model?: string };
}

export interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  tools: string[];
  ticks: number;
  lastRunAt: string | null;
  lastTool: string | null;
  lastError: string | null;
}

export const GUARD_URL = (import.meta.env.VITE_GUARD_URL as string | undefined) ?? "http://localhost:5000";

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${GUARD_URL}${path}`, { signal });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GUARD_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `${path} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Snapshot {
  events: AuditEvent[];
  summary: Summary;
  health: Health;
  scheduler: SchedulerStatus;
}

export interface Filters {
  direction?: Direction | "all";
  type?: string | "all";
  origin?: Origin | "all";
}

export async function fetchSnapshot(filters: Filters, signal?: AbortSignal): Promise<Snapshot> {
  const params = new URLSearchParams({ limit: "100" });
  if (filters.direction && filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.origin && filters.origin !== "all") params.set("origin", filters.origin);

  const [events, summary, health, scheduler] = await Promise.all([
    get<{ events: AuditEvent[] }>(`/audit/events?${params}`, signal),
    get<Summary>("/audit/summary", signal),
    get<Health>("/health", signal),
    get<SchedulerStatus>("/scheduler/status", signal),
  ]);

  return { events: events.events, summary, health, scheduler };
}

export function startScheduler(intervalMs?: number): Promise<SchedulerStatus> {
  return post<SchedulerStatus>("/scheduler/start", intervalMs ? { intervalMs } : undefined);
}

export function stopScheduler(): Promise<SchedulerStatus> {
  return post<SchedulerStatus>("/scheduler/stop");
}

export interface ScanResponse {
  redactedText: string;
  findings: Finding[];
  counts: Record<string, number>;
  llmPass: { ran: boolean; skippedReason: string | null; truncated: boolean };
  durationMs: number;
}

/** The manual test panel's submit action — text pasted or read from an uploaded file. */
export function submitScan(text: string): Promise<ScanResponse> {
  return post<ScanResponse>("/scan", { text });
}

export interface HttpSourceInput {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

export function fetchHttpSource(input: HttpSourceInput): Promise<ScanResponse> {
  return post<ScanResponse>("/sources/http", input);
}

export interface PostgresSourceInput {
  connectionString: string;
  query: string;
  limit?: number;
}

export function fetchPostgresSource(input: PostgresSourceInput): Promise<ScanResponse> {
  return post<ScanResponse>("/sources/postgres", input);
}

export interface MongoSourceInput {
  uri: string;
  database: string;
  collection: string;
  filter?: string;
  limit?: number;
}

export function fetchMongoSource(input: MongoSourceInput): Promise<ScanResponse> {
  return post<ScanResponse>("/sources/mongo", input);
}
