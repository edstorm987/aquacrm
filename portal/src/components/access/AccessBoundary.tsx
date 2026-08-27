"use client";

import { LockKeyhole, Send } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import {
  capabilityImplies,
  elementAccessLevel,
  elementCapability,
  type AccessEnvironment,
  type AccessScope,
  type ElementAccessLevel,
} from "./accessModel";

type DeniedPresentation = "hidden" | "readonly" | "request";

interface AccessBoundaryProps {
  capabilities: readonly string[];
  capability: string;
  children: ReactNode;
  denied?: DeniedPresentation;
  readOnly?: ReactNode;
  request?: {
    scope: AccessScope;
    environment: AccessEnvironment;
    title: string;
    detail?: string;
  };
}

/**
 * A client rendering convenience, never an authorisation boundary. Every API
 * reached by the children must enforce the same capability on the server.
 */
export function AccessBoundary({ capabilities, capability, children, denied = "hidden", readOnly, request }: AccessBoundaryProps) {
  if (capabilityImplies(capabilities, capability)) return <>{children}</>;
  if (denied === "hidden") return null;
  if (denied === "readonly") {
    if (readOnly !== undefined) return <>{readOnly}</>;
    return (
      <div data-access-state="readonly" aria-disabled="true" inert className="pointer-events-none select-none opacity-60">
        {children}
      </div>
    );
  }
  if (!request) return null;
  return <RequestAccessCallout capability={capability} {...request} />;
}

interface WorkspaceElementBoundaryProps {
  capabilities: readonly string[];
  elementKey: string;
  required?: Exclude<ElementAccessLevel, "hidden">;
  children: ReactNode;
  denied?: DeniedPresentation;
  readOnly?: ReactNode;
  request?: {
    scope: AccessScope;
    environment: AccessEnvironment;
    title: string;
    detail?: string;
  };
}

export function WorkspaceElementBoundary({
  capabilities,
  elementKey,
  required = "view",
  children,
  denied = "hidden",
  readOnly,
  request,
}: WorkspaceElementBoundaryProps) {
  const available = elementAccessLevel(capabilities, elementKey);
  const rank: Record<ElementAccessLevel, number> = { hidden: 0, view: 1, use: 2, manage: 3 };
  if (rank[available] >= rank[required]) return <>{children}</>;

  // Someone with View may still see the real read-only representation when a
  // Use or Manage control is withheld. Someone with no element access receives
  // the selected hidden/request presentation instead.
  if (available === "view" && required !== "view") {
    if (readOnly !== undefined) return <>{readOnly}</>;
    return (
      <div data-access-state="readonly" aria-disabled="true" inert className="pointer-events-none select-none opacity-60">
        {children}
      </div>
    );
  }

  return (
    <AccessBoundary
      capabilities={capabilities}
      capability={elementCapability(elementKey, required)}
      denied={denied}
      readOnly={readOnly}
      request={request}
    >
      {children}
    </AccessBoundary>
  );
}

function RequestAccessCallout({
  capability,
  scope,
  environment,
  title,
  detail,
}: {
  capability: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  title: string;
  detail?: string;
}) {
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/access/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          environment,
          capabilities: [capability],
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Access could not be requested.");
      setMessage("Request sent for review.");
      setReason("");
      setOpen(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Access could not be requested.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-access-state="requestable" className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-amber-800 shadow-sm"><LockKeyhole size={16} /></span>
          <div>
            <h3 className="text-sm font-semibold text-amber-950">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-amber-950/65">{detail ?? "This element is not included in your current role. You can send an exact request to an authorised reviewer."}</p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-950 outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
          {open ? "Close request" : "Request access"}
        </button>
      </div>
      {open ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-amber-200 pt-4">
          <label htmlFor={reasonId} className="text-xs font-semibold text-amber-950">Why do you need this?</label>
          <textarea id={reasonId} required minLength={8} rows={3} value={reason} onChange={event => setReason(event.target.value)} className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-black outline-none focus-visible:ring-2 focus-visible:ring-amber-700" />
          <button disabled={busy} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-900 px-4 text-sm font-semibold text-white outline-none hover:bg-amber-800 focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 disabled:opacity-60 sm:w-fit">
            <Send size={14} /> {busy ? "Sending…" : "Send request"}
          </button>
        </form>
      ) : null}
      {message ? <p role={message.startsWith("Request sent") ? "status" : "alert"} className="mt-3 text-xs font-medium text-amber-950">{message}</p> : null}
    </section>
  );
}
