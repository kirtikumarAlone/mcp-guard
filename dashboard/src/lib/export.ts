import type { AuditEvent } from "./api";

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Flattens the audit log into a spreadsheet-friendly CSV, one row per event. */
export function eventsToCsv(events: AuditEvent[]): string {
  const header = [
    "timestamp",
    "origin",
    "direction",
    "tool",
    "route",
    "types",
    "valuesRedacted",
    "durationMs",
    "redactedText",
  ];

  const rows = events.map((event) => {
    const types = Object.entries(event.counts)
      .map(([type, count]) => `${type}:${count}`)
      .join(" ");
    const total = Object.values(event.counts).reduce((sum, n) => sum + n, 0);

    return [
      event.timestamp,
      event.origin,
      event.direction,
      event.tool ?? "",
      event.route,
      types,
      String(total),
      String(event.durationMs),
      event.redactedText,
    ]
      .map(csvCell)
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

export function eventsToJson(events: AuditEvent[]): string {
  return JSON.stringify(events, null, 2);
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function exportFilename(extension: "json" | "csv"): string {
  return `mcp-guard-audit-${timestampForFilename()}.${extension}`;
}
