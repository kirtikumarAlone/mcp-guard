import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors";
import { sourceRoutes } from "../src/routes/sources";
import { GuardService } from "../src/service";
import { MemoryAuditStore } from "../src/storage/memory";

describe("http data source route", () => {
  let store: MemoryAuditStore;
  let app: express.Express;
  const originalFetch = global.fetch;

  beforeEach(() => {
    store = new MemoryAuditStore();
    app = express();
    app.use(express.json());
    app.use(sourceRoutes(new GuardService(store)));
    app.use(errorHandler);
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await store.close();
  });

  it("fetches, scans and logs a response as origin=source", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "Customer SSN 123-45-6789",
    }) as unknown as typeof fetch;

    const res = await request(app).post("/sources/http").send({ url: "https://example.com/api" });

    expect(res.status).toBe(200);
    expect(res.body.redactedText).toContain("[REDACTED_SSN_1]");

    const events = await store.list({ limit: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]?.origin).toBe("source");
    expect(events[0]?.route).toBe("source:http:example.com");
  });

  it("rejects a non-http(s) url", async () => {
    const res = await request(app).post("/sources/http").send({ url: "file:///etc/passwd" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing url", async () => {
    const res = await request(app).post("/sources/http").send({});
    expect(res.status).toBe(400);
  });

  it("surfaces an upstream error as a 502", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    }) as unknown as typeof fetch;

    const res = await request(app).post("/sources/http").send({ url: "https://example.com/down" });
    expect(res.status).toBe(502);
  });
});
