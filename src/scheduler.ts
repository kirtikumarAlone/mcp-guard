/**
 * Background MCP traffic generator. Off at boot, always — a person starts it
 * from the dashboard and can stop it at any time. When running, it calls one
 * upstream demo tool per tick so the audit log keeps filling without anyone
 * touching curl.
 *
 * The default cadence (45s) is deliberately conservative: when the LLM pass
 * is on, each tick can also mean an OpenRouter call, and OpenRouter's free
 * tier caps out around 20 requests/minute. One call every 45s stays far
 * under that even with retries or a slow model.
 */
import { log } from "./logger";
import type { GuardService } from "./service";

const MIN_INTERVAL_MS = 5_000;
const DEFAULT_INTERVAL_MS = 45_000;

/** Rotates through a handful of the upstream server's demo tools. */
const DEFAULT_TOOLS: { name: string; args: Record<string, unknown> }[] = [
  { name: "generate_pii_ssn_ccn", args: { count: 3 } },
  { name: "generate_hipaa_phi", args: { count: 2 } },
  { name: "generate_banking", args: { count: 2 } },
  {
    name: "echo_sensitive_data",
    args: { payload: "Contact John Doe at john.doe@example.com or 555-0142, SSN 123-45-6789." },
  },
];

export interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  tools: string[];
  ticks: number;
  lastRunAt: string | null;
  lastTool: string | null;
  lastError: string | null;
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = DEFAULT_INTERVAL_MS;
  private cursor = 0;
  private ticks = 0;
  private lastRunAt: string | null = null;
  private lastTool: string | null = null;
  private lastError: string | null = null;
  private inFlight = false;

  constructor(private readonly service: GuardService) {}

  status(): SchedulerStatus {
    return {
      running: this.timer !== null,
      intervalMs: this.intervalMs,
      tools: DEFAULT_TOOLS.map((t) => t.name),
      ticks: this.ticks,
      lastRunAt: this.lastRunAt,
      lastTool: this.lastTool,
      lastError: this.lastError,
    };
  }

  start(intervalMs?: number): SchedulerStatus {
    if (intervalMs !== undefined) {
      this.intervalMs = Math.max(MIN_INTERVAL_MS, intervalMs);
    }
    if (this.timer === null) {
      this.timer = setInterval(() => void this.tick(), this.intervalMs);
      log.info("scheduler started", { intervalMs: this.intervalMs });
      void this.tick(); // don't make the first data point wait a full interval
    }
    return this.status();
  }

  stop(): SchedulerStatus {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      log.info("scheduler stopped", { ticks: this.ticks });
    }
    return this.status();
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return; // a slow call shouldn't stack up another on top of it
    this.inFlight = true;

    const entry = DEFAULT_TOOLS[this.cursor % DEFAULT_TOOLS.length]!;
    this.cursor += 1;

    try {
      await this.service.call({
        tool: entry.name,
        args: entry.args,
        route: "scheduler",
        origin: "scheduler",
      });
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      log.warn("scheduler tick failed", { tool: entry.name, error: this.lastError });
    } finally {
      this.ticks += 1;
      this.lastRunAt = new Date().toISOString();
      this.lastTool = entry.name;
      this.inFlight = false;
    }
  }
}
