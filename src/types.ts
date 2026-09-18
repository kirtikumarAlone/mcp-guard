export type PiiType =
  | "SSN"
  | "CREDIT_CARD"
  | "CVV"
  | "EMAIL"
  | "PHONE"
  | "API_KEY"
  | "IP_ADDRESS"
  | "IBAN"
  | "PERSON_NAME"
  | "ADDRESS"
  | "DATE_OF_BIRTH"
  | "MEDICAL_RECORD_NUMBER"
  | "BANK_ACCOUNT";

export type DetectionSource = "regex" | "llm";

export type Direction = "inbound" | "outbound";

/** How this scan entered the system. Drives the dashboard's filterable views. */
export type Origin = "scheduler" | "manual" | "api" | "source";

export interface PiiSpan {
  type: PiiType;
  value: string;
  start: number;
  end: number;
  source: DetectionSource;
}

/** Audit-safe record of a single redaction. Never carries the original value. */
export interface Finding {
  type: PiiType;
  source: DetectionSource;
  placeholder: string;
  preview: string;
}

export interface ScanResult {
  redactedText: string;
  findings: Finding[];
  counts: Partial<Record<PiiType, number>>;
  llmPass: { ran: boolean; skippedReason: string | null; truncated: boolean };
  durationMs: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  route: string;
  tool?: string;
  origin: Origin;
  direction: Direction;
  findings: Finding[];
  counts: Partial<Record<PiiType, number>>;
  llmPassRan: boolean;
  durationMs: number;
  /** The full masked text, kept so a scan's output can be reviewed or exported later. */
  redactedText: string;
}

export interface AuditSummary {
  totalEvents: number;
  totalRedactions: number;
  byType: Record<string, number>;
  byDirection: Record<Direction, number>;
  byOrigin: Record<Origin, number>;
}
