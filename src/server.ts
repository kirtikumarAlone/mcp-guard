import cors from "cors";
import express, { type Express } from "express";
import { config } from "./config";
import { errorHandler, notFound } from "./middleware/errors";
import { analyzeRoutes } from "./routes/analyze";
import { auditRoutes } from "./routes/audit";
import { healthRoutes } from "./routes/health";
import { mcpRoutes } from "./routes/mcp";
import { scanRoutes } from "./routes/scan";
import { schedulerRoutes } from "./routes/scheduler";
import { sourceRoutes } from "./routes/sources";
import { Scheduler } from "./scheduler";
import { GuardService } from "./service";
import type { AuditStore } from "./storage";

export function createServer(store: AuditStore): { app: Express; scheduler: Scheduler } {
  const app = express();
  const service = new GuardService(store);
  const scheduler = new Scheduler(service);

  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "2mb" }));

  app.use(healthRoutes(store, Date.now()));
  app.use(mcpRoutes(service));
  app.use(scanRoutes(service));
  app.use(auditRoutes(store));
  app.use(analyzeRoutes(store));
  app.use(schedulerRoutes(scheduler));
  app.use(sourceRoutes(service));

  app.use(notFound);
  app.use(errorHandler);

  return { app, scheduler };
}
