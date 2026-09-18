import { Router } from "express";
import { fetchHttpSource } from "../dataSources/http";
import { fetchMongoSource } from "../dataSources/mongo";
import { fetchPostgresSource } from "../dataSources/postgres";
import { asyncRoute, HttpError } from "../middleware/errors";
import type { GuardService } from "../service";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${field} must be a number`);
  }
  return value;
}

/**
 * Live connectors for the dashboard's "Data sources" panel. Every field is
 * supplied per-request — nothing here is read from environment variables,
 * and connection details are never written to the audit log, only a
 * sanitised label (host, or database.collection) is.
 */
export function sourceRoutes(service: GuardService): Router {
  const router = Router();

  router.post(
    "/sources/http",
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const url = requireString(body.url, "url");

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new HttpError(400, "url is not valid");
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new HttpError(400, "url must use http or https");
      }

      const method = body.method === "POST" ? "POST" : "GET";
      const headers =
        typeof body.headers === "object" && body.headers !== null
          ? (body.headers as Record<string, string>)
          : undefined;
      const requestBody = typeof body.body === "string" ? body.body : undefined;

      const raw = await fetchHttpSource({ url, method, headers, body: requestBody });
      res.json(await service.scanText(raw, `source:http:${parsed.host}`, "source"));
    }),
  );

  router.post(
    "/sources/postgres",
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const connectionString = requireString(body.connectionString, "connectionString");
      const query = requireString(body.query, "query");
      const limit = optionalNumber(body.limit, "limit");

      const raw = await fetchPostgresSource({ connectionString, query, limit });
      res.json(await service.scanText(raw, "source:postgres", "source"));
    }),
  );

  router.post(
    "/sources/mongo",
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const uri = requireString(body.uri, "uri");
      const database = requireString(body.database, "database");
      const collection = requireString(body.collection, "collection");
      const filter = typeof body.filter === "string" ? body.filter : undefined;
      const limit = optionalNumber(body.limit, "limit");

      const raw = await fetchMongoSource({ uri, database, collection, filter, limit });
      res.json(await service.scanText(raw, `source:mongo:${database}.${collection}`, "source"));
    }),
  );

  return router;
}
