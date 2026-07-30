"use client";

import { Check, Clipboard, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

interface ConnectionStatus {
  ready: boolean;
  readOnly: boolean;
  tokenConfigured: boolean;
  tokenStrongEnough: boolean;
  tokenFingerprint: string | null;
  agencyId: string;
  agencyExists: boolean;
  agencyMatchesWorkspace: boolean;
  modules: string[];
}

export function ExternalAiConnectionPanel() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("Checking connection...");
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    void loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const response = await fetch("/api/portal/settings/external-ai", { cache: "no-store" });
      const json = await response.json() as { ok?: boolean; connection?: ConnectionStatus; error?: string };
      if (!response.ok || !json.connection) throw new Error(json.error || "Could not inspect the connection.");
      setConnection(json.connection);
      setStatus(json.connection.ready ? "External AI access is ready." : "Setup is still required.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not inspect the connection.");
    }
  }

  async function testConnection() {
    setTesting(true);
    setStatus("Testing live data access...");
    try {
      const response = await fetch("/api/portal/settings/external-ai", { method: "POST" });
      const json = await response.json() as {
        ok?: boolean;
        error?: string;
        connection?: ConnectionStatus;
        recordCount?: number;
        moduleCount?: number;
      };
      if (json.connection) setConnection(json.connection);
      if (!response.ok || !json.ok) throw new Error(json.error || "The connection test failed.");
      setStatus(`Connected. ${json.recordCount ?? 0} records are available across ${json.moduleCount ?? 0} modules.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1_500);
  }

  const baseUrl = `${origin}/api/v1`;
  const openApiUrl = `${origin}/api/v1/openapi.json`;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${connection?.ready ? "bg-emerald-500" : "bg-amber-500"}`} />
            <h3 className="text-sm font-semibold text-black/85">External AI data access</h3>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">
            Connect ChatGPT, Claude, or another assistant to live Milesymedia data through a private, read-only API.
          </p>
        </div>
        <button
          type="button"
          onClick={testConnection}
          disabled={testing}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={testing ? "animate-spin" : ""} />
          Test connection
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatusItem label="Private token" ready={Boolean(connection?.tokenConfigured && connection.tokenStrongEnough)} detail={connection?.tokenFingerprint ? `Configured · ${connection.tokenFingerprint}` : "Not configured"} />
        <StatusItem label="Workspace scope" ready={Boolean(connection?.agencyExists && connection.agencyMatchesWorkspace)} detail={connection?.agencyId || "Checking..."} />
        <StatusItem label="Access level" ready={Boolean(connection?.readOnly)} detail="Read-only · secrets excluded" />
      </div>

      <div className="mt-5 divide-y divide-black/10 border-y border-black/10">
        <ConnectionValue label="API base URL" value={baseUrl} onCopy={() => copy(baseUrl, "base")} copied={copied === "base"} />
        <ConnectionValue label="OpenAPI schema" value={openApiUrl} onCopy={() => copy(openApiUrl, "schema")} copied={copied === "schema"} link />
        <ConnectionValue label="Authentication" value="Authorization: Bearer YOUR_PRIVATE_TOKEN" onCopy={() => copy("Authorization: Bearer YOUR_PRIVATE_TOKEN", "auth")} copied={copied === "auth"} />
      </div>

      {!connection?.ready && (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Finish setup in the deployment environment</p>
          <ol className="mt-2 grid gap-1 text-xs leading-5 text-amber-900/75">
            <li>1. Create a private token with at least 32 random characters.</li>
            <li>2. Add it as <code className="font-mono">MILESYMEDIA_ASSISTANT_API_TOKEN</code>.</li>
            <li>3. Set <code className="font-mono">MILESYMEDIA_ASSISTANT_AGENCY_ID={connection?.agencyId || "milesymedia"}</code>, then restart or redeploy.</li>
            <li>4. Give your assistant the OpenAPI schema URL and bearer token.</li>
          </ol>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-black/50">{status}</p>
        <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-800">
          <ShieldCheck size={14} />
          {connection?.modules.length ?? 0} business data modules
        </div>
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
