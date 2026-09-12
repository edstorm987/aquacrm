"use client";

import { Check, Copy, KeyRound, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { PublicEmbedCredential } from "@/lib/server/embedCredentialAuthority";

interface Props {
  clients: Array<{ id: string; name: string }>;
  canManage: boolean;
}

type Payload = {
  ok?: boolean;
  error?: string;
  credential?: PublicEmbedCredential;
  credentials?: PublicEmbedCredential[];
  secret?: string;
};

export function EmbedCredentialsPanel({ clients, canManage }: Props) {
  const [credentials, setCredentials] = useState<PublicEmbedCredential[]>([]);
  const [label, setLabel] = useState("Portal embed");
  const [clientId, setClientId] = useState("");
  const [maxMode, setMaxMode] = useState<"client" | "admin">("client");
  const [allowedOrigin, setAllowedOrigin] = useState("");
  const [revealedSecret, setRevealedSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    void fetch("/api/portal/settings/embed-credentials", { cache: "no-store" })
      .then(response => response.json() as Promise<Payload>)
      .then(payload => {
        if (!active) return;
        if (payload.ok) setCredentials(payload.credentials ?? []);
        else setNotice(payload.error || "Embed credentials could not be loaded.");
      })
      .catch(() => { if (active) setNotice("Embed credentials could not be loaded."); });
    return () => { active = false; };
  }, [canManage]);

  if (!canManage) return null;

  async function csrfToken(): Promise<string> {
    const response = await fetch("/api/auth/csrf", { cache: "no-store" });
    const payload = await response.json() as { token?: string };
    if (!payload.token) throw new Error("csrf_unavailable");
    return payload.token;
  }

  async function post(body: Record<string, unknown>): Promise<Payload> {
    const csrf = await csrfToken();
    const response = await fetch("/api/portal/settings/embed-credentials", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(body),
    });
    return response.json() as Promise<Payload>;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setRevealedSecret("");
    try {
      const payload = await post({ action: "create", label, clientId: clientId || undefined, maxMode, allowedOrigin: allowedOrigin || undefined });
      if (!payload.ok || !payload.credential || !payload.secret) {
        setNotice(payload.error || "The credential could not be created.");
      } else {
        setCredentials(current => [payload.credential!, ...current]);
        setRevealedSecret(payload.secret);
        setNotice("Credential created. Copy it now; AquaCRM will not reveal it again.");
      }
    } catch {
      setNotice("The credential could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(credential: PublicEmbedCredential) {
    if (!window.confirm(`Revoke “${credential.label}”? Existing unconsumed links from it will stop working.`)) return;
    setBusy(true);
    setRevealedSecret("");
    try {
      const payload = await post({ action: "revoke", credentialId: credential.id });
      if (payload.ok) {
        setCredentials(payload.credentials ?? credentials.filter(item => item.id !== credential.id));
        setNotice("Embed credential revoked.");
      } else {
        setNotice(payload.error || "The credential could not be revoked.");
      }
    } catch {
      setNotice("The credential could not be revoked.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    await navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-5">
      <div className="flex items-start gap-3 border-b border-black/10 pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.06] text-black/65"><KeyRound size={19} /></span>
        <div>
          <h2 className="font-semibold text-black/85">Portal embed credentials</h2>
          <p className="mt-1 text-xs leading-5 text-black/50">Generate a separate bearer for one workspace or client. Client-scoped credentials are always client-only, and every credential can be revoked independently.</p>
        </div>
      </div>

      <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Credential name">
          <input value={label} onChange={event => setLabel(event.target.value)} maxLength={120} required className={control} />
        </Field>
        <Field label="Scope">
          <select value={clientId} onChange={event => { setClientId(event.target.value); if (event.target.value) setMaxMode("client"); }} className={control}>
            <option value="">Entire workspace</option>
            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </Field>
        <Field label="Maximum view">
          <select value={maxMode} onChange={event => setMaxMode(event.target.value as "client" | "admin")} className={control}>
            <option value="client">Client only</option>
            {!clientId ? <option value="admin">Client and admin</option> : null}
          </select>
        </Field>
        <Field label="Exact embed origin (optional)">
          <input value={allowedOrigin} onChange={event => setAllowedOrigin(event.target.value)} type="url" placeholder="https://portal.example.com" maxLength={500} className={control} />
        </Field>
        <div className="sm:col-span-2">
          <button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15} />Generate credential</button>
        </div>
      </form>

      {notice ? <p role="status" className="mt-4 rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-xs text-black/60">{notice}</p> : null}
      {revealedSecret ? (
        <div className="mt-4 border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Copy this bearer now</p>
              <p className="mt-1 text-xs">It is encrypted at rest and will not appear in later reads or logs.</p>
            </div>
            <button type="button" onClick={() => setRevealedSecret("")} aria-label="Hide generated bearer"><X size={16} /></button>
          </div>
          <code className="mt-3 block break-all bg-white p-3 text-xs">{revealedSecret}</code>
          <button type="button" onClick={copySecret} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-amber-400 bg-white px-3 text-xs font-semibold">
            {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy bearer"}
          </button>
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-black/[0.07] border-t border-black/10">
        {credentials.length ? credentials.map(credential => (
          <div key={credential.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-black/75">{credential.label}</p>
              <p className="mt-1 text-xs text-black/45">
                {credential.clientId ? clients.find(client => client.id === credential.clientId)?.name || "Client scope" : "Entire workspace"}
                {` · max ${credential.maxMode} · fingerprint ${credential.fingerprint}`}
              </p>
              {credential.allowedOrigin ? <p className="mt-1 text-xs text-black/45">Origin: {credential.allowedOrigin}</p> : null}
            </div>
            <button type="button" onClick={() => revoke(credential)} disabled={busy} className="inline-flex min-h-9 w-fit items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-800 disabled:opacity-50"><Trash2 size={14} />Revoke</button>
          </div>
        )) : <p className="py-5 text-xs text-black/45">No embed credentials have been generated for this workspace.</p>}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-black/60"><span>{label}</span>{children}</label>;
}

const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/75 outline-none focus:border-black/35";
