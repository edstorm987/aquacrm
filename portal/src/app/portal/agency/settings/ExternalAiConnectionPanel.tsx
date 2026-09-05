"use client";

import {
  Check,
  Clipboard,
  Download,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import {
  buildExternalAssistantSetupDocument,
  buildExternalAssistantSetupPrompt,
  externalAssistantSetupFilename,
} from "@/lib/integrations/externalAssistantSetup";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

interface ApiKeySummary {
  id: string;
  name: string;
  tokenPrefix: string;
  fingerprint: string;
  modules: string[];
  permissions: string[];
  createdAt: number;
  createdBy: string;
  expiresAt?: number;
  lastUsedAt?: number;
  revokedAt?: number;
  status: "active" | "expired" | "revoked";
}

interface ConnectionStatus {
  ready: boolean;
  readOnly: boolean;
  mcpReady: boolean;
  advisorPeerReady: boolean;
  tokenConfigured: boolean;
  tokenStrongEnough: boolean;
  tokenFingerprint: string | null;
  agencyId: string;
  agencyExists: boolean;
  agencyMatchesWorkspace: boolean;
  modules: string[];
  permissions: string[];
  activeKeyCount: number;
  legacyKeyConfigured: boolean;
  legacyKeyReady: boolean;
  keys: ApiKeySummary[];
}

const PERMISSION_LABELS: Record<string, { label: string; detail: string }> = {
  "advisor:read": { label: "Advisor peer", detail: "Scoped health, Radar, alerts, recommendations and task context." },
  "actions:propose": { label: "Propose actions", detail: "Submit evidence-backed work into the approval inbox. Cannot create or alter tasks directly." },
  "context:read": { label: "Business overview", detail: "Company context, totals and attention items." },
  "records:read": { label: "Read records", detail: "List and inspect permitted records." },
  "search:read": { label: "Search", detail: "Search across permitted modules." },
  "export:read": { label: "Export", detail: "Download permitted data as JSON or CSV." },
};

const MODULE_LABELS: Record<string, string> = {
  clients: "Clients",
  contacts: "Contacts",
  staff: "Staff",
  leads: "Leads",
  pipelines: "Pipelines",
  tasks: "Actions",
  sops: "SOPs",
  products: "Products",
  milestones: "Milestones",
  "client-care": "Client care",
  company: "Company",
  legal: "Legal",
  finance: "Finance",
  activity: "Activity log",
  "business-modules": "Business modules",
};

export function ExternalAiConnectionPanel() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("Checking connection...");
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ token: string; key: ApiKeySummary } | null>(null);
  // Modal keyboard contract: the one-time key stays trapped until it is dismissed, and focus returns to the key list.
  const revealDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(revealDialogRef, revealed !== null, { onEscape: () => setRevealed(null) });
  // Modal keyboard contract: focus enters the key form, Tab stays inside it, Escape backs out (except mid-generate), focus returns to the button that opened it.
  const createDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(createDialogRef, createOpen, { onEscape: creating ? undefined : () => setCreateOpen(false) });
  const [name, setName] = useState("My AI assistant");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  useEffect(() => {
    setOrigin(window.location.origin);
    void loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const response = await fetch("/api/portal/settings/external-ai", { cache: "no-store" });
      const json = await response.json() as { ok?: boolean; connection?: ConnectionStatus; error?: string };
      if (!response.ok || !json.connection) throw new Error(json.error || "Could not inspect the connection.");
      applyConnection(json.connection);
      setStatus(json.connection.ready ? "External AI access is ready." : "Create your first private key to connect an assistant.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not inspect the connection.");
    }
  }

  function applyConnection(next: ConnectionStatus) {
    setConnection(next);
    setSelectedModules(current => current.length ? current : [...next.modules]);
    setSelectedPermissions(current => current.length ? current : [...next.permissions]);
  }

  async function testConnection() {
    setTesting(true);
    setStatus("Testing live data access...");
    try {
      const response = await fetch("/api/portal/settings/external-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const json = await response.json() as {
        ok?: boolean;
        error?: string;
        connection?: ConnectionStatus;
        recordCount?: number;
        moduleCount?: number;
      };
      if (json.connection) applyConnection(json.connection);
      if (!response.ok || !json.ok) throw new Error(json.error || "The connection test failed.");
      setStatus(`MCP and REST are ready. ${json.recordCount ?? 0} records are available across ${json.moduleCount ?? 0} modules.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function createKey() {
    setCreating(true);
    setStatus("Generating private key...");
    try {
      const response = await fetch("/api/portal/settings/external-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          expiresInDays,
          modules: selectedModules,
          permissions: selectedPermissions,
        }),
      });
      const json = await response.json() as {
        ok?: boolean;
        error?: string;
        token?: string;
        key?: ApiKeySummary;
        connection?: ConnectionStatus;
      };
      if (!response.ok || !json.ok || !json.token || !json.key) {
        throw new Error(json.error || "The key could not be created.");
      }
      if (json.connection) applyConnection(json.connection);
      setCreateOpen(false);
      setRevealed({ token: json.token, key: json.key });
      setStatus(`Created ${json.key.name}. Copy the private token now.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The key could not be created.");
    } finally {
      setCreating(false);
    }
  }

  async function rotateKey(key: ApiKeySummary) {
    if (!window.confirm(`Rotate “${key.name}”? The existing token will stop working immediately.`)) return;
    setStatus(`Rotating ${key.name}...`);
    try {
      const response = await fetch("/api/portal/settings/external-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rotate", keyId: key.id }),
      });
      const json = await response.json() as {
        ok?: boolean;
        error?: string;
        token?: string;
        key?: ApiKeySummary;
        connection?: ConnectionStatus;
      };
      if (!response.ok || !json.ok || !json.token || !json.key) {
        throw new Error(json.error || "The key could not be rotated.");
      }
      if (json.connection) applyConnection(json.connection);
      setRevealed({ token: json.token, key: json.key });
      setStatus("Key rotated. Update your assistant with the new token now.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The key could not be rotated.");
    }
  }

  async function revokeKey(key: ApiKeySummary) {
    if (!window.confirm(`Revoke “${key.name}”? Any assistant using it will lose access immediately.`)) return;
    setStatus(`Revoking ${key.name}...`);
    try {
      const response = await fetch(`/api/portal/settings/external-ai?keyId=${encodeURIComponent(key.id)}`, {
        method: "DELETE",
      });
      const json = await response.json() as { ok?: boolean; error?: string; connection?: ConnectionStatus };
      if (!response.ok || !json.ok) throw new Error(json.error || "The key could not be revoked.");
      if (json.connection) applyConnection(json.connection);
      setStatus(`${key.name} was revoked.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The key could not be revoked.");
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1_500);
  }

  function setupOptions(token?: string, key?: ApiKeySummary) {
    return {
      assistantName: key?.name ?? "My AquaCRM assistant",
      workspace: connection?.agencyId || "milesymedia",
      apiBaseUrl: baseUrl,
      openApiUrl,
      mcpUrl,
      modules: key?.modules ?? connection?.modules ?? [],
      permissions: key?.permissions ?? connection?.permissions ?? [],
      token,
    };
  }

  function downloadSetupDocument(token?: string, key?: ApiKeySummary) {
    const options = setupOptions(token, key);
    const document = buildExternalAssistantSetupDocument(options);
    const blob = new Blob([document], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = externalAssistantSetupFilename(options.assistantName);
    link.click();
    URL.revokeObjectURL(url);
    setStatus(token
      ? "Downloaded the complete setup file. Store it securely because it contains the private token."
      : "Downloaded the setup guide. Add a managed key when configuring authentication.");
  }

  function toggleModule(module: string) {
    setSelectedModules(current => current.includes(module)
      ? current.filter(item => item !== module)
      : [...current, module]);
  }

  function togglePermission(permission: string) {
    setSelectedPermissions(current => current.includes(permission)
      ? current.filter(item => item !== permission)
      : [...current, permission]);
  }

  const baseUrl = `${origin}/api/v1`;
  const openApiUrl = `${origin}/api/v1/openapi.json`;
  const mcpUrl = `${origin}/api/mcp`;
  const activeKeys = connection?.keys.filter(key => key.status === "active") ?? [];
  const inactiveKeys = connection?.keys.filter(key => key.status !== "active") ?? [];
  const setupPrompt = buildExternalAssistantSetupPrompt(setupOptions());

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${connection?.ready ? "bg-emerald-500" : "bg-amber-500"}`} />
            <h3 className="text-sm font-semibold text-black/85">External AI data access</h3>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">
            Give trusted assistants private Advisor-grade access through MCP or REST. Every assistant has its own read-only scope, credential, audit trail, and kill switch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={testConnection} disabled={testing || !connection?.ready} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black/70 disabled:opacity-40">
            <RefreshCw size={14} className={testing ? "animate-spin" : ""} />
            Test
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white">
            <Plus size={15} />
            Generate key
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusItem label="Active keys" ready={activeKeys.length > 0} detail={`${activeKeys.length} managed key${activeKeys.length === 1 ? "" : "s"}`} />
        <StatusItem label="Workspace scope" ready={Boolean(connection?.agencyExists)} detail={connection?.agencyId || "Checking..."} />
        <StatusItem label="MCP + REST" ready={Boolean(connection?.mcpReady)} detail="One key · both transports" />
        <StatusItem label="Advisor peer" ready={Boolean(connection?.advisorPeerReady)} detail="Scoped Radar and recommendations" />
      </div>

      <div className="mt-5 divide-y divide-black/10 border-y border-black/10">
        <ConnectionValue label="API base URL" value={baseUrl} onCopy={() => copy(baseUrl, "base")} copied={copied === "base"} />
        <ConnectionValue label="OpenAPI schema" value={openApiUrl} onCopy={() => copy(openApiUrl, "schema")} copied={copied === "schema"} link />
        <ConnectionValue label="MCP server" value={mcpUrl} onCopy={() => copy(mcpUrl, "mcp")} copied={copied === "mcp"} />
        <ConnectionValue label="Authentication" value="Authorization: Bearer YOUR_PRIVATE_TOKEN" onCopy={() => copy("Authorization: Bearer YOUR_PRIVATE_TOKEN", "auth")} copied={copied === "auth"} />
      </div>

      <section className="mt-6 border-y border-black/10 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Assistant setup</p>
            <h4 className="mt-1 text-sm font-semibold text-black/80">Give your AI the complete operating brief</h4>
            <p className="mt-1 text-xs leading-5 text-black/45">
              Download the safe guide now, or generate a key to download a ready-to-connect version containing that key once.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => copy(setupPrompt, "prompt")} disabled={!origin || !connection} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black/65 disabled:opacity-40">
              {copied === "prompt" ? <Check size={14} /> : <Clipboard size={14} />}
              {copied === "prompt" ? "Prompt copied" : "Copy setup prompt"}
            </button>
            <button type="button" onClick={() => downloadSetupDocument()} disabled={!origin || !connection} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40">
              <Download size={15} />
              Download setup guide
            </button>
          </div>
        </div>
        <details className="mt-4 rounded-md border border-black/10 bg-black/[0.015]">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-black/60">Preview the setup prompt</summary>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-black/10 px-4 py-4 text-[11px] leading-5 text-black/55">{setupPrompt}</pre>
        </details>
        <p className="mt-3 text-[11px] leading-4 text-black/40">
          MCP clients connect directly to the server above. OpenAPI assistants can import the schema instead. Both use the same independently revocable bearer key.
        </p>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-black/80">Private keys</h4>
            <p className="mt-1 text-xs leading-5 text-black/45">Use a separate key for each assistant or integration.</p>
          </div>
          <span className="text-xs font-medium text-black/40">{activeKeys.length} active</span>
        </div>

        <div className="mt-3 grid gap-2">
          {activeKeys.length === 0 ? (
            <button type="button" onClick={() => setCreateOpen(true)} className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-black/15 bg-black/[0.015] px-4 text-sm font-semibold text-black/55 hover:bg-black/[0.03]">
              <KeyRound size={17} />
              Generate your first key
            </button>
          ) : activeKeys.map(key => (
            <KeyRow key={key.id} apiKey={key} onRotate={() => rotateKey(key)} onRevoke={() => revokeKey(key)} />
          ))}
        </div>

        {inactiveKeys.length > 0 ? (
          <details className="mt-3 rounded-lg border border-black/10 bg-black/[0.015]">
            <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-black/55">
              Revoked and expired keys ({inactiveKeys.length})
            </summary>
            <div className="divide-y divide-black/10 border-t border-black/10">
              {inactiveKeys.map(key => <KeyRow key={key.id} apiKey={key} />)}
            </div>
          </details>
        ) : null}
      </section>

      {connection?.legacyKeyConfigured ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900/75">
          An environment key is still configured. Managed keys work alongside it; remove <code className="font-mono">AQUACRM_ASSISTANT_API_TOKEN</code> (or its legacy alias) from <a href="https://vercel.com/edstorm987-1130s-projects/aquacrm/settings/environment-variables" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Vercel environment variables</a> when every assistant has moved to its own managed key.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-black/50">{status}</p>
        <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-800">
          <ShieldCheck size={14} />
          {connection?.modules.length ?? 0} available data modules
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6" role="dialog" ref={createDialogRef} aria-modal="true" aria-labelledby="create-api-key-title">
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="create-api-key-title" className="text-lg font-semibold text-black/90">Generate private key</h3>
                <p className="mt-1 text-sm leading-6 text-black/50">Name the assistant, grant Advisor peer or narrower data access, then copy its MCP/REST token once.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-md p-2 text-black/45 hover:bg-black/[0.05]" aria-label="Close"><X size={18} /></button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-black/65">Key name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} className="mt-2 h-11 w-full rounded-md border border-black/15 px-3 text-sm font-normal outline-none focus:border-black/40" placeholder="Claude business assistant" /></label>
              <label className="text-xs font-semibold text-black/65">Expires<select value={expiresInDays ?? "never"} onChange={event => setExpiresInDays(event.target.value === "never" ? null : Number(event.target.value))} className="mt-2 h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-normal outline-none focus:border-black/40"><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option><option value="never">Never</option></select></label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-xs font-semibold text-black/65">Allowed actions</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(connection?.permissions ?? []).map(permission => (
                  <label key={permission} className="flex cursor-pointer items-start gap-3 rounded-md border border-black/10 p-3 hover:bg-black/[0.02]">
                    <input type="checkbox" checked={selectedPermissions.includes(permission)} onChange={() => togglePermission(permission)} className="mt-0.5" />
                    <span><strong className="block text-xs font-semibold text-black/70">{PERMISSION_LABELS[permission]?.label ?? permission}</strong><span className="mt-0.5 block text-[11px] leading-4 text-black/45">{PERMISSION_LABELS[permission]?.detail}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-xs font-semibold text-black/65">Data modules</legend>
                <button type="button" onClick={() => setSelectedModules(selectedModules.length === connection?.modules.length ? [] : [...(connection?.modules ?? [])])} className="text-xs font-semibold text-black/50 underline underline-offset-2">
                  {selectedModules.length === connection?.modules.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {(connection?.modules ?? []).map(module => (
                  <label key={module} className="flex cursor-pointer items-center gap-2 py-1 text-xs text-black/65">
                    <input type="checkbox" checked={selectedModules.includes(module)} onChange={() => toggleModule(module)} />
                    {MODULE_LABELS[module] ?? module}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-black/10 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setCreateOpen(false)} className="min-h-11 rounded-md px-4 text-sm font-semibold text-black/55">Cancel</button>
              <button type="button" onClick={createKey} disabled={creating || name.trim().length < 2 || selectedModules.length === 0 || selectedPermissions.length === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-black px-5 text-sm font-semibold text-white disabled:opacity-40">
                <KeyRound size={15} />
                {creating ? "Generating..." : "Generate key"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revealed ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-6" role="dialog" ref={revealDialogRef} aria-modal="true" aria-labelledby="private-key-title">
          <div className="w-full rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-xl sm:p-6">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><KeyRound size={18} /></div>
            <h3 id="private-key-title" className="mt-4 text-lg font-semibold text-black/90">Copy this key now</h3>
            <p className="mt-1 text-sm leading-6 text-black/50">This is the only time the private token for <strong className="font-semibold text-black/70">{revealed.key.name}</strong> will be shown. AquaCRM stores only its hash.</p>
            <div className="mt-4 rounded-lg bg-black p-4 text-white">
              <code className="block break-all text-xs leading-5">{revealed.token}</code>
              <button type="button" onClick={() => copy(revealed.token, "secret")} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md bg-white/10 px-3 text-xs font-semibold hover:bg-white/15">
                {copied === "secret" ? <Check size={14} /> : <Clipboard size={14} />}
                {copied === "secret" ? "Copied" : "Copy private key"}
              </button>
            </div>
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold text-emerald-950/80">Fastest setup</p>
              <p className="mt-1 text-xs leading-5 text-emerald-950/80">Download one Markdown file containing the MCP URL, REST API, operating prompt, exact scope and this one-time token.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => downloadSetupDocument(revealed.token, revealed.key)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-900 px-4 text-xs font-semibold text-white">
                  <Download size={14} /> Download complete setup file
                </button>
                <button type="button" onClick={() => copy(buildExternalAssistantSetupDocument(setupOptions(revealed.token, revealed.key)), "complete-setup")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-900/15 bg-white px-4 text-xs font-semibold text-emerald-950/70">
                  {copied === "complete-setup" ? <Check size={14} /> : <Clipboard size={14} />}
                  {copied === "complete-setup" ? "Setup copied" : "Copy complete setup"}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-emerald-900">The downloaded file contains a live secret. Upload it only to an assistant workspace you trust.</p>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setRevealed(null)} className="min-h-11 rounded-md bg-black px-5 text-sm font-semibold text-white">I have saved it</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KeyRow({ apiKey, onRotate, onRevoke }: {
  apiKey: ApiKeySummary;
  onRotate?: () => void;
  onRevoke?: () => void;
}) {
  const statusClass = apiKey.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-black/45";
  return (
    <div className="rounded-lg border border-black/10 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm font-semibold text-black/80">{apiKey.name}</strong>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass}`}>{apiKey.status}</span>
          </div>
          <p className="mt-1 font-mono text-xs text-black/45">{apiKey.tokenPrefix} · {apiKey.fingerprint}</p>
          <p className="mt-2 text-[11px] leading-4 text-black/40">
            {apiKey.modules.length} modules · {apiKey.permissions.map(permission => PERMISSION_LABELS[permission]?.label ?? permission).join(", ")}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-black/40">
            Created {formatDate(apiKey.createdAt)}{apiKey.lastUsedAt ? ` · Last used ${formatDate(apiKey.lastUsedAt)}` : " · Not used yet"}{apiKey.expiresAt ? ` · Expires ${formatDate(apiKey.expiresAt)}` : " · No expiry"}
          </p>
        </div>
        {apiKey.status === "active" ? (
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={onRotate} className="inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-black/55 hover:bg-black/[0.04]" title="Rotate key"><RotateCw size={14} />Rotate</button>
            <button type="button" onClick={onRevoke} className="inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-red-700 hover:bg-red-50" title="Revoke key"><Trash2 size={14} />Revoke</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusItem({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className="border-l-2 border-black/10 pl-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-black/70">
        <span className={`size-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} />
        {label}
      </div>
      <p className="mt-1 truncate text-xs text-black/45">{detail}</p>
    </div>
  );
}

function ConnectionValue({ label, value, onCopy, copied, link = false }: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  link?: boolean;
}) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-xs font-medium text-black/50">{label}</span>
      <code className="truncate text-xs text-black/70">{value || "Loading..."}</code>
      <div className="flex items-center gap-1">
        {link && value ? <a href={value} target="_blank" rel="noreferrer" className="rounded p-2 text-black/45 hover:bg-black/[0.04] hover:text-black" aria-label={`Open ${label}`}><ExternalLink size={14} /></a> : null}
        <button type="button" onClick={onCopy} disabled={!value} className="rounded p-2 text-black/45 hover:bg-black/[0.04] hover:text-black disabled:opacity-30" aria-label={`Copy ${label}`}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
        </button>
      </div>
    </div>
  );
}

function formatDate(value: number) {
  return formatUkDate(value, { day: "numeric", month: "short", year: "numeric" });
}
