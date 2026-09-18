import { Fragment, useRef, useState } from "react";
import type {
  AuditEvent,
  Direction,
  Health,
  Origin,
  ScanResponse,
  SchedulerStatus,
  Summary,
} from "../lib/api";
import { fetchHttpSource, fetchMongoSource, fetchPostgresSource, GUARD_URL, submitScan } from "../lib/api";
import { clock, countOf, originLabel, relative, typeLabel } from "../lib/format";
import { copyText, downloadText, eventsToCsv, eventsToJson, exportFilename } from "../lib/export";

export function TopBar({
  health,
  live,
  onToggleLive,
  lastUpdated,
}: {
  health: Health | null;
  live: boolean;
  onToggleLive: () => void;
  lastUpdated: number | null;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">MCP-Guard</span>
        <span className="brand-version">{health?.version ?? "—"}</span>
      </div>

      <dl className="topbar-facts">
        <div>
          <dt>Upstream</dt>
          <dd>{health ? safeHost(health.upstream) : "—"}</dd>
        </div>
        <div>
          <dt>Audit store</dt>
          <dd>{health?.auditStore ?? "—"}</dd>
        </div>
        <div>
          <dt>AI pass</dt>
          <dd>{health ? (health.llmPass.enabled ? health.llmPass.model : "off") : "—"}</dd>
        </div>
      </dl>

      <div className="topbar-actions">
        {lastUpdated && <span className="updated">updated {clock(new Date(lastUpdated).toISOString())}</span>}
        <button type="button" className={`live ${live ? "on" : "off"}`} onClick={onToggleLive}>
          <span className="live-dot" aria-hidden="true" />
          {live ? "Live" : "Paused"}
        </button>
      </div>
    </header>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function MetricStrip({ summary }: { summary: Summary | null }) {
  const metrics = [
    { label: "Values redacted", value: summary?.totalRedactions ?? 0 },
    { label: "Scans", value: summary?.totalEvents ?? 0 },
    { label: "Automatic", value: summary?.byOrigin.scheduler ?? 0 },
    { label: "Manual + sources", value: (summary?.byOrigin.manual ?? 0) + (summary?.byOrigin.source ?? 0) },
  ];

  return (
    <section className="metrics" aria-label="Totals">
      {metrics.map((metric) => (
        <div key={metric.label} className="metric">
          <span className="metric-value">{metric.value.toLocaleString()}</span>
          <span className="metric-label">{metric.label}</span>
        </div>
      ))}
    </section>
  );
}

const INTERVAL_OPTIONS = [
  { label: "15s", value: 15_000 },
  { label: "30s", value: 30_000 },
  { label: "45s", value: 45_000 },
  { label: "60s", value: 60_000 },
];

/**
 * Controls the background traffic generator. Off until someone presses
 * Start — the server never starts this loop on its own.
 */
export function SchedulerPanel({
  status,
  onStart,
  onStop,
  busy,
}: {
  status: SchedulerStatus | null;
  onStart: (intervalMs: number) => void;
  onStop: () => void;
  busy: boolean;
}) {
  const [intervalMs, setIntervalMs] = useState(45_000);
  const running = status?.running ?? false;

  return (
    <section className="panel scheduler" aria-label="Automatic traffic">
      <div className="panel-head">
        <h2>Automatic traffic</h2>
        <span className={`pill ${running ? "on" : ""}`}>{running ? "Running" : "Stopped"}</span>
      </div>

      <div className="scheduler-body">
        <p className="muted">
          Calls a rotation of the upstream server's demo tools on a timer, so the log fills in
          without you triggering each request by hand.
        </p>

        <div className="scheduler-controls">
          <label className="select">
            <span>Every</span>
            <select
              value={intervalMs}
              disabled={running}
              onChange={(event) => setIntervalMs(Number(event.target.value))}
            >
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {running ? (
            <button type="button" className="danger" onClick={onStop} disabled={busy}>
              Stop
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => onStart(intervalMs)} disabled={busy}>
              Start
            </button>
          )}
        </div>

        {status && (
          <dl className="scheduler-facts">
            <div>
              <dt>Calls made</dt>
              <dd className="mono">{status.ticks}</dd>
            </div>
            <div>
              <dt>Last tool</dt>
              <dd className="mono">{status.lastTool ?? "—"}</dd>
            </div>
            <div>
              <dt>Last run</dt>
              <dd className="mono">{status.lastRunAt ? relative(status.lastRunAt, Date.now()) : "—"}</dd>
            </div>
          </dl>
        )}

        {status?.lastError && <p className="inline-error">Last attempt failed: {status.lastError}</p>}
      </div>
    </section>
  );
}

/** Copy and download affordances shared by the upload panel and every data-source result. */
export function ScanResultCard({ result }: { result: ScanResponse }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(result.redactedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="upload-result">
      <div className="upload-result-head">
        <span>
          {result.findings.length === 0
            ? "Nothing sensitive found"
            : `${result.findings.length} value${result.findings.length === 1 ? "" : "s"} redacted`}
        </span>
        <span className="muted">
          {result.llmPass.ran ? "regex + AI pass" : "regex pass only"} · {result.durationMs}ms
        </span>
      </div>

      <pre className="redacted-preview">{result.redactedText}</pre>

      <div className="result-actions">
        <button type="button" onClick={() => void handleCopy()}>
          {copied ? "Copied" : "Copy masked text"}
        </button>
        <button
          type="button"
          onClick={() => downloadText(`redacted-${Date.now()}.txt`, result.redactedText)}
        >
          Download .txt
        </button>
        <button
          type="button"
          onClick={() => downloadText(`redacted-${Date.now()}.json`, JSON.stringify(result, null, 2), "application/json")}
        >
          Download .json
        </button>
      </div>

      {result.findings.length > 0 && (
        <ul className="chips">
          {Object.entries(result.counts).map(([type, count]) => (
            <li key={type} className="chip">
              {typeLabel(type)}
              {count > 1 && <em>{count}</em>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACCEPTED_EXTENSIONS = [".txt", ".json", ".csv", ".log", ".md"];

/**
 * Lets anyone try the detector on their own data — paste text or drop a
 * file. Reads the file in the browser and sends only the text; nothing is
 * written to disk on either side beyond the usual audit-log placeholder.
 */
export function UploadPanel({ onSubmitted }: { onSubmitted: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setText(await file.text());
  }

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await submitScan(text));
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setText("");
    setFileName(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <section className="panel upload" aria-label="Test your own data">
      <div className="panel-head">
        <h2>Test your own data</h2>
        {(text || result) && (
          <button type="button" className="link" onClick={reset}>
            Clear
          </button>
        )}
      </div>

      <div className="upload-body">
        <p className="muted">
          Paste text or drop a file to see it scanned immediately. Nothing you enter here is
          stored — only the redaction findings are logged.
        </p>

        <textarea
          value={text}
          placeholder="Paste text containing names, emails, SSNs, card numbers…"
          onChange={(event) => {
            setText(event.target.value);
            setFileName(null);
          }}
          rows={5}
        />

        <div className="upload-controls">
          <label className="file-drop">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {fileName ?? `Choose a file (${ACCEPTED_EXTENSIONS.join(", ")})`}
          </label>

          <button type="button" className="primary" onClick={() => void submit()} disabled={busy || !text.trim()}>
            {busy ? "Scanning…" : "Scan"}
          </button>
        </div>

        {error && <p className="inline-error">{error}</p>}
        {result && <ScanResultCard result={result} />}
      </div>
    </section>
  );
}

type SourceType = "http" | "postgres" | "mongo";

/**
 * Live connectors: point the guard at a real API, PostgreSQL database, or
 * MongoDB collection and scan what comes back. Every field here is used for
 * one request only — connection details are never stored or logged.
 */
export function DataSourcePanel({ onSubmitted }: { onSubmitted: () => void }) {
  const [type, setType] = useState<SourceType>("http");
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [headersText, setHeadersText] = useState("");
  const [requestBody, setRequestBody] = useState("");

  const [connectionString, setConnectionString] = useState("");
  const [query, setQuery] = useState("select * from customers");

  const [mongoUri, setMongoUri] = useState("");
  const [database, setDatabase] = useState("");
  const [collection, setCollection] = useState("");
  const [filter, setFilter] = useState("");

  function parseHeaders(): Record<string, string> | undefined {
    if (!headersText.trim()) return undefined;
    const headers: Record<string, string> = {};
    for (const line of headersText.split("\n")) {
      const [key, ...rest] = line.split(":");
      if (key && rest.length > 0) headers[key.trim()] = rest.join(":").trim();
    }
    return headers;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (type === "http") {
        if (!url.trim()) throw new Error("URL is required");
        setResult(await fetchHttpSource({ url, method, headers: parseHeaders(), body: requestBody || undefined }));
      } else if (type === "postgres") {
        if (!connectionString.trim() || !query.trim()) throw new Error("connection string and query are required");
        setResult(await fetchPostgresSource({ connectionString, query }));
      } else {
        if (!mongoUri.trim() || !database.trim() || !collection.trim()) {
          throw new Error("connection URI, database and collection are required");
        }
        setResult(await fetchMongoSource({ uri: mongoUri, database, collection, filter: filter || undefined }));
      }
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel sources" aria-label="Connect a data source">
      <div className="panel-head">
        <h2>Connect a data source</h2>
      </div>

      <div className="sources-body">
        <div className="segmented" role="group" aria-label="Data source type">
          {(["http", "postgres", "mongo"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={type === option ? "active" : ""}
              aria-pressed={type === option}
              onClick={() => {
                setType(option);
                setResult(null);
                setError(null);
              }}
            >
              {option === "http" ? "API" : option === "postgres" ? "PostgreSQL" : "MongoDB"}
            </button>
          ))}
        </div>

        {type === "http" && (
          <div className="source-form">
            <div className="field-row">
              <select value={method} onChange={(event) => setMethod(event.target.value as "GET" | "POST")}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
              <input
                type="text"
                placeholder="https://api.example.com/customers"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <textarea
              placeholder={"Headers, one per line — Authorization: Bearer …"}
              value={headersText}
              onChange={(event) => setHeadersText(event.target.value)}
              rows={2}
            />
            {method === "POST" && (
              <textarea
                placeholder="Request body"
                value={requestBody}
                onChange={(event) => setRequestBody(event.target.value)}
                rows={2}
              />
            )}
          </div>
        )}

        {type === "postgres" && (
          <div className="source-form">
            <input
              type="text"
              placeholder="postgres://user:password@host:5432/database"
              value={connectionString}
              onChange={(event) => setConnectionString(event.target.value)}
            />
            <textarea
              placeholder="select * from customers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={2}
              className="mono-input"
            />
            <p className="hint">Read-only SELECT statements only. A LIMIT is added automatically if missing.</p>
          </div>
        )}

        {type === "mongo" && (
          <div className="source-form">
            <input
              type="text"
              placeholder="mongodb+srv://user:password@cluster/…"
              value={mongoUri}
              onChange={(event) => setMongoUri(event.target.value)}
            />
            <div className="field-row">
              <input
                type="text"
                placeholder="database"
                value={database}
                onChange={(event) => setDatabase(event.target.value)}
              />
              <input
                type="text"
                placeholder="collection"
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
              />
            </div>
            <textarea
              placeholder='Filter — optional JSON, e.g. {"status":"active"}'
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              rows={2}
              className="mono-input"
            />
          </div>
        )}

        <p className="hint">
          Credentials are sent for this one request only and are never stored or logged. Use a
          read-only account when pointing this at real data.
        </p>

        <button type="button" className="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "Fetching…" : "Fetch & scan"}
        </button>

        {error && <p className="inline-error">{error}</p>}
        {result && <ScanResultCard result={result} />}
      </div>
    </section>
  );
}

export function Filters({
  direction,
  type,
  origin,
  types,
  onDirection,
  onType,
  onOrigin,
}: {
  direction: Direction | "all";
  type: string;
  origin: Origin | "all";
  types: string[];
  onDirection: (value: Direction | "all") => void;
  onType: (value: string) => void;
  onOrigin: (value: Origin | "all") => void;
}) {
  return (
    <div className="filters">
      <div className="segmented" role="group" aria-label="Filter by source">
        {(["all", "scheduler", "manual", "source", "api"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={origin === option ? "active" : ""}
            aria-pressed={origin === option}
            onClick={() => onOrigin(option)}
          >
            {option === "all" ? "All sources" : originLabel(option)}
          </button>
        ))}
      </div>

      <div className="segmented" role="group" aria-label="Filter by direction">
        {(["all", "inbound", "outbound"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={direction === option ? "active" : ""}
            aria-pressed={direction === option}
            onClick={() => onDirection(option)}
          >
            {option === "all" ? "All" : option === "inbound" ? "Responses" : "Arguments"}
          </button>
        ))}
      </div>

      <label className="select">
        <span>Type</span>
        <select value={type} onChange={(event) => onType(event.target.value)}>
          <option value="all">All types</option>
          {types.map((option) => (
            <option key={option} value={option}>
              {typeLabel(option)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ExportMenu({ events }: { events: AuditEvent[] }) {
  const [open, setOpen] = useState(false);

  function exportAs(format: "json" | "csv") {
    const content = format === "json" ? eventsToJson(events) : eventsToCsv(events);
    downloadText(exportFilename(format), content, format === "json" ? "application/json" : "text/csv");
    setOpen(false);
  }

  return (
    <div className="export-menu">
      <button type="button" onClick={() => setOpen((value) => !value)} disabled={events.length === 0}>
        Export ({events.length})
      </button>
      {open && (
        <div className="export-options">
          <button type="button" onClick={() => exportAs("json")}>
            Download JSON
          </button>
          <button type="button" onClick={() => exportAs("csv")}>
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void copyText(eventsToJson(events));
              setOpen(false);
            }}
          >
            Copy JSON
          </button>
        </div>
      )}
    </div>
  );
}

export function EventTable({ events, now }: { events: AuditEvent[]; now: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyEvent(event: AuditEvent) {
    await copyText(event.redactedText);
    setCopiedId(event.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <table className="events">
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Source</th>
          <th scope="col">Direction</th>
          <th scope="col">Tool</th>
          <th scope="col">Detected</th>
          <th scope="col" className="num">
            Values
          </th>
          <th scope="col" className="num">
            Latency
          </th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const open = openId === event.id;
          const total = countOf(event.counts);

          return (
            <Fragment key={event.id}>
              <tr
                className={`row ${open ? "open" : ""}`}
                onClick={() => setOpenId(open ? null : event.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenId(open ? null : event.id);
                  }
                }}
              >
                <td className="mono">
                  {clock(event.timestamp)}
                  <span className="ago">{relative(event.timestamp, now)}</span>
                </td>
                <td>
                  <span className={`tag origin-${event.origin}`}>{originLabel(event.origin)}</span>
                </td>
                <td>
                  <span className={`tag ${event.direction}`}>
                    {event.direction === "inbound" ? "response" : "arguments"}
                  </span>
                </td>
                <td className="mono">{event.tool ?? event.route}</td>
                <td>
                  {total === 0 ? (
                    <span className="muted">clean</span>
                  ) : (
                    <span className="types">
                      {Object.entries(event.counts).map(([type, count]) => (
                        <span key={type} className="chip">
                          {typeLabel(type)}
                          {count > 1 && <em>{count}</em>}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="num mono">{total}</td>
                <td className="num mono">{event.durationMs}ms</td>
              </tr>

              {open && (
                <tr className="detail">
                  <td colSpan={7}>
                    <div className="detail-head">
                      <span>
                        {event.llmPassRan ? "regex + AI pass" : "regex pass only"} · {event.route}
                      </span>
                      <div className="detail-actions">
                        <button type="button" onClick={() => void copyEvent(event)}>
                          {copiedId === event.id ? "Copied" : "Copy masked text"}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadText(`event-${event.id}.txt`, event.redactedText)}
                        >
                          Download .txt
                        </button>
                      </div>
                    </div>

                    <pre className="redacted-preview">{event.redactedText || "(empty)"}</pre>

                    {event.findings.length === 0 ? (
                      <p className="muted">No sensitive values in this payload.</p>
                    ) : (
                      <table className="findings">
                        <thead>
                          <tr>
                            <th scope="col">Type</th>
                            <th scope="col">Placeholder</th>
                            <th scope="col">Masked value</th>
                            <th scope="col">Pass</th>
                          </tr>
                        </thead>
                        <tbody>
                          {event.findings.map((finding, index) => (
                            <tr key={`${finding.placeholder}-${index}`}>
                              <td>{typeLabel(finding.type)}</td>
                              <td className="mono">{finding.placeholder}</td>
                              <td className="mono">{finding.preview}</td>
                              <td>{finding.source}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function TypeBreakdown({ summary }: { summary: Summary | null }) {
  const rows = Object.entries(summary?.byType ?? {}).sort((a, b) => b[1] - a[1]);
  const peak = rows[0]?.[1] ?? 1;

  return (
    <aside className="panel" aria-label="Breakdown by type">
      <h2>By type</h2>
      {rows.length === 0 ? (
        <p className="muted">Nothing detected yet.</p>
      ) : (
        <ul className="breakdown">
          {rows.map(([type, count]) => (
            <li key={type}>
              <span className="breakdown-label">{typeLabel(type)}</span>
              <span className="breakdown-track">
                <span className="breakdown-fill" style={{ width: `${(count / peak) * 100}%` }} />
              </span>
              <span className="breakdown-count mono">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function EmptyState() {
  return (
    <div className="state">
      <p>No events recorded.</p>
      <p className="muted">
        Start the automatic feed, test your own data, or connect a data source above — any of them
        appears here within seconds.
      </p>
      <code>curl "{GUARD_URL}/mcp/demo/generate_pii_ssn_ccn?count=5"</code>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state error">
      <p>{message}</p>
      <p className="muted">
        Start the guard with <code className="inline">npm run dev</code>, or set{" "}
        <code className="inline">VITE_GUARD_URL</code> to its address.
      </p>
      <button type="button" onClick={onRetry}>
        Retry now
      </button>
    </div>
  );
}
