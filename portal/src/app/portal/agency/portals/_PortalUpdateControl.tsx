"use client";

// The Update button.
//
// Ed's rule, 2026-08-27: "update button with changes and possible conflicts —
// in other words, in future as I update my services I can have legacy clients
// etc on older versions for whatever reason."
//
// Which shapes this component more than anything else:
//
//   • Being behind is NOT a warning. A client on an older version made — or was
//     given — a decision. The resting state says so plainly and offers a look,
//     never a nag, never a red badge.
//   • Nothing is applied until a person chooses. Opening the panel calls
//     `update-plan`, which writes nothing; only Apply sends anything back.
//   • A conflict is opt-IN. Clean changes start ticked because nobody has an
//     opinion about them; anything that would overwrite the client's own work
//     starts unticked, so the destructive default is "keep theirs".

import { useCallback, useId, useState } from "react";

interface PlanChange {
  path: string;
  base: unknown;
  incoming: unknown;
  current: unknown;
  status: "clean" | "conflict" | "already-matches";
}

interface Plan {
  templateName: string;
  fromVersionId: string;
  toVersionId: string;
  upToDate: boolean;
  baseKnown: boolean;
  changes: PlanChange[];
  conflicts: PlanChange[];
  clean: PlanChange[];
}

export interface PortalUpdateControlProps {
  clientId: string;
  clientName: string;
  /** Server-rendered resting summary, so the card says something before any fetch. */
  summary: string;
  onCurrentVersion: boolean;
  changeCount: number;
  conflictCount: number;
  /** `fulfilment.portals` manage — without it this is read-only. */
  canManage: boolean;
}

function preview(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 89)}…` : value || '""';
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return Array.isArray(value) ? `${value.length} item${value.length === 1 ? "" : "s"}` : "…";
}

/** `chrome.serviceLabel` → "Chrome · service label". */
function label(path: string): string {
  return path
    .split(".")
    .map(segment => segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase()).toLowerCase())
    .map((segment, index) => index === 0 ? segment.replace(/^./, c => c.toUpperCase()) : segment)
    .join(" · ");
}

export function PortalUpdateControl(props: PortalUpdateControlProps) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState("");
  const panelId = useId();

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/client-portal-design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-plan", scope: "client", clientId: props.clientId }),
      });
      const body = await response.json() as { ok?: boolean; plan?: Plan; error?: string };
      if (!response.ok || !body.ok || !body.plan) {
        setMessage(body.error || "That update could not be read.");
        return;
      }
      setPlan(body.plan);
      // Clean changes are pre-selected; a conflict must be chosen deliberately.
      setAccepted(new Set(body.plan.clean.map(change => change.path)));
    } catch {
      setMessage("That update could not be read.");
    } finally {
      setBusy(false);
    }
  }, [props.clientId]);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && !plan) await load();
  }, [load, open, plan]);

  const apply = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/client-portal-design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update-apply",
          scope: "client",
          clientId: props.clientId,
          accept: [...accepted],
        }),
      });
      const body = await response.json() as { ok?: boolean; accepted?: string[]; declined?: string[]; error?: string };
      if (!response.ok || !body.ok) {
        setMessage(body.error || "That update could not be applied.");
        return;
      }
      const took = body.accepted?.length ?? 0;
      const kept = body.declined?.length ?? 0;
      // Say exactly what happened, including that it is a draft: this has not
      // touched the client's live portal.
      setDone(took === 0
        ? `Nothing applied. ${props.clientName} stays on their current version.`
        : `${took} change${took === 1 ? "" : "s"} saved to the draft${kept > 0 ? `, ${kept} kept as-is` : ""}. Publish the portal to make it live.`);
      setPlan(null);
      setOpen(false);
    } catch {
      setMessage("That update could not be applied.");
    } finally {
      setBusy(false);
    }
  }, [accepted, props.clientId, props.clientName]);

  if (props.onCurrentVersion && !done) {
    return <p className="text-[11px] text-black/40">{props.summary}</p>;
  }

  return (
    <div className="mt-3 rounded-md border border-black/8 bg-black/[0.018] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/38">Template</p>
          <p className="mt-0.5 text-[11px] text-black/55">{done || props.summary}</p>
        </div>
        {done ? null : (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="min-h-9 rounded-md border border-black/12 px-3 text-[11px] font-semibold text-black/70 hover:bg-black/5"
          >
            {open ? "Close" : props.canManage ? "Review update" : "See what changed"}
          </button>
        )}
      </div>

      {open ? (
        <div id={panelId} className="mt-3 border-t border-black/8 pt-3">
          {busy && !plan ? <p className="text-[11px] text-black/45">Reading the template…</p> : null}
          {message ? <p role="alert" className="text-[11px] text-rose-700">{message}</p> : null}

          {plan ? (
            <>
              {!plan.baseKnown ? (
                <p className="mb-2 text-[11px] text-amber-800">
                  The version {props.clientName} was set up from is no longer kept, so we cannot tell
                  which of these they changed themselves. Each one needs your decision.
                </p>
              ) : null}

              <ul className="space-y-1.5">
                {plan.changes.filter(change => change.status !== "already-matches").map(change => {
                  const isConflict = change.status === "conflict";
                  return (
                    <li key={change.path}>
                      <label className="flex items-start gap-2 rounded-md p-1.5 hover:bg-black/[0.03]">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0"
                          checked={accepted.has(change.path)}
                          disabled={!props.canManage || busy}
                          onChange={event => setAccepted(previous => {
                            const next = new Set(previous);
                            if (event.target.checked) next.add(change.path);
                            else next.delete(change.path);
                            return next;
                          })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-black/70">{label(change.path)}</span>
                            {isConflict ? (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                                Would replace their edit
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-4 text-black/45">
                            {isConflict ? `Theirs: ${preview(change.current)} → ` : "Now: "}
                            {preview(change.incoming)}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {props.canManage ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={apply}
                    disabled={busy}
                    className="min-h-9 rounded-md bg-black/85 px-3 text-[11px] font-semibold text-white hover:bg-black disabled:opacity-40"
                  >
                    {accepted.size === 0 ? "Keep everything as it is" : `Apply ${accepted.size} to the draft`}
                  </button>
                  <p className="text-[10px] text-black/40">
                    Saved as a draft. {props.clientName}&rsquo;s live portal does not change until you publish it.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-[10px] text-black/40">
                  You can see what changed. Applying it needs portal management access.
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
