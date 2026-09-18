import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scheduler } from "../src/scheduler";
import type { GuardService } from "../src/service";

describe("scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not running until start is called", () => {
    const service = { call: vi.fn() } as unknown as GuardService;
    const scheduler = new Scheduler(service);

    expect(scheduler.status().running).toBe(false);
    expect(service.call).not.toHaveBeenCalled();
  });

  it("calls the guard immediately on start, tagged with origin scheduler", async () => {
    const call = vi.fn().mockResolvedValue({});
    const scheduler = new Scheduler({ call } as unknown as GuardService);

    scheduler.start(10_000);
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));

    expect(call.mock.calls[0]?.[0]).toMatchObject({ origin: "scheduler", route: "scheduler" });
    expect(scheduler.status().running).toBe(true);
  });

  it("stops issuing calls once stopped", async () => {
    const call = vi.fn().mockResolvedValue({});
    const scheduler = new Scheduler({ call } as unknown as GuardService);

    scheduler.start(1_000);
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));

    scheduler.stop();
    expect(scheduler.status().running).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("enforces a minimum interval so a bad request can't hammer the upstream", () => {
    const scheduler = new Scheduler({ call: vi.fn() } as unknown as GuardService);
    scheduler.start(100);
    expect(scheduler.status().intervalMs).toBeGreaterThanOrEqual(5_000);
  });

  it("records the last error without crashing the loop", async () => {
    const call = vi.fn().mockRejectedValue(new Error("upstream down"));
    const scheduler = new Scheduler({ call } as unknown as GuardService);

    scheduler.start(10_000);
    await vi.waitFor(() => expect(scheduler.status().lastError).toBe("upstream down"));
    expect(scheduler.status().running).toBe(true);
  });
});
