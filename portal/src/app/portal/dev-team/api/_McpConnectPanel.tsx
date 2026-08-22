"use client";

import { Check, Clipboard, Download, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildExternalAssistantSetupDocument,
  externalAssistantSetupFilename,
} from "@/lib/integrations/externalAssistantSetup";
import { formatUkDate } from "@/lib/shared/formatDateTime";

// "How to connect" for the MCP server — the half the Settings panel doesn't
// show. Everything here is DERIVED SERVER-SIDE from the live code (the
// handshake's own `initialize` result, and `listExternalAssistantMcpTools()`
// per key), then handed down as plain data. Nothing is hardcoded here, so this
// panel cannot drift from `externalAssistantMcp.ts`.

export interface McpToolView {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
}

export interface McpKeyView {
  id: string;
  name: string;
  tokenPrefix: string;
  fingerprint: string;
  status: "active" | "expired" | "revoked";
  modules: string[];
  permissions: string[];
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  /**
   * A live credential that is NOT a managed `aqa_` key — today that means the
   * legacy environment token. It authenticates exactly like a key, so it is
   * listed and counted like one, but nothing on this screen can revoke it.
   */
  unmanaged?: boolean;
  /** The live `tools/list` this exact key would receive. */
  tools: McpToolView[];
}

export interface McpConnectView {
  origin: string;
  apiBaseUrl: string;
  openApiUrl: string;
  mcpUrl: string;
  protocolVersion: string;
  supportedProtocolVersions: string[];
  serverName: string;
  serverTitle: string;
  serverVersion: string;
  instructions: string;
  workspace: string;
  keys: McpKeyView[];
}

const STATUS_TONE: Record<McpKeyView["status"], string> = {
  active: "bg-[color:var(--dev-success-soft)] text-[color:var(--dev-success)]",
  expired: "bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]",
  revoked: "bg-[color:var(--dt-hairline)] text-[color:var(--dt-muted)]",
};

