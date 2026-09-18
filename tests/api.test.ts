import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditStore } from "../src/storage/memory";
import { GuardService } from "../src/service";
import { auditRoutes } from "../src/routes/audit";
import { scanRoutes } from "../src/routes/scan";
import { errorHandler } from "../src/middleware/errors";

function buildApp(store: MemoryAuditStore) {
  const app = express();
  app.use(express.json());
  app.use(scanRoutes(new GuardService(store)));
  app.use(auditRoutes(store));
  app.use(errorHandler);
  return app;
}

describe("http api", () => {
  let store: MemoryAuditStore;
  let app: express.Express;

  beforeEach(() => {
    store = new MemoryAuditStore();
    app = buildApp(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it("redacts text submitted to /scan", async () => {
    const res = await request(app)
      .post("/scan")
      .send({ text: "SSN 123-45-6789 and card 4111 1111 1111 1111" });

    expect(res.status).toBe(200);
    expect(res.body.redactedText).not.toContain("123-45-6789");
    expect(res.body.counts).toEqual({ SSN: 1, CREDIT_CARD: 1 });
  });

  it("rejects a request with no text", async () => {
    const res = await request(app).post("/scan").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("records the scan in the audit log without the raw value", async () => {
    await request(app).post("/scan").send({ text: "SSN 123-45-6789" });

    const res = await request(app).get("/audit/events");
    expect(res.body.events).toHaveLength(1);
    expect(JSON.stringify(res.body.events)).not.toContain("123-45-6789");
  });

  it("aggregates totals by type and direction", async () => {
    await request(app).post("/scan").send({ text: "SSN 123-45-6789" });
    await request(app).post("/scan").send({ text: "SSN 456-78-1234" });

    const res = await request(app).get("/audit/summary");
    expect(res.body.totalEvents).toBe(2);
    expect(res.body.byType.SSN).toBe(2);
    expect(res.body.byDirection.inbound).toBe(2);
  });

  it("filters events by type", async () => {
    await request(app).post("/scan").send({ text: "SSN 123-45-6789" });
    await request(app).post("/scan").send({ text: "a@b.com" });

    const res = await request(app).get("/audit/events?type=EMAIL");
    expect(res.body.events).toHaveLength(1);
  });

  it("tags manual scans with origin=manual", async () => {
    await request(app).post("/scan").send({ text: "SSN 123-45-6789" });

    const res = await request(app).get("/audit/events?origin=manual");
    expect(res.body.events).toHaveLength(1);

    const empty = await request(app).get("/audit/events?origin=scheduler");
    expect(empty.body.events).toHaveLength(0);
  });

  it("stores the redacted text on the audit event", async () => {
    await request(app).post("/scan").send({ text: "Email a@b.com" });

    const res = await request(app).get("/audit/events");
    expect(res.body.events[0].redactedText).toContain("[REDACTED_EMAIL_1]");
    expect(res.body.events[0].redactedText).not.toContain("a@b.com");
  });
});
