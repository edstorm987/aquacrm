"use client";

import {
  Bot,
  Check,
  CircleAlert,
  Cloud,
  Code2,
  CreditCard,
  ExternalLink,
  KeyRound,
  Mail,
  MessageSquareText,
  MessagesSquare,
  Pencil,
  Plus,
  RefreshCw,
  SearchCheck,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  INTEGRATION_CATALOG,
  integrationDefinition,
  type IntegrationDefinition,
  type IntegrationProvider,
} from "@/lib/integrations/catalog";
import type { PublicIntegrationConnection } from "@/lib/integrations/types";
import { formatUkDate } from "@/lib/shared/formatDateTime";

interface Props {
  clients: Array<{ id: string; name: string }>;
  canManage: boolean;
  initialProvider?: IntegrationProvider;
}

type ApiPayload = {
  ok?: boolean;
  error?: string;
  vaultAvailable?: boolean;
  connection?: PublicIntegrationConnection;
  connections?: PublicIntegrationConnection[];
};

type ModalState = {
  provider: IntegrationProvider;
  connection?: PublicIntegrationConnection;
};

const providerIcon: Record<IntegrationProvider, typeof Mail> = {
  resend: Mail,
  smtp: Server,
  twilio: MessageSquareText,
  meta: MessagesSquare,
  stripe: CreditCard,
  github: Code2,
  vercel: Cloud,
  openai: Bot,
  "google-search-console": SearchCheck,
};

