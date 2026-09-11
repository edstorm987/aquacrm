"use client";

// Route-neutral Threat Centre client panel (Phase 6).
//
// Presentation + intent only. Every action round-trips to
// /api/portal/security/actions, which enforces owner role, fresh password
// re-verification, the typed CONTAIN confirmation, tenant scope and the
// action allowlist SERVER-SIDE — nothing in this file is a security boundary.
// Honesty rules: BLIND posture items render as loudly as incidents do, and no
// state is invented client-side; everything shown came from the overview API.

import { useCallback, useEffect, useState } from "react";

interface PostureItem { id: string; label: string; status: "enforced" | "blind" | "owner"; detail: string }
interface DurableEvent { id: string; at: number; kind: string; severity: string; actor?: string; detail?: Record<string, unknown> }
interface Overview {
  ok: boolean;
  viewer: { userId: string; agencyId?: string; operator: boolean };
  switches: {
    globalReadOnly: { active?: boolean; reason?: string; at: number; actor?: string } | null;
    aiDisabled: { active?: boolean; reason?: string; at: number; actor?: string } | null;
    tenantLockdowns: Record<string, { reason: string; at: number; actor: string }>;
  };
  epochs: { global: number; tenant: number };
  suspendedUsers: Array<{ userId: string; reason: string; at: number; actor: string }>;
  sessions: { recorded: number; active: number; recent: Array<{ sid: string; userId: string; role: string; issuedAt: number; issuedVia: string; lastSeenAt?: number }> };
  durableActions: DurableEvent[];
  posture: PostureItem[];
}

const ACTION_LABELS: Record<string, string> = {
  "lockdown-tenant": "Lock this workspace (everyone except owners blocked until lifted)",
  "lift-tenant-lockdown": "Lift the workspace lock",
  "bump-tenant-epoch": "Sign out everyone in this workspace (forces re-login)",
  "suspend-user": "Suspend a person",
  "unsuspend-user": "Lift a person's suspension",
  "revoke-session": "Sign out one device",
  "revoke-all-user-sessions": "Sign out all of a person's devices",
  "bump-user-epoch": "Invalidate a person's sessions (incl. unrecorded)",
  "set-global-read-only": "OPERATOR: freeze all writes platform-wide",
  "clear-global-read-only": "OPERATOR: thaw writes",
  "disable-ai": "OPERATOR: switch AI off platform-wide",
  "enable-ai": "OPERATOR: switch AI back on",
  "bump-global-epoch": "OPERATOR: sign out every session on the platform",
};

const NEEDS_USER = new Set(["suspend-user", "unsuspend-user", "revoke-all-user-sessions", "bump-user-epoch"]);
const NEEDS_SID = new Set(["revoke-session"]);

