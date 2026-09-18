import { Router } from "express";
import { asyncRoute, HttpError } from "../middleware/errors";
import type { Scheduler } from "../scheduler";

export function schedulerRoutes(scheduler: Scheduler): Router {
  const router = Router();

  router.get(
    "/scheduler/status",
    asyncRoute(async (_req, res) => {
      res.json(scheduler.status());
    }),
  );

  router.post(
    "/scheduler/start",
    asyncRoute(async (req, res) => {
      const { intervalMs } = (req.body ?? {}) as { intervalMs?: unknown };
      if (intervalMs !== undefined && (typeof intervalMs !== "number" || intervalMs <= 0)) {
        throw new HttpError(400, "intervalMs must be a positive number");
      }
      res.json(scheduler.start(intervalMs as number | undefined));
    }),
  );

  router.post(
    "/scheduler/stop",
    asyncRoute(async (_req, res) => {
      res.json(scheduler.stop());
    }),
  );

  return router;
}
