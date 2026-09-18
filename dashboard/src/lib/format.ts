const TYPE_LABELS: Record<string, string> = {
  SSN: "SSN",
  CREDIT_CARD: "Credit card",
  EMAIL: "Email",
  PHONE: "Phone",
  API_KEY: "API key",
  IP_ADDRESS: "IP address",
  IBAN: "IBAN",
  PERSON_NAME: "Name",
  ADDRESS: "Address",
  DATE_OF_BIRTH: "Date of birth",
  MEDICAL_RECORD_NUMBER: "Medical record no.",
  BANK_ACCOUNT: "Bank account",
};

const ORIGIN_LABELS: Record<string, string> = {
  scheduler: "Automatic",
  manual: "Manual upload",
  api: "Direct call",
  source: "Data source",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

export function originLabel(origin: string): string {
  return ORIGIN_LABELS[origin] ?? origin;
}

export function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "--:--:--"
    : date.toLocaleTimeString([], { hour12: false });
}

export function relative(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function countOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, n) => total + n, 0);
}
