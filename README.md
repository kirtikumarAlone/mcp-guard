# MCP-Guard

A data-loss-prevention proxy for Model Context Protocol traffic. It sits between an
AI agent and an MCP server, inspects every tool call in both directions, and replaces
sensitive values with stable placeholders before the model ever sees them.

# Live
[MCP-Guard Live Dashboard](https://mcp-guard-1.onrender.com/)
```
┌─ automatic feed (off by default, Start/Stop in the console)
├─ manual upload (paste or drop a file in the console)
└─ data source connectors (live PostgreSQL / MongoDB / HTTP API)
        │
        ▼
   MCP-Guard
        │
        ├─ regex pass        structural shapes, checksum-validated
        ├─ AI pass           names, addresses, free-text identifiers — via OpenRouter
        ├─ masking engine    [REDACTED_SSN_1]
        └─ audit log ──▶ MongoDB (or in-memory) ──▶ console (copy / download / export)
```
# Preview
https://github.com/user-attachments/assets/1b5a0a75-2593-4875-b230-97f1f82959e6


## What's in this build

- **Everything AI runs through OpenRouter.** Detection's second pass and the final
  "analyze this dataset" step both use the same `OPENROUTER_API_KEY`. No separate
  Anthropic account needed. `openrouter/free` works out of the box for both.
- **An automatic traffic feed, controlled from the console — never on by default.**
  Press Start and the guard calls a rotation of the upstream server's demo tools on a
  timer (45s by default). Press Stop and it stops. The server itself never starts
  this on its own.
- **A manual test panel.** Paste text or drop a `.txt`/`.json`/`.csv` file and it's
  scanned immediately.
- **Live database and API connectors.** Point the guard at a real PostgreSQL
  database, a MongoDB collection, or any external HTTP API, from the console —
  fetch, redact, and see the result in one action. Nothing is preconfigured in
  `.env`; every connection detail is entered per-request and used once, never
  stored or logged.
- **Export on every result.** Every scan — manual, automatic, or from a connector —
  can be copied to the clipboard or downloaded as `.txt`/`.json`. The whole audit
  log exports as JSON or CSV from the events panel.
- **No Docker.** Runs with `npm run dev` / `npm start`, nothing else required.

## Running it

```bash
npm install
cp .env.example .env      # add OPENROUTER_API_KEY if you want the AI pass and analysis
npm test
npm run dev
```

```bash
cd dashboard
npm install
npm run dev                # http://localhost:5173
```

The backend runs with zero keys: no `OPENROUTER_API_KEY` means regex-only detection
and `/analyze` returns 400; no `MONGODB_URI` means the audit log lives in memory and
resets on restart. `GET /health` reports the actual state of each.

## Using the console

Open `http://localhost:5173`. Four things happen there:

1. **Automatic traffic** — pick an interval, press Start. Each tick calls one
   upstream demo tool and logs the result. Press Stop any time.
2. **Test your own data** — paste text or choose a file, press Scan. The redacted
   result and every finding show immediately, with Copy and Download buttons.
3. **Connect a data source** — switch between API, PostgreSQL, and MongoDB, fill in
   the connection details, press "Fetch & scan." The guard connects, pulls the data,
   redacts it, and shows the same result card as the upload panel. Connection
   details are used for that one request only — never logged, never stored. Use
   read-only credentials when pointing this at anything real.
4. **Redaction events** — every scan from all three paths lands here, filterable by
   source, direction, and PII type. Click a row for the full finding list, a copy
   of the redacted text, and a download button. "Export" in the panel header
   downloads the whole visible log as JSON or CSV, or copies it to the clipboard.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | subsystem status |
| GET | `/mcp/tools` | tool catalogue from the upstream server |
| POST | `/mcp/call` | guarded tool call — `{ name, arguments }` |
| GET | `/mcp/demo/:tool?count=5` | same call from a browser |
| POST | `/scan` | scan pasted/uploaded text — the console's upload panel |
| POST | `/sources/http` | fetch an external API and scan the response — `{ url, method?, headers?, body? }` |
| POST | `/sources/postgres` | run a read-only query and scan the rows — `{ connectionString, query, limit? }` |
| POST | `/sources/mongo` | run a find() and scan the documents — `{ uri, database, collection, filter?, limit? }` |
| POST | `/analyze` | pull from MCP, redact, then ask an OpenRouter model about it |
| GET | `/scheduler/status` | is the automatic feed running, and its stats |
| POST | `/scheduler/start` | `{ intervalMs? }` — starts the automatic feed |
| POST | `/scheduler/stop` | stops it |
| GET | `/audit/events?limit=&direction=&type=&origin=` | audit events, newest first, each including the full redacted text |
| GET | `/audit/summary` | totals by type, direction and origin |

`origin` on an event is one of `scheduler` (automatic feed), `manual` (paste/upload
panel), `source` (a database or API connector), or `api` (a direct `/mcp/call` from
an agent or script).

```bash
curl -s localhost:5000/mcp/tools | jq
curl -s -X POST localhost:5000/scheduler/start -d '{"intervalMs":30000}' -H 'content-type: application/json'
curl -s -X POST localhost:5000/scan -d '{"text":"SSN 123-45-6789"}' -H 'content-type: application/json'
curl -s -X POST localhost:5000/sources/http -d '{"url":"https://api.example.com/customers"}' -H 'content-type: application/json'
curl -s -X POST localhost:5000/sources/postgres -d '{"connectionString":"postgres://user:pass@host/db","query":"select * from customers limit 20"}' -H 'content-type: application/json'
curl -s -X POST localhost:5000/sources/mongo -d '{"uri":"mongodb://host","database":"app","collection":"customers"}' -H 'content-type: application/json'
```

### Data source safety notes

- **PostgreSQL** — only a single `SELECT` statement is accepted; anything
  containing `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, or a second statement
  after a `;` is rejected before it reaches the database. A `LIMIT` is appended
  automatically if missing (default 20 rows, capped at 200). This is a safety net,
  not a substitute for connecting with a database user that only has `SELECT`
  privileges — use one.
- **MongoDB** — only `find()` with an optional JSON filter is supported, capped at
  200 documents. No writes, no aggregation pipeline execution.
- **HTTP** — only `http://` and `https://` URLs are accepted; the response body is
  capped at `SOURCE_MAX_CHARS` (20,000 by default) before scanning.
- None of the three ever write the connection string, URI, or headers to the audit
  log — only a sanitised label (the URL's host, or `database.collection`) is stored
  alongside the scan result.

## Layout

```
src/
  config.ts             environment parsing
  logger.ts              structured JSON logging
  openrouter.ts           shared OpenRouter chat-completion client
  scheduler.ts             the automatic feed — off until start() is called
  service.ts             guarded call orchestration and audit recording
  server.ts               express app factory
  index.ts                process entry, graceful shutdown
  detection/
    patterns.ts         rule table, precedence, Luhn
    regex.ts              structural pass
    llm.ts                 OpenRouter-backed second pass
    mask.ts                overlap resolution and placeholder assignment
  dataSources/
    http.ts                generic external API connector
    postgres.ts             read-only PostgreSQL connector
    mongo.ts                 MongoDB find() connector
  mcp/client.ts          JSON-RPC over Streamable HTTP
  storage/                 AuditStore interface, Mongo and in-memory backends
  routes/                  health, mcp, scan, sources, audit, analyze, scheduler
  middleware/errors.ts     typed HTTP errors, async wrapper
tests/                     vitest — detection, HTTP contract, scheduler, data sources
dashboard/                 React + TypeScript console
```

## Configuration

| Variable | Default | Effect when unset |
| --- | --- | --- |
| `MCP_SERVER_URL` | dlptest public server | — |
| `OPENROUTER_API_KEY` | — | AI pass skipped; `/analyze` returns 400 |
| `OPENROUTER_MODEL` | `openrouter/free` | — |
| `LLM_MAX_CHARS` | `6000` | — |
| `LLM_TIMEOUT_MS` | `30000` | — |
| `ANALYSIS_MODEL` | same as `OPENROUTER_MODEL` | — |
| `ANALYSIS_TIMEOUT_MS` | `30000` | — |
| `MONGODB_URI` | — | in-memory audit log |
| `SOURCE_TIMEOUT_MS` | `15000` | — |
| `SOURCE_MAX_CHARS` | `20000` | — |
| `SOURCE_DEFAULT_LIMIT` | `20` | — |
| `SOURCE_MAX_LIMIT` | `200` | — |
| `PORT` | `5000` | — |
| `CORS_ORIGIN` | `*` | — |

`openrouter/free` is OpenRouter's own router — it picks a free underlying model per
request. It has no dollar cost but is still rate-limited (roughly 20 requests/minute
on the free tier), which is why the automatic feed defaults to a 45-second interval
and why it's off until you start it.

Note that `MONGODB_URI` above configures the guard's own **audit log** storage. The
live MongoDB connector in "Connect a data source" is separate and unrelated — its
connection URI is entered per-request in the dashboard, not in `.env`, even if it
happens to point at the same cluster.

## Deployment

```bash
npm run build
npm start
```

Any host that runs `npm ci && npm run build` then `npm start` works — Render,
Railway, Fly.io, a plain VPS. The dashboard is a static Vite build
(`npm run build` in `dashboard/`) with `VITE_GUARD_URL` pointed at the deployed guard.

## Roadmap

- Replace the OpenRouter call in `detection/llm.ts` with a local Ollama model so
  payloads never leave the host during the AI pass.
- Per-type policy — `redact`, `block`, `allow` — evaluated before masking.
- Server-sent events in place of console polling once event volume justifies it.
- Saved connection profiles for the data-source panel (still never persisting
  credentials server-side — a browser-local, opt-in convenience only).