export function SecurityCentrePanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<string>("lockdown-tenant");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetSid, setTargetSid] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/security/overview", { cache: "no-store" });
      const body = (await response.json()) as Overview;
      if (!response.ok || !body.ok) throw new Error("overview failed");
      setOverview(body);
      setLoadError(null);
    } catch {
      setLoadError("Could not load the security overview.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/portal/security/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          reason,
          confirm,
          password,
          userId: NEEDS_USER.has(action) ? targetUserId : undefined,
          sid: NEEDS_SID.has(action) ? targetSid : undefined,
        }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string; detail?: string };
      if (!response.ok || !body.ok) {
        setOutcome(`Refused: ${body.detail ?? body.error ?? response.status}`);
      } else {
        setOutcome(`Done — ${ACTION_LABELS[action] ?? action}. Recorded permanently.`);
        setPassword("");
        setConfirm("");
        setReason("");
        await load();
      }
    } catch {
      setOutcome("The request did not complete. Check the record before retrying.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">{loadError}</p>;
  if (!overview) return <p className="p-4 text-sm text-slate-500">Loading security state…</p>;

  const lockActive = overview.switches.tenantLockdowns[overview.viewer.agencyId ?? ""];
  const visibleActions = Object.keys(ACTION_LABELS).filter(key =>
    overview.viewer.operator || !ACTION_LABELS[key]!.startsWith("OPERATOR:"),
  );

  return (
    <div className="space-y-8">
      {/* ── Switch positions ─────────────────────────────────────────────── */}
      <section aria-labelledby="switches-heading">
        <h2 id="switches-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Right now</h2>
        <ul className="grid gap-2 sm:grid-cols-3">
          <li className={`rounded border p-3 text-sm ${overview.switches.globalReadOnly ? "border-red-400 bg-red-50" : "border-slate-200"}`} data-switch="global-read-only">
            <strong>Writes:</strong> {overview.switches.globalReadOnly ? "FROZEN platform-wide" : "normal"}
          </li>
          <li className={`rounded border p-3 text-sm ${overview.switches.aiDisabled ? "border-red-400 bg-red-50" : "border-slate-200"}`} data-switch="ai">
            <strong>AI:</strong> {overview.switches.aiDisabled ? "OFF platform-wide" : "on"}
          </li>
          <li className={`rounded border p-3 text-sm ${lockActive ? "border-red-400 bg-red-50" : "border-slate-200"}`} data-switch="tenant-lockdown">
            <strong>This workspace:</strong> {lockActive ? `LOCKED (${lockActive.reason})` : "open"}
          </li>
        </ul>
      </section>

      {/* ── What the platform cannot see — as loud as incidents ──────────── */}
      <section aria-labelledby="posture-heading">
        <h2 id="posture-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Protection status — including what we cannot see</h2>
        <ul className="space-y-2">
          {overview.posture.map(item => (
            <li
              key={item.id}
              data-posture={item.id}
              data-status={item.status}
              className={`rounded border p-3 text-sm ${item.status === "blind" ? "border-amber-400 bg-amber-50" : item.status === "owner" ? "border-sky-300 bg-sky-50" : "border-slate-200"}`}
            >
              <span className="font-medium">{item.label}:</span>{" "}
              <span className={item.status === "blind" ? "font-semibold text-amber-800" : ""}>
                {item.status === "blind" ? "BLIND — " : item.status === "owner" ? "Needs you — " : ""}
                {item.detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Suspensions + sessions ───────────────────────────────────────── */}
      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">People and devices</h2>
        <p className="text-sm text-slate-600">
          {overview.sessions.active} signed-in device{overview.sessions.active === 1 ? "" : "s"} on record
          {overview.suspendedUsers.length > 0
            ? `; ${overview.suspendedUsers.length} suspended account${overview.suspendedUsers.length === 1 ? "" : "s"}`
            : "; nobody suspended"}.
        </p>
        {overview.suspendedUsers.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm">
            {overview.suspendedUsers.map(entry => (
              <li key={entry.userId} className="rounded border border-red-200 bg-red-50 p-2" data-suspended={entry.userId}>
                {entry.userId} — {entry.reason} (by {entry.actor})
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── Take an action ───────────────────────────────────────────────── */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Take an emergency action</h2>
        <form onSubmit={submit} className="space-y-3 rounded border border-slate-300 p-4">
          <label className="block text-sm">
            What to do
            <select value={action} onChange={event => setAction(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2" data-testid="security-action">
              {visibleActions.map(key => (
                <option key={key} value={key}>{ACTION_LABELS[key]}</option>
              ))}
            </select>
          </label>
          {NEEDS_USER.has(action) ? (
            <label className="block text-sm">
              Person's user id
              <input value={targetUserId} onChange={event => setTargetUserId(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2" data-testid="security-user-id" />
            </label>
          ) : null}
          {NEEDS_SID.has(action) ? (
            <label className="block text-sm">
              Device session id
              <input value={targetSid} onChange={event => setTargetSid(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2" data-testid="security-sid" />
            </label>
          ) : null}
          <label className="block text-sm">
            Why (goes in the permanent record)
            <input value={reason} onChange={event => setReason(event.target.value)} minLength={8} required className="mt-1 block w-full rounded border border-slate-300 p-2" data-testid="security-reason" />
          </label>
          <label className="block text-sm">
            Type <code className="rounded bg-slate-100 px-1">CONTAIN</code> to confirm
            <input value={confirm} onChange={event => setConfirm(event.target.value)} required className="mt-1 block w-full rounded border border-slate-300 p-2" data-testid="security-confirm" autoComplete="off" />
          </label>
          <label className="block text-sm">
            Your password (asked every time, on purpose)
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} required className="mt-1 block w-full rounded border border-slate-300 p-2" data-testid="security-password" autoComplete="current-password" />
          </label>
          <button type="submit" disabled={busy} className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="security-submit">
            {busy ? "Working…" : "Do it"}
          </button>
          {outcome ? <p className="text-sm" role="status" data-testid="security-outcome">{outcome}</p> : null}
        </form>
      </section>

      {/* ── The permanent record ─────────────────────────────────────────── */}
      <section aria-labelledby="record-heading">
        <h2 id="record-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Permanent record (latest first)</h2>
        {overview.durableActions.length === 0 ? (
          <p className="text-sm text-slate-500">No emergency actions have been taken.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {overview.durableActions.map(event => (
              <li key={event.id} className="rounded border border-slate-200 p-2" data-event-kind={event.kind}>
                <span className="font-mono text-xs text-slate-500">{new Date(event.at).toISOString()}</span>{" "}
                <span className={event.severity === "critical" ? "font-semibold text-red-700" : ""}>{event.kind}</span>
                {event.actor ? <span className="text-slate-600"> — {event.actor}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
