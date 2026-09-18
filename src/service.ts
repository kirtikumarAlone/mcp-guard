import { randomUUID } from "node:crypto";
import { scan, scanJson } from "./detection";
import { callTool, flattenContent } from "./mcp/client";
import type { AuditStore } from "./storage";
import type { AuditEvent, Direction, Origin, ScanResult } from "./types";

export interface GuardedCallInput {
  tool: string;
  args: Record<string, unknown>;
  route: string;
  origin: Origin;
}

export interface GuardedCallOutput {
  tool: string;
  redactionCount: number;
  counts: ScanResult["counts"];
  llmPass: ScanResult["llmPass"];
  outboundRedactions: number;
  durationMs: number;
  clean: string;
}

export class GuardService {
  constructor(private readonly store: AuditStore) {}

  private async record(
    result: ScanResult,
    meta: { route: string; tool?: string; origin: Origin; direction: Direction },
  ): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      route: meta.route,
      tool: meta.tool,
      origin: meta.origin,
      direction: meta.direction,
      findings: result.findings,
      counts: result.counts,
      llmPassRan: result.llmPass.ran,
      durationMs: result.durationMs,
      redactedText: result.redactedText,
    };

    await this.store.append(event);
    return event;
  }

  /**
   * Inspects tool arguments on the way out and the tool response on the way
   * back. Outbound inspection matters because sensitive text frequently
   * reaches an external MCP server inside the call arguments themselves.
   */
  async call(input: GuardedCallInput): Promise<GuardedCallOutput> {
    const outbound = await scanJson(input.args);
    if (outbound.result.findings.length > 0) {
      await this.record(outbound.result, {
        route: input.route,
        tool: input.tool,
        origin: input.origin,
        direction: "outbound",
      });
    }

    const raw = flattenContent(await callTool(input.tool, input.args));
    const inbound = await scan(raw);

    await this.record(inbound, {
      route: input.route,
      tool: input.tool,
      origin: input.origin,
      direction: "inbound",
    });

    return {
      tool: input.tool,
      redactionCount: inbound.findings.length,
      counts: inbound.counts,
      llmPass: inbound.llmPass,
      outboundRedactions: outbound.result.findings.length,
      durationMs: inbound.durationMs,
      clean: inbound.redactedText,
    };
  }

  /**
   * Entry point for anything that hands the guard raw text directly rather
   * than going through an MCP tool call: the dashboard's paste/upload panel
   * (origin "manual") and the live database/API connectors (origin "source").
   */
  async scanText(text: string, route: string, origin: Origin = "manual"): Promise<ScanResult> {
    const result = await scan(text);
    await this.record(result, { route, origin, direction: "inbound" });
    return result;
  }
}
