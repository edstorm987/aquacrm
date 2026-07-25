"use client";
// Status badge for a single attached domain. Auto-polls the
// `/api/portal/domains/verify` endpoint every POLL_INTERVAL_MS while
// the domain is in `pending`, until either:
//   - status flips to `verified` (success — green badge, polling stops)
//   - status flips to `error` (red badge with error message, stops)
//   - MAX_POLLS reached (manual re-check needed — yellow with hint)
//
// 30s interval × 10 polls = 5-minute auto-poll window. DNS propagation
// is typically 1–60 minutes; 5 minutes captures the fast cases and
// hands the rest off to the operator's manual "Re-check" button. The
// chapter (`04-deployment-domains-round2.md` §C) calls out the
// trade-off + R3 candidates (longer poll window, exponential backoff).
//
// SSR-safe — initial state comes from props (server snapshot); polling
// kicks in after hydration.

import { useEffect, useRef, useState } from "react";

import type { DomainRecord, DomainStatus, DnsRequirement } from "../lib/domain";

const POLL_INTERVAL_MS = 30_000;
const MAX_POLLS = 10;

interface Props {
  /** Initial domain record from the server snapshot. */
  initial: DomainRecord;
  /** API base — `/api/portal/domains` or `/api/portal/domains?clientId=…`. */
  apiBase: string;
}

interface VerifyResponse {
  ok: boolean;
  configured: boolean;
  domain?: DomainRecord;
  pending: DnsRequirement[];
  error?: string;
}

export function DomainStatusBadge({ initial, apiBase }: Props): React.JSX.Element {
  const [status, setStatus] = useState<DomainStatus>(initial.status);
  const [pending, setPending] = useState<DnsRequirement[]>(initial.pending);
  const [lastError, setLastError] = useState<string | undefined>(initial.lastError);
  const [polling, setPolling] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const pollCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Strip query params off `apiBase` so we can append `/verify` without
  // breaking the existing query string.
  const verifyUrl = (() => {
    const [path, qs] = apiBase.split("?");
    const v = `${path}/verify`;
    return qs ? `${v}?${qs}` : v;
  })();

  function clearTimer(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function pollOnce(): Promise<void> {
    pollCountRef.current += 1;
    try {
      const res = await fetch(verifyUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: initial.id }),
        credentials: "include",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as VerifyResponse;
      if (body.domain) {
        setStatus(body.domain.status);
        setPending(body.domain.pending);
        setLastError(body.domain.lastError);
        if (body.domain.status === "verified" || body.domain.status === "error") {
          setPolling(false);
          return; // stop polling
        }
      } else if (!body.ok && body.error) {
        setLastError(body.error);
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "network-error");
    }

    if (pollCountRef.current >= MAX_POLLS) {
      setPolling(false);
      setExhausted(true);
      return;
    }
    timerRef.current = setTimeout(() => { void pollOnce(); }, POLL_INTERVAL_MS);
  }

  useEffect(() => {
    if (status !== "pending") return;
    setPolling(true);
    pollCountRef.current = 0;
    setExhausted(false);
    timerRef.current = setTimeout(() => { void pollOnce(); }, POLL_INTERVAL_MS);
    return () => clearTimer();
    // We deliberately key the polling effect on `status` only — the
    // initial snapshot's pending records are fine; polling reads the
    // refreshed records into local state on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Badge status={status} polling={polling} exhausted={exhausted} />
      {polling ? (
        <p className="text-[10px] text-black/40" aria-live="polite">
          checking… ({pollCountRef.current}/{MAX_POLLS})
        </p>
      ) : exhausted ? (
        <p className="text-[10px] text-amber-700" aria-live="polite">
          DNS not propagated after {MAX_POLLS * (POLL_INTERVAL_MS / 1000)}s — click Re-check
        </p>
      ) : null}
      {lastError ? (
        <p className="max-w-xs text-right text-[10px] text-rose-700">{lastError}</p>
      ) : null}
      {pending.length > 0 && (status === "pending" || status === "error") ? (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-black/60">DNS records ({pending.length})</summary>
          <ul className="mt-1 space-y-1 font-mono">
            {pending.map((r, idx) => (
              <li key={idx} className="text-black/70">
                <strong>{r.type}</strong> {r.name} → <code>{r.value}</code>
                {r.reason ? <span className="text-black/40"> ({r.reason})</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Badge({
  status,
  polling,
  exhausted,
}: {
  status: DomainStatus;
  polling: boolean;
  exhausted: boolean;
}): React.JSX.Element {
  const base = "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium";
  if (status === "verified") {
    return (
      <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-800`}>
        <Dot tone="emerald" />
        verified
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={`${base} border-rose-200 bg-rose-50 text-rose-800`}>
        <Dot tone="rose" />
        error
      </span>
    );
  }
  // pending
  const tone = exhausted ? "amber" : polling ? "blue" : "amber";
  const colour =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <span className={`${base} ${colour}`}>
      <Dot tone={tone} pulsing={polling} />
      {polling ? "checking…" : "pending"}
    </span>
  );
}

function Dot({
  tone,
  pulsing,
}: {
  tone: "emerald" | "amber" | "rose" | "blue";
  pulsing?: boolean;
}): React.JSX.Element {
  const colour =
    tone === "emerald" ? "bg-emerald-500"
    : tone === "amber" ? "bg-amber-500"
    : tone === "rose" ? "bg-rose-500"
    : "bg-blue-500";
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 rounded-full ${colour} ${pulsing ? "animate-pulse" : ""}`}
    />
  );
}
