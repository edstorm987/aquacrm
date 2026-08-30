"use client";

// API keys and the MCP endpoint, in Settings.
//
// Ed, 2026-08-29: *"the MCP stuff, API keys for the server to create one as
// well, all in here."*
//
// ── What was already here, and what was not ───────────────────────────────
//
// `ExternalAiConnectionPanel` — the thing that CREATES an `aqa_` key — was
// already mounted in Settings, inside "Setup & launch". So the capability
// existed and nobody could find it, which is the same shape as everything else
// this hub sweep has turned up. It gets its own section here.
//
// What was genuinely missing is the other half: having made a key, where do you
// point the thing that uses it. Dev Team → API answers that with a live
// protocol handshake against the running MCP server. That handshake is a
// network round trip and belongs in a diagnostics screen, not in Settings — so
// this shows the ENDPOINTS, derived from the origin you are already on, and
// leaves the negotiation where it is.

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export function ApiAccessPanel() {
  const [origin, setOrigin] = useState("");

  // Derived from where you are, not from configuration. A written-down base URL
  // is the thing that goes stale when a workspace moves domain — and it goes
  // stale silently, because the page still renders.
  useEffect(() => setOrigin(window.location.origin), []);

  const rows = origin
    ? [
        { label: "MCP endpoint", value: `${origin}/api/mcp`, detail: "Point an MCP client here, with your key as a bearer token." },
        { label: "REST base", value: `${origin}/api/v1`, detail: "The same key authenticates the REST API." },
        { label: "OpenAPI", value: `${origin}/api/v1/openapi.json`, detail: "The published specification." },
      ]
    : [];

  return (
    <div className="grid gap-8">
      <div>
        <h3 className="text-sm font-semibold text-black/80">Where to connect</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">
          Taken from the address you are on, so it is right for this deployment rather than a
          value someone wrote down once. For a live protocol handshake and the tool list, Dev
          Team → API runs the real negotiation.
        </p>
        <ul className="mt-3 grid gap-2">
          {rows.map(row => <CopyRow key={row.label} {...row} />)}
        </ul>
      </div>
    </div>
  );
}

function CopyRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="rounded-md border border-black/10 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-xs font-semibold text-black/75">{label}</strong>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }).catch(() => { /* clipboard blocked — the value is visible and selectable */ });
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/12 px-2 py-1 text-[11px] font-medium text-black/60 hover:bg-black/[0.03]"
        >
          {copied ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Selectable as well as copyable — a blocked clipboard must not make the
          value unreachable. */}
      <code className="mt-1 block break-all font-mono text-[11px] text-black/55">{value}</code>
      <p className="mt-1 text-[11px] leading-4 text-black/40">{detail}</p>
    </li>
  );
}
