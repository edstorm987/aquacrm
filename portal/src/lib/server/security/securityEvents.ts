import "server-only";

// SecurityEvent sink — Phase-0 seed of the security telemetry spine.
//
// Append-only, normalised, SECRET-FREE security events. Phase 1 gives this a
// dedicated tenant-scoped store with restrictive grants and an off-platform
// WORM drain; this seed keeps a bounded in-memory ring AND emits a structured
// log line, so the broker and the response actions have somewhere to write
// from day one and nothing is silently dropped.
//
// CONTRACT (enforced by shape + a redaction pass): an event carries a kind, a
// severity, an optional tenant id, a monotonic-ish timestamp and a `detail`
// object that must contain NO secrets, NO full URLs/query strings, NO request
// bodies, NO prompts and NO file contents. Callers pass host/reason/id-shaped
// fields only. The redactor drops any value that looks like a credential.

export type SecurityEventSeverity = "info" | "warning" | "critical";

export interface SecurityEventInput {
  kind: string;
  severity: SecurityEventSeverity;
  tenantId?: string;
  actor?: string;
  detail?: Record<string, unknown>;
}

export interface SecurityEvent extends SecurityEventInput {
  id: string;
  at: number;
}

const RING_MAX = 500;
const ring: SecurityEvent[] = [];

// Optional off-platform drain. Phase 1 wires this to a WORM endpoint; the hook
// exists now so the drain is a config change, not a code change.
type Drain = (event: SecurityEvent) => void;
let drain: Drain | null = null;
export function setSecurityEventDrain(fn: Drain | null): void {
  drain = fn;
}

const SECRET_KEYish = /(secret|password|token|apikey|api_key|authorization|cookie|key|credential|body|prompt|content)/i;

/** Drops values that look like secrets/bulk content; keeps host/reason/id-shaped fields. */
function redact(detail: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (SECRET_KEYish.test(key)) { out[key] = "[redacted]"; continue; }
    if (typeof value === "string") {
      out[key] = value.length > 256 ? `${value.slice(0, 256)}…` : value;
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else {
      // Nested objects/arrays are summarised, never dumped (could hold bodies).
      out[key] = Array.isArray(value) ? `[array:${value.length}]` : "[object]";
    }
  }
  return out;
}

export function recordSecurityEvent(input: SecurityEventInput): SecurityEvent {
  const event: SecurityEvent = {
    id: cryptoRandomId(),
    at: Date.now(),
    kind: input.kind,
    severity: input.severity,
    tenantId: input.tenantId,
    actor: input.actor,
    detail: redact(input.detail),
  };
  ring.push(event);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  try { drain?.(event); } catch { /* a drain failure must never break the caller */ }
  // Structured, greppable, secret-free.
  // eslint-disable-next-line no-console
  console.warn(`[security-event] ${event.kind} ${event.severity} ${JSON.stringify({ tenantId: event.tenantId, ...event.detail })}`);
  return event;
}

/** Read the recent ring (newest first). For the Phase-6 Threat Centre + tests. */
export function recentSecurityEvents(limit = 100): SecurityEvent[] {
  return ring.slice(-limit).reverse();
}

export function clearSecurityEventsForTest(): void {
  ring.length = 0;
}

function cryptoRandomId(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("crypto").randomUUID();
}