export function McpConnectPanel({ view }: { view: McpConnectView }) {
  const firstActive = view.keys.find(key => key.status === "active") ?? view.keys[0];
  const [selectedId, setSelectedId] = useState(firstActive?.id ?? "");
  const [copied, setCopied] = useState("");

  const selected = useMemo(
    () => view.keys.find(key => key.id === selectedId) ?? firstActive,
    [view.keys, selectedId, firstActive],
  );

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1_500);
  }

  // The same document Settings offers — built for the SELECTED key's real
  // scope. No token: AquaCRM only stores the SHA-256 hash, so a token-bearing
  // file can only come from the create/rotate reveal above.
  function downloadSetup() {
    const document = buildExternalAssistantSetupDocument({
      assistantName: selected?.name ?? "My AquaCRM assistant",
      workspace: view.workspace,
      apiBaseUrl: view.apiBaseUrl,
      openApiUrl: view.openApiUrl,
      mcpUrl: view.mcpUrl,
      modules: selected?.modules ?? [],
      permissions: selected?.permissions ?? [],
    });
    const blob = new Blob([document], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = externalAssistantSetupFilename(selected?.name ?? "assistant");
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="MCP server URL" value={view.mcpUrl} onCopy={() => copy(view.mcpUrl, "mcp")} copied={copied === "mcp"} mono />
        <Field label="Transport" value="JSON-RPC 2.0 over HTTP POST (no SSE — GET returns 405)" />
        <Field
          label="Protocol version"
          value={view.protocolVersion}
          hint={`Also accepts ${view.supportedProtocolVersions.filter(v => v !== view.protocolVersion).join(", ")}`}
          mono
        />
        <Field label="Server identity" value={`${view.serverName} v${view.serverVersion}`} hint={view.serverTitle} mono />
        <Field
          label="Authentication"
          value="Authorization: Bearer <aqa_… key>"
          onCopy={() => copy("Authorization: Bearer YOUR_PRIVATE_TOKEN", "auth")}
          copied={copied === "auth"}
          mono
        />
        <Field label="OpenAPI (REST alternative)" value={view.openApiUrl} href={view.openApiUrl} onCopy={() => copy(view.openApiUrl, "openapi")} copied={copied === "openapi"} mono />
      </div>

      <details className="mt-4 rounded-xl border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)]">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-[color:var(--dt-muted)]">
          Server instructions sent to every client on connect
        </summary>
        <p className="border-t border-[color:var(--dt-line)] px-4 py-3 text-[11px] leading-5 text-[color:var(--dt-muted)]">{view.instructions}</p>
      </details>

      <div className="mt-5 border-t border-[color:var(--dt-line)] pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--dt-ink)]">What a key can actually do</h3>
            <p className="mt-0.5 text-xs text-[color:var(--dt-muted)]">
              The live <code className="text-[color:var(--dt-faint)]">tools/list</code> result for the selected key — computed from its own
              permissions and modules, not a written list.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {view.keys.length > 0 ? (
              <select
                value={selected?.id ?? ""}
                onChange={event => setSelectedId(event.target.value)}
                aria-label="Select an API key"
                className="h-9 rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-2.5 text-xs text-[color:var(--dt-ink)] outline-none focus:border-[color:var(--dev-accent)]"
              >
                {view.keys.map(key => (
                  <option key={key.id} value={key.id}>
                    {key.name}{key.status === "active" ? "" : ` (${key.status})`}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={downloadSetup}
              disabled={!selected}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[color:var(--dev-accent)] px-3 text-xs font-medium text-[color:var(--dev-on-accent)] transition-colors hover:bg-[color:var(--dev-accent-hover)] disabled:opacity-40"
            >
              <Download size={13} />
              Setup document
            </button>
          </div>
        </div>

        {!selected ? (
          <p className="mt-4 rounded-xl border border-dashed border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] px-4 py-6 text-center text-sm text-[color:var(--dt-faint)]">
            No keys yet. Generate one above, then come back to see exactly which MCP tools it exposes.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`rounded px-2 py-0.5 font-bold uppercase ${STATUS_TONE[selected.status]}`}>{selected.status}</span>
              <span className="font-mono text-[color:var(--dt-faint)]">{selected.tokenPrefix} · {selected.fingerprint}</span>
              <span className="text-[color:var(--dt-faint)]">
                Created {formatUkDate(selected.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                {selected.lastUsedAt
                  ? ` · Last used ${formatUkDate(selected.lastUsedAt, { day: "numeric", month: "short", year: "numeric" })}`
                  : " · Never used"}
                {selected.expiresAt
                  ? ` · Expires ${formatUkDate(selected.expiresAt, { day: "numeric", month: "short", year: "numeric" })}`
                  : " · No expiry"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {selected.permissions.map(permission => (
                <span key={permission} className="rounded-full bg-[color:var(--dev-accent-soft)] px-2 py-0.5 font-mono text-[10px] text-[color:var(--dev-accent)]">{permission}</span>
              ))}
              {selected.modules.map(module => (
                <span key={module} className="rounded-full bg-[color:var(--dt-hairline)] px-2 py-0.5 font-mono text-[10px] text-[color:var(--dt-muted)]">{module}</span>
              ))}
            </div>

            {selected.unmanaged ? (
              <p className="mt-3 rounded-lg bg-[color:var(--dev-warning-soft)] px-3 py-2 text-[11px] leading-5 text-[color:var(--dev-warning)]">
                This is the <strong>environment token</strong>, not a managed key — it is set in the server&apos;s
                environment and <strong>cannot be revoked from this screen</strong>. Revoking every managed key does
                not lock the workspace down while this is configured. Remove it from the environment and restart.
              </p>
            ) : null}
            {selected.status !== "active" ? (
              <p className="mt-3 rounded-lg bg-[color:var(--dev-hairline)] px-3 py-2 text-[11px] leading-5 text-[color:var(--dev-ink-muted)]">
                This key is <strong>{selected.status}</strong> — the tools below are what its scope <em>would</em>{" "}
                expose. Right now it grants nothing: every call with it is rejected at authentication, before any tool
                is reached.
              </p>
            ) : null}
            {selected.tools.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] px-4 py-6 text-center text-sm text-[color:var(--dt-faint)]">
                This key exposes no MCP tools — its permissions grant REST-only access (or it has been revoked).
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-[color:var(--dt-hairline)] rounded-xl border border-[color:var(--dt-line)]">
                {selected.tools.map(tool => (
                  <li key={tool.name} className="flex items-start gap-3 px-4 py-3">
                    <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]">
                      {tool.readOnly ? <ShieldCheck size={14} /> : <KeyRound size={14} />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs font-semibold text-[color:var(--dt-ink)]">{tool.name}</code>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tool.readOnly ? "bg-[color:var(--dev-success-soft)] text-[color:var(--dev-success)]" : "bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]"}`}>
                          {tool.readOnly ? "read-only" : "proposes only"}
                        </span>
                        <span className="text-[11px] text-[color:var(--dt-faint)]">{tool.title}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-[color:var(--dt-muted)]">{tool.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-[color:var(--dt-faint)]">
              The setup document is built for this key&apos;s exact scope but contains no token — AquaCRM stores only a SHA-256
              hash, so the plaintext is shown once at create/rotate and never again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, hint, href, onCopy, copied, mono = false }: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  onCopy?: () => void;
  copied?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--dt-faint)]">{label}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label}`} className="rounded p-1 text-[color:var(--dt-faint)] hover:bg-[color:var(--dt-hairline)] hover:text-[color:var(--dt-ink)]">
              <ExternalLink size={12} />
            </a>
          ) : null}
          {onCopy ? (
            <button type="button" onClick={onCopy} aria-label={`Copy ${label}`} className="rounded p-1 text-[color:var(--dt-faint)] hover:bg-[color:var(--dt-hairline)] hover:text-[color:var(--dt-ink)]">
              {copied ? <Check size={12} /> : <Clipboard size={12} />}
            </button>
          ) : null}
        </div>
      </div>
      <p className={`mt-1 truncate text-xs text-[color:var(--dt-ink)] ${mono ? "font-mono" : ""}`} title={value}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-[color:var(--dt-faint)]">{hint}</p> : null}
    </div>
  );
}
