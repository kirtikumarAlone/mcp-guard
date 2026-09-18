import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSnapshot,
  startScheduler,
  stopScheduler,
  type Direction,
  type Origin,
  type Snapshot,
} from "./lib/api";
import {
  DataSourcePanel,
  EmptyState,
  ErrorState,
  EventTable,
  ExportMenu,
  Filters,
  MetricStrip,
  SchedulerPanel,
  TopBar,
  TypeBreakdown,
  UploadPanel,
} from "./components";

const POLL_INTERVAL_MS = 3000;

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [direction, setDirection] = useState<Direction | "all">("all");
  const [type, setType] = useState("all");
  const [origin, setOrigin] = useState<Origin | "all">("all");
  const [schedulerBusy, setSchedulerBusy] = useState(false);

  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    try {
      const next = await fetchSnapshot({ direction, type, origin }, controller.signal);
      setSnapshot(next);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(`Cannot reach the guard. ${(err as Error).message}`);
    }
  }, [direction, type, origin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [live, refresh]);

  // Drives the relative timestamps without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const knownTypes = useMemo(
    () => Object.keys(snapshot?.summary.byType ?? {}).sort(),
    [snapshot?.summary.byType],
  );

  const handleStart = useCallback(
    async (intervalMs: number) => {
      setSchedulerBusy(true);
      try {
        await startScheduler(intervalMs);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSchedulerBusy(false);
        void refresh();
      }
    },
    [refresh],
  );

  const handleStop = useCallback(async () => {
    setSchedulerBusy(true);
    try {
      await stopScheduler();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSchedulerBusy(false);
      void refresh();
    }
  }, [refresh]);

  return (
    <div className="app">
      <TopBar
        health={snapshot?.health ?? null}
        live={live}
        onToggleLive={() => setLive((value) => !value)}
        lastUpdated={lastUpdated}
      />

      <main className="content">
        <MetricStrip summary={snapshot?.summary ?? null} />

        <div className="control-row">
          <SchedulerPanel
            status={snapshot?.scheduler ?? null}
            onStart={(intervalMs) => void handleStart(intervalMs)}
            onStop={() => void handleStop()}
            busy={schedulerBusy}
          />
          <UploadPanel onSubmitted={() => void refresh()} />
          <DataSourcePanel onSubmitted={() => void refresh()} />
        </div>

        <div className="layout">
          <section className="panel table-panel" aria-label="Redaction events">
            <div className="panel-head">
              <h2>Redaction events</h2>
              <div className="panel-head-right">
                <Filters
                  direction={direction}
                  type={type}
                  origin={origin}
                  types={knownTypes}
                  onDirection={setDirection}
                  onType={setType}
                  onOrigin={setOrigin}
                />
                <ExportMenu events={snapshot?.events ?? []} />
              </div>
            </div>

            {error && <ErrorState message={error} onRetry={() => void refresh()} />}
            {!error && snapshot && snapshot.events.length === 0 && <EmptyState />}
            {!error && snapshot && snapshot.events.length > 0 && (
              <EventTable events={snapshot.events} now={now} />
            )}
            {!error && !snapshot && <div className="state muted">Loading events…</div>}
          </section>

          <TypeBreakdown summary={snapshot?.summary ?? null} />
        </div>

        <p className="footnote">
          Original values are never stored. The log keeps the type, the placeholder, a masked
          preview, and the redacted output only.
        </p>
      </main>
    </div>
  );
}
