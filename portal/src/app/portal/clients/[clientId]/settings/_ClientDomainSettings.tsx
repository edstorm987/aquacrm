"use client";

import { ExternalLink, Globe2, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface WebsiteProperty {
  id: string;
  label: string;
  kind: string;
  liveUrl?: string;
}

export function ClientDomainSettings({
  clientId,
  initialWebsiteUrl,
  properties,
}: {
  clientId: string;
  initialWebsiteUrl?: string;
  properties: WebsiteProperty[];
}) {
  const router = useRouter();
  const websiteProperties = useMemo(() => properties.filter(property => property.kind === "website"), [properties]);
  const matchingProperty = websiteProperties.find(property => property.liveUrl === initialWebsiteUrl);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl ?? "");
  const [savedWebsiteUrl, setSavedWebsiteUrl] = useState(initialWebsiteUrl ?? "");
  const [syncPropertyId, setSyncPropertyId] = useState(matchingProperty?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(nextUrl = websiteUrl) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/tenants/client-domain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, websiteUrl: nextUrl, syncPropertyId }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; websiteUrl?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "The website address could not be saved.");
        return;
      }
      const normalized = data.websiteUrl ?? "";
      setWebsiteUrl(normalized);
      setSavedWebsiteUrl(normalized);
      setSaved(true);
      router.refresh();
    } catch {
      setError("The website address could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
            <Globe2 size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-black/85">Official website domain</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
              This is the live address used across the client record, portal and quick links. Localhost stays separate as a development preview.
            </p>
          </div>
        </div>
        {savedWebsiteUrl ? (
          <a href={savedWebsiteUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03]">
            Open live site <ExternalLink size={14} />
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)]">
        <label className="text-sm font-medium text-black/70">
          Website address
          <input
            value={websiteUrl}
            onChange={event => setWebsiteUrl(event.target.value)}
            placeholder="client-domain.com"
            inputMode="url"
            autoComplete="url"
            className="mt-1.5 min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>

        <label className="text-sm font-medium text-black/70">
          Keep website property in sync
          <select
            value={syncPropertyId}
            onChange={event => setSyncPropertyId(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="">Do not sync a property</option>
            {websiteProperties.map(property => <option key={property.id} value={property.id}>{property.label}</option>)}
          </select>
        </label>
      </div>

      {websiteProperties.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-black/45">No website property exists yet. You can still save the client domain now and add the development project later.</p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
      {saved ? <p role="status" className="mt-3 text-sm font-medium text-emerald-700">Official website updated everywhere.</p> : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-black/8 pt-4">
        {savedWebsiteUrl ? (
          <button type="button" disabled={busy} onClick={() => void save("")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
            <Trash2 size={14} />Remove domain
          </button>
        ) : null}
        <button type="button" disabled={busy || websiteUrl.trim() === savedWebsiteUrl} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45">
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
          Save domain
        </button>
      </div>
    </section>
  );
}
