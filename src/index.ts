import { config } from "./config";
import { describeError, log } from "./logger";
import { initialize } from "./mcp/client";
import { createServer } from "./server";
import { createAuditStore } from "./storage";

async function main(): Promise<void> {
  const store = await createAuditStore();
  const { app, scheduler } = createServer(store);

  // Non-fatal: the service still serves /scan and /audit if the upstream is down.
  initialize()
    .then((info) => log.info("upstream ready", { server: info.serverInfo?.name ?? config.mcp.url }))
    .catch((err) => log.warn("upstream unreachable", { error: describeError(err) }));

  const server = app.listen(config.port, () => {
    log.info("mcp-guard listening", {
      port: config.port,
      env: config.env,
      auditStore: store.kind,
      llmPass: Boolean(config.llm.apiKey),
    });
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      log.info("shutting down", { signal });
      scheduler.stop();
      server.close(() => {
        void store.close().then(() => process.exit(0));
      });
    });
  }
}

main().catch((err) => {
  log.error("failed to start", { error: describeError(err) });
  process.exit(1);
});
