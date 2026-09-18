import { randomUUID } from "node:crypto";
import { Router } from "express";
import { config } from "../config";
import { chatComplete } from "../openrouter";
import { callTool, flattenContent } from "../mcp/client";
import { scan } from "../detection";
import { asyncRoute, HttpError } from "../middleware/errors";
import type { AuditStore } from "../storage";

const SYSTEM_PROMPT = [
  "You are analysing a dataset that has passed through a redaction proxy.",
  "Values shown as [REDACTED_TYPE_n] are placeholders; the same placeholder always",
  "refers to the same original value. Reason using the placeholders and never",
  "speculate about what they concealed.",
].join(" ");

/**
 * Full pipeline demonstration: pull from the upstream MCP server, redact,
 * then send only the redacted text to a model — via OpenRouter, so no
 * separate Anthropic account is needed to try this end to end.
 */
export function analyzeRoutes(store: AuditStore): Router {
  const router = Router();

  router.post(
    "/analyze",
    asyncRoute(async (req, res) => {
      if (!config.llm.apiKey) throw new HttpError(400, "OPENROUTER_API_KEY is not set");

      const {
        name,
        arguments: args = {},
        question = "Summarise this dataset.",
      } = (req.body ?? {}) as { name?: unknown; arguments?: unknown; question?: unknown };

      if (typeof name !== "string" || name.length === 0) {
        throw new HttpError(400, "body must include a tool name");
      }

      const raw = flattenContent(await callTool(name, args as Record<string, unknown>));
      const result = await scan(raw);

      await store.append({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        route: req.originalUrl,
        tool: name,
        origin: "api",
        direction: "inbound",
        findings: result.findings,
        counts: result.counts,
        llmPassRan: result.llmPass.ran,
        durationMs: result.durationMs,
        redactedText: result.redactedText,
      });

      const answer = await chatComplete(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${question}\n\n---\n${result.redactedText}` },
        ],
        { model: config.analysis.model, timeoutMs: config.analysis.timeoutMs },
      );

      res.json({ redactionCount: result.findings.length, counts: result.counts, answer });
    }),
  );

  return router;
}