export function IntegrationConnectionsPanel({ clients, canManage, initialProvider }: Props) {
  const [connections, setConnections] = useState<PublicIntegrationConnection[]>([]);
  const [vaultAvailable, setVaultAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest("GET").then(result => {
      if (!active) return;
      const loadedConnections = result.connections ?? [];
      setConnections(loadedConnections);
      setVaultAvailable(result.vaultAvailable !== false);
      setNotice(result.ok ? "" : result.error || "Connections could not be loaded.");
      setLoading(false);
      if (result.ok && canManage && result.vaultAvailable !== false && initialProvider) {
        const existing = loadedConnections.find(connection => connection.provider === initialProvider && !connection.clientId)
          ?? loadedConnections.find(connection => connection.provider === initialProvider);
        setModal({ provider: initialProvider, connection: existing });
      }
    });
    return () => { active = false; };
  }, [canManage, initialProvider]);

  const byProvider = useMemo(() => Object.fromEntries(INTEGRATION_CATALOG.map(definition => [
    definition.id,
    connections.filter(connection => connection.provider === definition.id),
  ])) as Record<IntegrationProvider, PublicIntegrationConnection[]>, [connections]);
  const visibleCatalog = useMemo(() => initialProvider
    ? [...INTEGRATION_CATALOG].sort((left, right) => Number(right.id === initialProvider) - Number(left.id === initialProvider))
    : INTEGRATION_CATALOG, [initialProvider]);

  async function testConnection(connection: PublicIntegrationConnection) {
    setBusyId(connection.id);
    setNotice(`Testing ${integrationDefinition(connection.provider).name}…`);
    const result = await apiRequest("POST", { action: "test", connectionId: connection.id });
    if (result.connections) setConnections(result.connections);
    setNotice(result.ok
      ? result.connection?.lastTestMessage || "Connection passed its test."
      : result.error || "Connection test failed.");
    setBusyId("");
  }

  async function revokeConnection(connection: PublicIntegrationConnection) {
    if (!window.confirm(`Revoke “${connection.label}”? AquaCRM will stop using this saved credential.`)) return;
    setBusyId(connection.id);
    const result = await apiRequest("POST", { action: "revoke", connectionId: connection.id });
    if (result.connections) setConnections(result.connections);
    setNotice(result.ok ? `${connection.label} was revoked.` : result.error || "Connection could not be revoked.");
    setBusyId("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-black/90">Connected services</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
            Connect, test and manage provider credentials here. A connection can serve the whole workspace or one client only.
          </p>
        </div>
        <div className="shrink-0 text-sm font-semibold text-black/65">
          {connections.filter(connection => connection.status === "connected").length} tested · {connections.length} saved
        </div>
      </div>

      {!vaultAvailable ? (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <CircleAlert className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-sm font-semibold">Secure credential storage needs its one-time vault key.</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/75">Add <code>PORTAL_VAULT_ENCRYPTION_KEY</code> to the AquaCRM deployment once. After that, every workspace and client connection is managed here.</p>
          </div>
        </div>
      ) : null}

      {notice ? <p role="status" className="rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-xs leading-5 text-black/60">{notice}</p> : null}

      {!loading && vaultAvailable && !connections.some(connection => connection.provider === "resend" || connection.provider === "smtp") ? (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-900/20 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 shrink-0 text-emerald-700" size={18} />
            <div>
              <p className="text-sm font-semibold text-black/80">Start here — connect an email sender</p>
              <p className="mt-1 text-xs leading-5 text-black/55">A verified email sender is what lets you reply to website enquiries and send customers their login codes. Connect Resend (quickest) or your own SMTP mailbox.</p>
            </div>
          </div>
          {canManage ? (
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setModal({ provider: "resend" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/80"><Plus size={14} /> Connect Resend</button>
              <button onClick={() => setModal({ provider: "smtp" })} className="inline-flex min-h-9 items-center rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/65 hover:border-black/30">Use SMTP</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {visibleCatalog.map(definition => (
          <ProviderCard
            key={definition.id}
            definition={definition}
            connections={byProvider[definition.id]}
            clients={clients}
            canManage={canManage && vaultAvailable}
            loading={loading}
            busyId={busyId}
            onAdd={() => setModal({ provider: definition.id })}
            onEdit={connection => setModal({ provider: definition.id, connection })}
            onTest={testConnection}
            onRevoke={revokeConnection}
          />
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-emerald-900/15 bg-emerald-50/70 p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={18} />
        <div>
          <p className="text-sm font-semibold text-black/75">How credentials are protected</p>
          <p className="mt-1 text-xs leading-5 text-black/50">Secret fields are encrypted with AES-256-GCM before the portal state is persisted to Supabase. They are never returned to the browser, shown in activity logs or exposed to client portals.</p>
        </div>
      </div>

      {modal ? (
        <ConnectionModal
          state={modal}
          clients={clients}
          onClose={() => setModal(null)}
          onSaved={(nextConnections, message) => {
            setConnections(nextConnections);
            setNotice(message);
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProviderCard({
  definition,
  connections,
  clients,
  canManage,
  loading,
  busyId,
  onAdd,
  onEdit,
  onTest,
  onRevoke,
}: {
  definition: IntegrationDefinition;
  connections: PublicIntegrationConnection[];
  clients: Array<{ id: string; name: string }>;
  canManage: boolean;
  loading: boolean;
  busyId: string;
  onAdd: () => void;
  onEdit: (connection: PublicIntegrationConnection) => void;
  onTest: (connection: PublicIntegrationConnection) => void;
  onRevoke: (connection: PublicIntegrationConnection) => void;
}) {
  const Icon = providerIcon[definition.id];
  return (
    <article className="overflow-hidden rounded-lg border border-black/10 bg-white/75">
      <header className="flex items-start justify-between gap-4 border-b border-black/[0.07] p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-black/[0.06] text-black/65"><Icon size={19} /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-black/85">{definition.name}</h3>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-black/35">{definition.category}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-black/50">{definition.description}</p>
          </div>
        </div>
        {canManage ? (
          <button onClick={onAdd} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/80">
            <Plus size={14} />{connections.length ? "Add" : "Connect"}
          </button>
        ) : null}
      </header>

      <div className="divide-y divide-black/[0.07]">
        {loading ? <p className="p-4 text-xs text-black/40">Loading connections…</p> : null}
        {!loading && !connections.length ? (
          <div className="p-4">
            <p className="text-xs leading-5 text-black/45">Not connected. Open the setup flow to create the key, paste it here and test it without leaving this page unfinished.</p>
          </div>
        ) : null}
        {connections.map(connection => {
          const clientName = connection.clientId
            ? clients.find(client => client.id === connection.clientId)?.name ?? "Client scope"
            : "Entire workspace";
          const busy = busyId === connection.id;
          return (
            <div key={connection.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConnectionStatus connection={connection} />
                    <strong className="truncate text-sm font-medium text-black/75">{connection.label}</strong>
                  </div>
                  <p className="mt-1 text-xs text-black/45">{clientName}{connection.lastTestedAt ? ` · tested ${formatDate(connection.lastTestedAt)}` : " · not tested yet"}</p>
                  {connection.lastTestMessage ? <p className={`mt-1 text-xs leading-5 ${connection.lastTestStatus === "failed" ? "text-red-700" : "text-black/45"}`}>{connection.lastTestMessage}</p> : null}
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <IconButton label="Test connection" onClick={() => onTest(connection)} disabled={busy}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></IconButton>
                    <IconButton label="Edit connection" onClick={() => onEdit(connection)} disabled={busy}><Pencil size={14} /></IconButton>
                    <IconButton label="Revoke connection" onClick={() => onRevoke(connection)} disabled={busy} destructive><Trash2 size={14} /></IconButton>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ConnectionModal({ state, clients, onClose, onSaved }: {
  state: ModalState;
  clients: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (connections: PublicIntegrationConnection[], message: string) => void;
}) {
  const definition = integrationDefinition(state.provider);
  const existing = state.connection;
  const [label, setLabel] = useState(existing?.label ?? definition.name);
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [values, setValues] = useState<Record<string, string>>(existing?.config ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const saved = await apiRequest("POST", {
      action: "save",
      connectionId: existing?.id,
      provider: definition.id,
      label,
      clientId: clientId || undefined,
      values,
    });
    if (!saved.ok || !saved.connection) {
      setError(saved.error || "Connection could not be saved.");
      setSaving(false);
      return;
    }
    const tested = await apiRequest("POST", { action: "test", connectionId: saved.connection.id });
    const nextConnections = tested.connections ?? saved.connections ?? [];
    onSaved(nextConnections, tested.ok
      ? tested.connection?.lastTestMessage || `${definition.name} is connected.`
      : `${definition.name} was saved, but its test failed: ${tested.error || "check the credentials and try again."}`);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="integration-modal-title">
      <div className="max-h-[92dvh] w-full overflow-y-auto bg-[#f8f7f4] shadow-2xl sm:max-w-2xl sm:rounded-lg">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-black/10 bg-[#f8f7f4] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{existing ? "Edit connection" : "Connect service"}</p>
            <h2 id="integration-modal-title" className="mt-1 text-xl font-semibold text-black/90">{definition.name}</h2>
          </div>
          <button onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-md border border-black/10 bg-white text-black/55 hover:text-black" aria-label="Close"><X size={17} /></button>
        </header>

        <form onSubmit={submit} className="space-y-5 p-5">
          <ol className="grid gap-2 sm:grid-cols-3">
            <SetupStep number="1" title="Create the key" detail="Open the provider in a new tab." />
            <SetupStep number="2" title="Paste it here" detail="AquaCRM encrypts secret fields." />
            <SetupStep number="3" title="Save and test" detail="The connection is checked immediately." />
          </ol>

          <a href={definition.setupUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/70 hover:border-black/30">
            {definition.setupLabel}<ExternalLink size={14} />
          </a>

          <div className="grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-2">
            <Field label="Connection name" help="Use a name you will recognise later.">
              <input value={label} onChange={event => setLabel(event.target.value)} className={controlClass} maxLength={120} required />
            </Field>
            <Field label="Use this connection for" help="Client connections override the workspace default for that client.">
              <select value={clientId} onChange={event => setClientId(event.target.value)} className={controlClass}>
                <option value="">Entire AquaOasis-Web workspace</option>
                {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {definition.fields.map(field => {
              const configured = Boolean(existing?.configuredSecretFields.includes(field.id));
              return (
                <Field key={field.id} label={field.label} help={configured && field.secret ? `${field.help} A secret is already configured; leave this blank to keep it.` : field.help}>
                  <input
                    type={field.kind}
                    value={values[field.id] ?? ""}
                    onChange={event => setValues(current => ({ ...current, [field.id]: event.target.value }))}
                    className={controlClass}
                    placeholder={configured && field.secret ? "Configured — leave blank to keep" : field.placeholder}
                    required={field.required && !(configured && field.secret)}
                    autoComplete={field.secret ? "new-password" : "off"}
                  />
                </Field>
              );
            })}
          </div>

          <div className="rounded-md border border-black/10 bg-white/70 p-3 text-xs leading-5 text-black/50">
            <strong className="text-black/70">After connection:</strong> {definition.outcome}
          </div>

          {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-black/10 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/15 bg-white px-4 text-sm font-semibold text-black/65">Cancel</button>
            <button disabled={saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <KeyRound size={15} />}{saving ? "Saving and testing…" : "Save and test connection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SetupStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <li className="flex gap-2 rounded-md border border-black/10 bg-white/70 p-3"><span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">{number}</span><span><strong className="block text-xs text-black/75">{title}</strong><span className="mt-0.5 block text-[11px] leading-4 text-black/45">{detail}</span></span></li>;
}

function ConnectionStatus({ connection }: { connection: PublicIntegrationConnection }) {
  const passed = connection.status === "connected";
  const failed = connection.status === "needs-attention";
  return <span className={`inline-flex size-5 items-center justify-center rounded-full ${passed ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} title={passed ? "Connected" : failed ? "Needs attention" : "Saved, not tested"}>{passed ? <Check size={12} /> : <CircleAlert size={12} />}</span>;
}

function IconButton({ label, children, onClick, disabled, destructive = false }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`inline-flex size-9 items-center justify-center rounded-md border bg-white transition disabled:opacity-40 ${destructive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-black/10 text-black/55 hover:border-black/25 hover:text-black"}`}>{children}</button>;
}

function Field({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return <label className="grid content-start gap-1.5 text-xs font-medium text-black/65"><span>{label}</span>{children}<span className="text-[11px] font-normal leading-4 text-black/40">{help}</span></label>;
}

async function apiRequest(method: "GET" | "POST", body?: Record<string, unknown>): Promise<ApiPayload> {
  try {
    const response = await fetch("/api/portal/settings/integrations", {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as ApiPayload | null;
    return payload ?? { ok: false, error: `Connection request failed (${response.status}).` };
  } catch {
    return { ok: false, error: "AquaCRM could not reach the integration service." };
  }
}

function formatDate(value: number) {
  return formatUkDate(value, { dateStyle: "medium", timeStyle: "short" });
}

const controlClass = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none focus:border-black/40";
