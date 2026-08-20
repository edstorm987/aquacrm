"use client";

import { useState } from "react";
import { Activity, Check, Copy, Link2, Plug, RotateCw, ShieldCheck, Trash2 } from "lucide-react";

import type { PortalConnectionView } from "@/server/portalConnectionStore";
import { formatUkDate } from "@/lib/shared/formatDateTime";

/**
 * Connecting a client's own software to their portal, from Ed's side.
 *
 * The whole job is: name the software, get a link, send it. What makes that
 * worth a screen rather than a button is the state afterwards — a link sent
 * three weeks ago that nobody used looks exactly like one sent yesterday
 * unless something says so, and an expired link fails silently at the client's
 * end, where Ed never sees it.
 *
 * The link is not a credential and carries nothing secret, which is why it can
 * be copied into an email without ceremony. Said on the screen because the
 * opposite assumption is the reasonable one.
 */

function formatDay(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "";
  return formatUkDate(ts, { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(ts: number): number {
  return Math.ceil((ts - Date.now()) / 86_400_000);
}

export function ClientPortalConnections({
  clientId,
  clientName,
  initialConnections,
  suggestions,
}: {
  clientId: string;
  clientName: string;
  initialConnections: PortalConnectionView[];
  /** Software Aqua already knows about, so this is never a blank form. */
  suggestions: string[];
}) {
  const [connections, setConnections] = useState(initialConnections);
  // Prefilled rather than empty: Aqua usually knows what the client runs, and
  // a guess Ed corrects beats a box he has to think about.
  const [label, setLabel] = useState(suggestions[0] ?? `${clientName} app`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const live = connections.filter(entry => entry.status !== "revoked");
  const withdrawn = connections.filter(entry => entry.status === "revoked");

  async function open(name: string) {
    if (!name.trim()) {
      setError("Give the software a name so this connection can be told from the others.");
      return;
    }
    setBusy("open");
    setError(null);
    try {
      const response = await fetch("/api/portal/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "open", clientId, label: name }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; connection?: PortalConnectionView };
      if (!response.ok || !payload.ok || !payload.connection) {
        throw new Error(payload.error ?? "That link could not be created.");
      }
      setConnections(current => [payload.connection!, ...current]);
      setLabel("");
      // Copied straight away — the reason for making a link is to send it, and
      // the extra click was only ever a chance to forget. Quietly, though: the
      // link is on screen with a button beside it, so a convenience that did
      // not fire is not worth a red message under a link that worked.
      await copy(payload.connection, { quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That link could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(connection: PortalConnectionView) {
    setBusy(connection.id);
    setError(null);
    try {
      const response = await fetch("/api/portal/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "withdraw", connectionId: connection.id }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; connection?: PortalConnectionView };
      if (!response.ok || !payload.ok || !payload.connection) {
        throw new Error(payload.error ?? "That connection could not be withdrawn.");
      }
      setConnections(current => current.map(entry => entry.id === payload.connection!.id ? payload.connection! : entry));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That connection could not be withdrawn.");
    } finally {
      setBusy(null);
    }
  }

  async function reset(connection: PortalConnectionView) {
    setBusy(connection.id);
    setError(null);
    try {
      const response = await fetch("/api/portal/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset", connectionId: connection.id }),
      });
      const payload = await response.json() as {
        ok: boolean; error?: string;
        connection?: PortalConnectionView; withdrawn?: PortalConnectionView;
      };
      if (!response.ok || !payload.ok || !payload.connection || !payload.withdrawn) {
        throw new Error(payload.error ?? "That link could not be reset.");
      }
      // The old one becomes withdrawn history, the fresh one takes its place at
      // the top; both land in one update so the list never blinks empty.
      setConnections(current => [
        payload.connection!,
        ...current.map(entry => entry.id === payload.withdrawn!.id ? payload.withdrawn! : entry),
      ]);
      await copy(payload.connection, { quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That link could not be reset.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(connection: PortalConnectionView) {
    setBusy(connection.id);
    setError(null);
    try {
      const response = await fetch("/api/portal/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", connectionId: connection.id }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; deletedId?: string };
      if (!response.ok || !payload.ok || !payload.deletedId) {
        throw new Error(payload.error ?? "That connection could not be deleted.");
      }
      setConnections(current => current.filter(entry => entry.id !== payload.deletedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That connection could not be deleted.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(connection: PortalConnectionView, options: { quiet?: boolean } = {}) {
    try {
      await navigator.clipboard.writeText(connection.url);
      setCopied(connection.id);
      window.setTimeout(() => setCopied(current => current === connection.id ? null : current), 2_500);
    } catch {
      // Refused outside a secure context, or while the window is not focused.
      // Only worth saying when somebody asked for it — the link is on screen
      // in a field that selects on focus, so there is still a way.
      if (!options.quiet) setError("Copying was blocked. Select the link and copy it manually.");
    }
  }

  return (
    <section className="rounded-md border border-black/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Connected software</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            Put an <strong className="font-semibold text-black/75">Aqua</strong> link in {clientName}&rsquo;s own
            software and it opens their portal. They sign into Aqua once, from their side — nothing secret passes
            between the two systems, so the link below is safe to email.
          </p>
        </div>
        {live.length > 0 ? (
          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">
            {live.filter(entry => entry.status === "active").length} connected
          </span>
        ) : null}
      </div>

      <form
        onSubmit={event => { event.preventDefault(); void open(label); }}
        className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
      >
        <div>
          <label htmlFor="portal-connection-label" className="sr-only">What is being connected</label>
          <input
            id="portal-connection-label"
            value={label}
            onChange={event => setLabel(event.target.value)}
            placeholder={`${clientName} booking app`}
            maxLength={160}
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
          />
          {suggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-black/40">Aqua knows about</span>
              {suggestions.map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setLabel(suggestion)}
                  className="rounded-full border border-black/12 bg-white px-2.5 py-1 text-[11px] font-medium text-black/65 hover:bg-black/[0.04]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={busy === "open" || !label.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-50"
        >
          <Link2 size={14} aria-hidden />
          {busy === "open" ? "Creating..." : "Create link"}
        </button>
      </form>

      {error ? <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {live.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-black/12 bg-black/[0.02] px-3 py-4 text-sm leading-6 text-black/55">
          Nothing is connected yet. Create a link, send it to {clientName}, and the sidebar item in their software
          starts working the moment they accept it.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {live.map(connection => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              busy={busy === connection.id}
              copied={copied === connection.id}
              onCopy={() => void copy(connection)}
              onWithdraw={() => void withdraw(connection)}
              onReset={() => void reset(connection)}
              onDelete={() => void remove(connection)}
            />
          ))}
        </ul>
      )}

      {withdrawn.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-black/50">
            {withdrawn.length} withdrawn
          </summary>
          {/* Kept rather than deleted: who connected what, and when it was
              withdrawn, is exactly the history somebody needs afterwards. */}
          <ul className="mt-2 grid gap-1.5">
            {withdrawn.map(connection => (
              <li key={connection.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/[0.02] px-3 py-2 text-xs text-black/45">
                <span className="font-medium text-black/60">{connection.label}</span>
                <span className="flex items-center gap-2">
                  <span>
                    Withdrawn {formatDay(connection.revokedAt)}
                    {connection.connectedUserEmail ? ` · was connected by ${connection.connectedUserEmail}` : ""}
                  </span>
                  {/* History is worth keeping, but a wrong link is just clutter.
                      Deleting a withdrawn one removes the row for good. */}
                  <button
                    type="button"
                    disabled={busy === connection.id}
                    onClick={() => void remove(connection)}
                    aria-label={`Delete ${connection.label} for good`}
                    className="rounded-md p-1 text-black/35 hover:bg-black/5 hover:text-black/60 disabled:opacity-45"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function ConnectionRow({
  connection,
  busy,
  copied,
  onCopy,
  onWithdraw,
  onReset,
  onDelete,
}: {
  connection: PortalConnectionView;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onWithdraw: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const active = connection.status === "active";
  const expired = !active && connection.expiresAt !== undefined && connection.expiresAt <= Date.now();
  // The heartbeat sets this from the connected software; until then it is the
  // moment of consent, and reporting that as "last seen" would be a fiction.
  const seen = connection.lastSeenAt && connection.connectedAt
    && connection.lastSeenAt - connection.connectedAt > 60_000
    ? connection.lastSeenAt
    : undefined;

  return (
    <li className="rounded-md border border-black/10 bg-black/[0.02] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-white text-black/45">
            {active ? <ShieldCheck size={14} aria-hidden /> : <Plug size={14} aria-hidden />}
          </span>
          <span className="text-sm font-semibold text-black/85">{connection.label}</span>
          <span className={[
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            active ? "bg-emerald-50 text-emerald-800" : expired ? "bg-black/[0.06] text-black/50" : "bg-amber-50 text-amber-800",
          ].join(" ")}>
            {active ? "connected" : expired ? "link expired" : "not connected yet"}
          </span>
        </div>
        <span className="text-[11px] text-black/45">
          {active
            ? `Connected ${formatDay(connection.connectedAt)}${connection.connectedUserEmail ? ` by ${connection.connectedUserEmail}` : ""}`
            : `Created ${formatDay(connection.createdAt)}`}
        </span>
      </div>

      {active ? (
        <div className="mt-2 grid gap-1.5">
          <p className="text-xs leading-5 text-black/55">
            Their software can open the portal without signing in again.
          </p>
          {/* Health, the technical read Ed wanted: is it actually being used,
              and when did it last report. `uses` is absent until the Aqua Tag
              heartbeat exists, so this says "not measured" rather than "0" —
              the two are not the same, and showing zero would read as broken. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-black/45">
            <span className="inline-flex items-center gap-1">
              <Activity size={12} aria-hidden />
              {connection.uses === undefined
                ? "Usage not measured yet"
                : `Used ${connection.uses} time${connection.uses === 1 ? "" : "s"}`}
            </span>
            <span>{seen ? `Last reported ${formatDay(seen)}` : "No report since connecting"}</span>
          </div>
        </div>
      ) : expired ? (
        <p className="mt-2 text-xs leading-5 text-black/55">
          {/* Said plainly because this fails at the client's end, where Ed
              never sees it — the link simply stops working. */}
          This link was never used and has stopped working. A new one works straight away.
        </p>
      ) : (
        <div className="mt-2 grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={connection.url}
              aria-label={`Connection link for ${connection.label}`}
              onFocus={event => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 py-2 font-mono text-[11px] text-black/65"
            />
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-white px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.04]"
            >
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="text-[11px] text-black/45">
            Waiting for {connection.label}. Expires in {connection.expiresAt ? daysUntil(connection.expiresAt) : 7} days
            if nobody uses it.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Reset only on a link that has not connected — pending or expired.
            On a live connection it would silently revoke a working link and
            force the customer to consent again, which is what Disconnect is
            for; offering it here invites breaking something by accident. */}
        {!active ? (
          <button
            type="button"
            disabled={busy}
            onClick={onReset}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-45",
              expired ? "bg-black text-white" : "border border-black/12 bg-white text-black/70 hover:bg-black/[0.04]",
            ].join(" ")}
          >
            <RotateCw size={13} aria-hidden />
            {busy ? "Working..." : expired ? "New link" : "Reset link"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onWithdraw}
          className="rounded-md border border-black/12 bg-white px-3 py-1.5 text-xs font-medium text-black/65 disabled:opacity-45"
        >
          {active ? "Disconnect" : "Withdraw"}
        </button>
        {/* Delete sits apart and quiet — the deliberate, unrecoverable choice,
            not something to hit by reaching for Disconnect. */}
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          aria-label={`Delete ${connection.label} for good`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-black/40 hover:bg-red-50 hover:text-red-700 disabled:opacity-45"
        >
          <Trash2 size={13} aria-hidden />
          Delete
        </button>
      </div>
    </li>
  );
}
