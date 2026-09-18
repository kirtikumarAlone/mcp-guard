import { Router } from "express";
import { config } from "../config";
import { listTools } from "../mcp/client";
import { asyncRoute, HttpError } from "../middleware/errors";
import type { GuardService } from "../service";

export function mcpRoutes(service: GuardService): Router {
  const router = Router();

  router.get(
    "/mcp/tools",
    asyncRoute(async (_req, res) => {
      res.json({ upstream: config.mcp.url, tools: await listTools() });
    }),
  );

  router.post(
    "/mcp/call",
    asyncRoute(async (req, res) => {
      const { name, arguments: args = {} } = (req.body ?? {}) as {
        name?: unknown;
        arguments?: unknown;
      };

      if (typeof name !== "string" || name.length === 0) {
        throw new HttpError(400, "body must include a tool name");
      }
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        throw new HttpError(400, "arguments must be an object");
      }

      res.json(
        await service.call({
          tool: name,
          args: args as Record<string, unknown>,
          route: req.originalUrl,
          origin: "api",
        }),
      );
    }),
  );

  // Browser-friendly equivalent of POST /mcp/call, for demos and smoke tests.
  router.get(
    "/mcp/demo/:tool",
    asyncRoute(async (req, res) => {
      const args: Record<string, unknown> = {};
      if (req.query.count) args.count = Number(req.query.count);
      if (req.query.format) args.format = String(req.query.format);
      if (req.query.scenario) args.scenario = String(req.query.scenario);

      res.json(
        await service.call({ tool: req.params.tool!, args, route: req.originalUrl, origin: "api" }),
      );
    }),
  );

  return router;
}
