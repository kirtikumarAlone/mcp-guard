import { Router } from "express";
import { config } from "../config";
import type { AuditStore } from "../storage";

export function healthRoutes(store: AuditStore, startedAt: number): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "0.5.0",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      upstream: config.mcp.url,
      auditStore: store.kind,
      llmPass: config.llm.apiKey ? { enabled: true, model: config.llm.model } : { enabled: false },
      analysis: config.llm.apiKey ? { enabled: true, model: config.analysis.model } : { enabled: false },
    });
  });

  return router;
}
