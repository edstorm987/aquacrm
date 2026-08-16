"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ExternalLink, Fingerprint, Link2, PauseCircle, RefreshCw, SearchCheck, X, XCircle } from "lucide-react";

import type { IdentityResolutionReview, IdentityReviewStatus } from "@/server/types";

interface ClientOption {
  id: string;
  name: string;
  ownerEmail?: string;
  stage: string;
  relationshipId?: string;
  workspaceLabel?: string;
  providerName?: string;
}

export function IdentityReviewWorkspace({
  initialReviews,
  clients,
}: {
  initialReviews: IdentityResolutionReview[];
  clients: ClientOption[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [status, setStatus] = useState<IdentityReviewStatus | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visible = useMemo(() => reviews.filter(review => status === "all" || review.status === status), [reviews, status]);
  const pendingCount = reviews.filter(review => review.status === "pending").length;

  async function load(nextStatus: IdentityReviewStatus | "all") {
    setStatus(nextStatus);
    setError(null);
    const response = await fetch(`/api/portal/identity-resolution?status=${encodeURIComponent(nextStatus)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { ok?: boolean; reviews?: IdentityResolutionReview[]; error?: string } | null;
    if (!response.ok || !payload?.ok || !payload.reviews) {
      setError(payload?.error || "Identity reviews could not be loaded.");
      return;
    }
    setReviews(payload.reviews);
  }

  async function rescan() {
    setBusyId("rescan");
    setError(null);
    const response = await fetch("/api/portal/identity-resolution", { method: "POST" });
    const payload = await response.json().catch(() => null) as { ok?: boolean; reviews?: IdentityResolutionReview[]; error?: string } | null;
    setBusyId(null);
    if (!response.ok || !payload?.ok || !payload.reviews) {
      setError(payload?.error || "Identity sources could not be rescanned.");
      return;
    }
    setStatus("pending");
    setReviews(payload.reviews);
  }

  async function decide(review: IdentityResolutionReview, action: "link" | "park" | "dismiss", clientId?: string) {
    setBusyId(review.id);
    setError(null);
    const response = await fetch("/api/portal/identity-resolution", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewId: review.id, action, clientId }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; review?: IdentityResolutionReview; error?: string } | null;
    setBusyId(null);
    if (!response.ok || !payload?.ok || !payload.review) {
      setError(payload?.error || "The identity decision could not be saved.");
      return;
    }
    setReviews(current => current.map(item => item.id === review.id ? payload.review! : item));
  }

  return (
    <section className="mt-6 min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-brand"><Fingerprint size={15} /> Identity control</div>
          <h2 className="mt-2 text-xl font-semibold text-black/85">Resolve people to the right client</h2>
          <p className="mt-1 max-w-3xl text-sm text-black/52">Aqua auto-links authoritative matches. Anything uncertain stays here with the evidence visible, so a name similarity can never silently join the wrong account.</p>
        </div>
        <button type="button" onClick={() => void rescan()} disabled={busyId === "rescan"} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-45">
          <RefreshCw size={15} className={busyId === "rescan" ? "animate-spin" : ""} /> Rescan sources
        </button>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-black/10 py-4" aria-label="Identity review status">
        <FilterButton active={status === "pending"} onClick={() => void load("pending")} label="Needs review" count={pendingCount} />
        <FilterButton active={status === "parked"} onClick={() => void load("parked")} label="Parked" />
        <FilterButton active={status === "linked"} onClick={() => void load("linked")} label="Approved" />
        <FilterButton active={status === "dismissed"} onClick={() => void load("dismissed")} label="Dismissed" />
        <FilterButton active={status === "all"} onClick={() => void load("all")} label="History" />
      </div>

      {error ? <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={15} /></button></div> : null}

      <div className="mt-5 divide-y divide-black/[0.08] border-y border-black/10">
        {visible.map(review => <IdentityReviewRow key={review.id} review={review} clients={clients} busy={busyId === review.id} onDecide={decide} />)}
      </div>
      {!visible.length ? (
        <div className="grid min-h-56 place-items-center border-b border-black/10 text-center">
          <div><SearchCheck className="mx-auto text-brand" size={28} /><p className="mt-3 text-sm font-semibold text-black/70">Nothing in this queue</p><p className="mt-1 text-sm text-black/45">Run a source scan to check new enquiries and social identities.</p></div>
        </div>
      ) : null}
    </section>
  );
}

function IdentityReviewRow({
  review,
  clients,
  busy,
  onDecide,
}: {
  review: IdentityResolutionReview;
  clients: ClientOption[];
  busy: boolean;
  onDecide: (review: IdentityResolutionReview, action: "link" | "park" | "dismiss", clientId?: string) => Promise<void>;
}) {
  const [selectedClientId, setSelectedClientId] = useState(review.resolution.candidates[0]?.clientId ?? "");
  const topCandidate = review.resolution.candidates[0];
  const candidateClients = review.resolution.candidates
    .map(candidate => clients.find(client => client.id === candidate.clientId))
    .filter((client): client is ClientOption => Boolean(client));
  const sharedRelationship = candidateClients.find(client => client.relationshipId
    && candidateClients.filter(candidate => candidate.relationshipId === client.relationshipId).length > 1)?.relationshipId;
  return (
    <article className="grid gap-5 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(250px,0.7fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold uppercase text-amber-800">{review.status.replaceAll("-", " ")}</span>
          <span className="text-[11px] font-semibold uppercase text-black/38">{review.sourceType.replaceAll("-", " ")}</span>
        </div>
        <h3 className="mt-3 truncate text-base font-semibold text-black/82">{review.sourceLabel}</h3>
        <dl className="mt-3 space-y-1 text-sm text-black/52">
          {review.email ? <div className="flex gap-2"><dt className="w-14 text-black/35">Email</dt><dd className="min-w-0 truncate">{review.email}</dd></div> : null}
          {review.phone ? <div className="flex gap-2"><dt className="w-14 text-black/35">Phone</dt><dd>{review.phone}</dd></div> : null}
          {review.leadId ? <div className="flex gap-2"><dt className="w-14 text-black/35">Lead</dt><dd className="min-w-0 truncate font-mono text-xs">{review.leadId}</dd></div> : null}
        </dl>
        {review.sourceHref ? <Link href={review.sourceHref} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand">Open source <ExternalLink size={12} /></Link> : null}
      </div>

      <div className="min-w-0 lg:border-l lg:border-black/10 lg:pl-5">
        <p className="text-xs font-semibold uppercase text-black/40">Why Aqua stopped</p>
        <p className="mt-2 text-sm leading-6 text-black/62">{review.resolution.explanation}</p>
        {sharedRelationship ? <p className="mt-3 border-l-2 border-cyan-500 bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-950"><strong>Known buyer, multiple workspaces.</strong> Choose the company or project this conversation actually belongs to. Aqua will not copy it into every portal.</p> : null}
        {review.resolution.candidates.length ? (
          <div className="mt-4 divide-y divide-black/[0.07] border-y border-black/[0.07]">
            {review.resolution.candidates.slice(0, 3).map(candidate => {
              const option = clients.find(client => client.id === candidate.clientId);
              return (
              <button key={candidate.clientId} type="button" onClick={() => setSelectedClientId(candidate.clientId)} className={`flex w-full items-start justify-between gap-4 px-1 py-3 text-left ${selectedClientId === candidate.clientId ? "text-brand" : "text-black/70"}`}>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{candidate.clientName}</span>{option?.workspaceLabel || option?.providerName ? <span className="mt-0.5 block truncate text-[11px] text-black/38">{[option.workspaceLabel, option.providerName].filter(Boolean).join(" · ")}</span> : null}<span className="mt-1 block text-xs text-black/42">{candidate.reasons.map(reason => reason.label).join(" · ")}</span></span>
                <span className="shrink-0 text-sm font-semibold">{candidate.confidence}%</span>
              </button>
              );
            })}
          </div>
        ) : <p className="mt-4 text-sm text-black/42">No safe suggestion. Choose a client manually only when you know the relationship.</p>}
      </div>

      <div className="flex flex-col justify-center gap-2 lg:border-l lg:border-black/10 lg:pl-5">
        <label className="text-xs font-semibold text-black/48" htmlFor={`client-${review.id}`}>Link to client</label>
        <select id={`client-${review.id}`} value={selectedClientId} onChange={event => setSelectedClientId(event.target.value)} className="min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/70">
          <option value="">Choose a client</option>
          {clients.map(client => <option key={client.id} value={client.id}>{[client.name, client.workspaceLabel, client.providerName, client.ownerEmail].filter(Boolean).join(" · ")}</option>)}
        </select>
        <button type="button" disabled={busy || !selectedClientId || review.status === "linked"} onClick={() => void onDecide(review, "link", selectedClientId)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white disabled:opacity-40">
          {review.status === "linked" ? <Check size={15} /> : <Link2 size={15} />} {review.status === "linked" ? "Linked" : `Approve${topCandidate?.clientId === selectedClientId ? " match" : " link"}`}
        </button>
        {review.status === "pending" ? <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => void onDecide(review, "park")} title="Park for seven days" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-black/12 text-xs font-semibold text-black/55"><PauseCircle size={14} /> Park</button><button type="button" disabled={busy} onClick={() => void onDecide(review, "dismiss")} title="Keep unlinked and dismiss" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-black/12 text-xs font-semibold text-black/55"><XCircle size={14} /> Dismiss</button></div> : null}
      </div>
    </article>
  );
}

function FilterButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${active ? "border-brand bg-brand/8 text-brand" : "border-black/12 text-black/55"}`}>{label}{typeof count === "number" ? <span className="rounded-full bg-black/7 px-1.5 py-0.5 text-[10px]">{count}</span> : null}</button>;
}
