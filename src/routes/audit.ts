import { Router } from "express";
import { asyncRoute } from "../middleware/errors";
import type { AuditStore } from "../storage";

const MAX_LIMIT = 200;

export function auditRoutes(store: AuditStore): Router {
  const router = Router();

  router.get(
    "/audit/events",
    asyncRoute(async (req, res) => {
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, MAX_LIMIT);
      const direction = req.query.direction ? String(req.query.direction) : undefined;
      const type = req.query.type ? String(req.query.type) : undefined;
      const origin = req.query.origin ? String(req.query.origin) : undefined;

      res.json({ events: await store.list({ limit, direction, type, origin }) });
    }),
  );

  router.get(
    "/audit/summary",
    asyncRoute(async (_req, res) => {
      res.json(await store.summarise());
    }),
  );

  return router;
}
