"use client";

// Per-client SOPs sub-tab. Renders agency SOPs filtered to the families
// suggested for the client's current phase (chapter §9c × R4 mapping in
// `lib/server/sopsAccess.ts:familiesForStage()`). Read-only — non-Founder
// roles can browse but `+ New SOP` lives only on the agency-side
// `/portal/agency/sops` surface.

import { useEffect, useState } from "react";

interface Sop {
  id: string;
  title: string;
  slug: string;
  tags: string[];
  status: string;
  updatedAt: number;
}

const TAG_LABELS: Record<string, string> = {
  sales:     "Sales & Discovery",
  service:   "Onboarding & Service Delivery",
  leads:     "Leads & Nurturing",
  standards: "Standards & Internal",
  mastery:   "Mastery Plan",
};

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function ClientSopsTab({
  families,
  phaseLabel,
}: {
  families: readonly string[];
  phaseLabel: string;
}) {
  const [sops, setSops] = useState<Sop[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      families.map(family =>
        fetch(`/api/portal/sops/list?tag=${encodeURIComponent(family)}&status=published`, { method: "GET" })
          .then(r => r.ok ? r.json() as Promise<{ ok: boolean; sops?: Sop[] }> : null)
          .catch(() => null),
      ),
    ).then(results => {
      if (cancelled) return;
      const merged = new Map<string, Sop>();
      for (const r of results) {
        if (!r?.sops) continue;
        for (const s of r.sops) merged.set(s.id, s);
      }
      const list = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setSops(list);
      if (results.every(r => r === null)) {
        setError("SOPs plugin not installed for this agency.");
      }
    });
    return () => { cancelled = true; };
  }, [families]);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-black/90">SOPs for {phaseLabel}</h2>
          <p className="mt-1 text-sm text-black/60">
            Filtered to {families.map(f => TAG_LABELS[f] ?? f).join(" · ")}.
            Read-only here; edits live on the agency SOPs shelf.
          </p>
        </div>
        <a
          href="/portal/agency/sops"
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5"
        >
          Open SOPs shelf →
        </a>
      </header>

      <div className="mt-4">
        {error && <p className="text-sm text-black/55">{error}</p>}
        {sops === null && !error && <p className="text-sm text-black/55">Loading…</p>}
        {sops && sops.length === 0 && !error && (
          <p className="text-sm text-black/55">No published SOPs tagged for this phase yet.</p>
        )}
        {sops && sops.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {sops.map(s => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-1.5 last:border-0">
                <a
                  href={`/portal/agency/sops/read/${encodeURIComponent(s.slug)}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--brand-primary)] hover:underline"
                >
                  {s.title}
                </a>
                <span className="shrink-0 text-[11px] text-black/45">
                  {s.tags.slice(0, 2).join(" · ")} · {formatRelative(s.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
