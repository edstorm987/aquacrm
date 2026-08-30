"use client";

import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Circle, ExternalLink, FileSignature, Link2, Save, Send, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientRequest, ClientRequestType } from "@/app/api/tenants/client-requests/route";
import { contractHasReviewableTerms, type ClientContract } from "@/lib/clients/clientContracts";
import type { CustomerProjectBrief } from "@/app/api/tenants/customer-project-brief/route";
import type { ClientApproval } from "@/app/api/tenants/client-approvals/route";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type { CustomerPortalMode } from "./_portalData";
import type { CustomerProperty } from "./_portalData";

const CONTROL = "min-h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm text-[#292621] outline-none transition placeholder:text-black/30 focus:border-[var(--portal-accent)] focus:ring-2 focus:ring-black/10";

function formatShortDate(timestamp: number): string {
  return formatUkDate(timestamp, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STAGE_RESPONSE: Record<CustomerPortalMode, {
  eyebrow: string;
  title: string;
  placeholder: string;
  type: ClientRequestType;
}> = {
  onboarding: {
    eyebrow: "Add to the brief",
    title: "Tell us anything we should know.",
    placeholder: "A priority, concern, idea, deadline, or useful piece of context...",
    type: "suggestion",
  },
  designing: {
    eyebrow: "Shape the work",
    title: "Leave focused feedback.",
    placeholder: "What feels right, what should change, and why...",
    type: "design-feedback",
  },
  "developed-launch": {
    eyebrow: "Review delivery",
    title: "Send final feedback or a question.",
    placeholder: "Something to check, change, or confirm before delivery...",
    type: "suggestion",
  },
  maintenance: {
    eyebrow: "Ongoing care",
    title: "Ask for a change or report an issue.",
    placeholder: "Tell us what you need and what you expected to happen...",
    type: "support-ticket",
  },
};

export interface CustomerStageTask {
  label: string;
  detail: string;
  complete: boolean;
  href?: string;
}

export function CustomerStageWorkspace({
  clientId,
  mode,
  tasks,
  properties = [],
  readOnly = false,
  providerName = "Milesymedia",
}: {
  clientId: string;
  mode: CustomerPortalMode;
  tasks: CustomerStageTask[];
  properties?: CustomerProperty[];
  readOnly?: boolean;
  providerName?: string;
}) {
  const router = useRouter();
  const response = STAGE_RESPONSE[mode];
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const request = await fetch("/api/tenants/client-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          type: response.type,
          message,
          link: link.trim() || undefined,
          propertyId: propertyId || undefined,
        }),
      });
      const payload = await request.json() as { ok: boolean; error?: string };
      if (!request.ok || !payload.ok) throw new Error(payload.error || "We could not send that update.");
      setMessage("");
      setLink("");
      setPropertyId("");
      setNotice(`Sent. ${providerName} can now see this in your project.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not send that update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="stage-actions" className="mt-5 overflow-hidden rounded-md border border-black/10 bg-[#fbfaf8]">
      <div className="grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="border-b border-black/10 p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Your part</p>
          <h2 className="mt-2 font-serif text-2xl">Keep things moving.</h2>
          <ul className="mt-6 divide-y divide-black/8 border-y border-black/10">
            {tasks.map(task => (
              <li key={task.label} className="flex items-start gap-3 py-4">
                {task.complete ? (
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Circle size={17} className="mt-0.5 shrink-0 text-[var(--portal-accent)]" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{task.label}</p>
                  <p className="mt-1 text-xs leading-5 text-black/45">{task.detail}</p>
                </div>
                {!task.complete && task.href ? (
                  <a href={task.href} className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium text-[var(--portal-accent)]">
                    Open <ArrowRight size={12} aria-hidden="true" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="p-6 sm:p-8" aria-disabled={readOnly}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--portal-accent)]">{response.eyebrow}</p>
          <h2 className="mt-2 font-serif text-2xl">{response.title}</h2>
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value)}
            disabled={readOnly}
            className={`${CONTROL} mt-5 min-h-32 resize-y py-3`}
            placeholder={response.placeholder}
          />
          {properties.length ? (
            <label className="mt-3 grid gap-2 text-xs font-medium text-black/50">
              Which project is this about?
              <select
                value={propertyId}
                onChange={event => setPropertyId(event.target.value)}
                disabled={readOnly}
                className={CONTROL}
              >
                <option value="">My overall project</option>
                {properties.map(property => (
                  <option key={property.id} value={property.id}>{property.label || "Connected project"}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mt-3 grid gap-2 text-xs font-medium text-black/50">
            Helpful link <span className="font-normal text-black/35">(optional)</span>
            <span className="relative">
              <Link2 size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-black/30" />
              <input
                value={link}
                onChange={event => setLink(event.target.value)}
                disabled={readOnly}
                type="url"
                className={`${CONTROL} pl-9`}
                placeholder="https://"
              />
            </span>
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-xs text-black/50">{notice}</p>
            <button
              type="submit"
              disabled={readOnly || busy || !message.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#1b1a18] px-5 text-sm font-medium text-white disabled:opacity-45"
            >
              <Send size={14} aria-hidden="true" />
              {readOnly ? "Customer can send this" : busy ? "Sending..." : "Send update"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function CustomerProjectBriefForm({
  clientId,
  initialBrief,
  readOnly = false,
  providerName = "Milesymedia",
}: {
  clientId: string;
  initialBrief: CustomerProjectBrief;
  readOnly?: boolean;
  providerName?: string;
}) {
  const [brief, setBrief] = useState<CustomerProjectBrief>(initialBrief);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function field(name: keyof CustomerProjectBrief, value: string) {
    setBrief(current => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/customer-project-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, brief }),
      });
      const payload = await response.json() as {
        ok: boolean;
        error?: string;
        brief?: CustomerProjectBrief;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not save your brief.");
      if (payload.brief) setBrief(payload.brief);
      setNotice(`Saved. The ${providerName} team can see your latest answers.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not save your brief.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="project-brief" onSubmit={submit} className="mt-5 scroll-mt-24 rounded-md border border-black/10 bg-[#fbfaf8] p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Project brief</p>
          <h2 className="mt-2 font-serif text-2xl">Help us understand your world.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/48">
            Short, honest answers are perfect. You can return and refine them whenever something changes.
          </p>
        </div>
        {brief.submittedAt ? (
          <p className="text-xs text-black/38">Updated {formatShortDate(brief.submittedAt)}</p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <BriefField
          label="What does your business do?"
          value={brief.businessOverview ?? ""}
          onChange={value => field("businessOverview", value)}
          placeholder="A simple description in your own words."
          readOnly={readOnly}
        />
        <BriefField
          label="What should this project achieve?"
          value={brief.primaryGoal ?? ""}
          onChange={value => field("primaryGoal", value)}
          placeholder="More enquiries, bookings, sales, trust, time saved..."
          readOnly={readOnly}
        />
        <BriefField
          label="Who should choose you?"
          value={brief.idealCustomer ?? ""}
          onChange={value => field("idealCustomer", value)}
          placeholder="Tell us about the people you most want to reach."
          readOnly={readOnly}
        />
        <BriefField
          label="What must it include?"
          value={brief.mustHaves ?? ""}
          onChange={value => field("mustHaves", value)}
          placeholder="Pages, bookings, ecommerce, integrations or key details."
          readOnly={readOnly}
        />
        <BriefField
          label="Is there an important date?"
          value={brief.launchTiming ?? ""}
          onChange={value => field("launchTiming", value)}
          placeholder="A launch, event or ideal timeframe."
          compact
          readOnly={readOnly}
        />
        <BriefField
          label="Anything else we should know?"
          value={brief.additionalNotes ?? ""}
          onChange={value => field("additionalNotes", value)}
          placeholder="Preferences, concerns, context or useful details."
          compact
          readOnly={readOnly}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
        <p aria-live="polite" className="text-xs text-black/50">{notice}</p>
        <button
          type="submit"
          disabled={readOnly || busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#1b1a18] px-5 text-sm font-medium text-white disabled:opacity-45"
        >
          <Save size={15} aria-hidden="true" />
          {readOnly ? "Customer can update this" : busy ? "Saving..." : "Save project brief"}
        </button>
      </div>
    </form>
  );
}

function BriefField({
  label,
  value,
  onChange,
  placeholder,
  compact = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  compact?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="grid gap-2 text-xs font-medium text-black/55">
      {label}
      <textarea
        value={value}
        disabled={readOnly}
        onChange={event => onChange(event.target.value)}
        className={`${CONTROL} ${compact ? "min-h-24" : "min-h-32"} resize-y py-3 leading-6`}
        placeholder={placeholder}
      />
    </label>
  );
}

export function CustomerApprovals({
  clientId,
  initialApprovals,
  readOnly = false,
  providerName = "Milesymedia",
}: {
  clientId: string;
  initialApprovals: ClientApproval[];
  readOnly?: boolean;
  providerName?: string;
}) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function respond(approvalId: string, action: "approve" | "request-changes") {
    setBusyId(approvalId);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          approvalId,
          action,
          responseNote: note[approvalId] ?? "",
        }),
      });
      const payload = await response.json() as {
        ok: boolean;
        error?: string;
        approvals?: ClientApproval[];
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not record your response.");
      setApprovals(payload.approvals ?? approvals);
      setNotice(action === "approve"
        ? `Approved. ${providerName} has been notified.`
        : `Your requested changes are with the ${providerName} team.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not record your response.");
    } finally {
      setBusyId(null);
    }
  }

  if (approvals.length === 0) return null;
  return (
    <section id="approvals" className="mt-5 scroll-mt-24 overflow-hidden rounded-md border border-black/10 bg-white">
      <div className="border-b border-black/10 px-6 py-5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Decisions</p>
        <h2 className="mt-2 font-serif text-2xl">Approvals</h2>
        <p className="mt-2 text-sm leading-6 text-black/48">Clear decisions keep the project moving without ambiguity.</p>
      </div>
      <ul className="divide-y divide-black/8">
        {approvals.map(approval => (
          <li key={approval.id} className="grid gap-4 px-6 py-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{approval.title}</p>
                <span className={[
                  "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide",
                  approval.status === "approved"
                    ? "bg-emerald-50 text-emerald-800"
                    : approval.status === "changes-requested"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-[#f5efe2] text-[#765b2d]",
                ].join(" ")}>{approval.status.replaceAll("-", " ")}</span>
              </div>
              {approval.detail && <p className="mt-3 max-w-2xl text-sm leading-6 text-black/52">{approval.detail}</p>}
              {approval.responseNote && <p className="mt-3 text-xs leading-5 text-black/45">Response: {approval.responseNote}</p>}
            </div>
            {approval.status === "pending" && !readOnly ? (
              <div>
                <textarea
                  value={note[approval.id] ?? ""}
                  onChange={event => setNote(current => ({ ...current, [approval.id]: event.target.value }))}
                  className={`${CONTROL} min-h-24 resize-y py-3`}
                  placeholder="Optional note or requested change"
                  aria-label={`Response note for ${approval.title}`}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void respond(approval.id, "request-changes")}
                    disabled={busyId === approval.id}
                    className="min-h-10 rounded-md border border-black/10 px-4 text-xs font-medium text-black/55 disabled:opacity-45"
                  >
                    Request changes
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(approval.id, "approve")}
                    disabled={busyId === approval.id}
                    className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1b1a18] px-4 text-xs font-medium text-white disabled:opacity-45"
                  >
                    <Check size={13} aria-hidden="true" />
                    Approve
                  </button>
                </div>
              </div>
            ) : approval.status === "pending" ? (
              <p className="text-xs leading-5 text-black/40">The customer will answer this in their signed-in portal.</p>
            ) : null}
          </li>
        ))}
      </ul>
      {notice && <p aria-live="polite" className="border-t border-black/10 px-6 py-3 text-xs text-black/50">{notice}</p>}
    </section>
  );
}

export function CustomerSupportForm({
  clientId,
  initialRequests,
  readOnly = false,
  providerName = "Milesymedia",
}: {
  clientId: string;
  initialRequests: ClientRequest[];
  readOnly?: boolean;
  providerName?: string;
}) {
  const [type, setType] = useState<ClientRequestType>("support-ticket");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, type, message, link: link.trim() || undefined }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; requests?: ClientRequest[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not send your request.");
      setRequests(payload.requests ?? requests);
      setMessage("");
      setLink("");
      setNotice(`Your request is with the ${providerName} team.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  async function reply(requestId: string) {
    const message = replyDrafts[requestId]?.trim();
    if (!message) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, requestId, reply: message }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; requests?: ClientRequest[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not send your reply.");
      setRequests(payload.requests ?? requests);
      setReplyDrafts(current => ({ ...current, [requestId]: "" }));
      setNotice(`Your reply is with the ${providerName} team.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not send your reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="support-request" className="grid scroll-mt-24 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={submit} className="border-t border-black/10 pt-6" aria-disabled={readOnly}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-xs font-medium text-black/55">
            What can we help with?
            <select disabled={readOnly} value={type} onChange={event => setType(event.target.value as ClientRequestType)} className={CONTROL}>
              <option value="support-ticket">Something is not working</option>
              <option value="design-feedback">Design feedback</option>
              <option value="suggestion">Idea or request</option>
              <option value="move-provider">Handover to another provider</option>
              <option value="cancel">Cancel a service</option>
            </select>
          </label>
          <label className="grid gap-2 text-xs font-medium text-black/55">
            Helpful link <span className="font-normal text-black/35">(optional)</span>
            <span className="relative">
              <Link2 size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-black/35" />
              <input disabled={readOnly} value={link} onChange={event => setLink(event.target.value)} type="url" className={`${CONTROL} pl-9`} placeholder="https://" />
            </span>
          </label>
        </div>
        <label className="mt-4 grid gap-2 text-xs font-medium text-black/55">
          Tell us what you need
          <textarea
            value={message}
            disabled={readOnly}
            onChange={event => setMessage(event.target.value)}
            className={`${CONTROL} min-h-36 resize-y py-3`}
            placeholder="A few clear details are perfect. We will take it from here."
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-xs text-black/50">{notice}</p>
          <button
            type="submit"
            disabled={readOnly || busy || !message.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#1b1a18] px-5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-45"
          >
            <Send size={15} aria-hidden="true" />
            {readOnly ? "Customer can send this" : busy ? "Sending..." : `Send to ${providerName}`}
          </button>
        </div>
      </form>

      <aside className="border-l-0 border-black/10 xl:border-l xl:pl-6">
        <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Recent requests</p>
        {requests.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-black/50">Nothing open. When you need us, start here.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {requests.slice(0, 5).map(request => (
              <li key={request.id} className="rounded-md border border-black/10 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium capitalize">{request.type.replaceAll("-", " ")}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-black/40">
                    <CheckCircle2 size={12} aria-hidden="true" />
                    {request.status === "reviewed" ? `with ${providerName}` : request.status === "closed" ? "resolved" : "open"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-black/50">{request.message}</p>
                {request.link && (
                  <a href={request.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--portal-accent)]">
                    Open link <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                )}
                {request.replies?.length ? (
                  <div className="mt-3 grid gap-2 border-t border-black/8 pt-3">
                    {request.replies.map(item => (
                      <div key={item.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                            {item.from === "milesymedia" ? providerName : "You"}
                          </span>
                          <span className="text-[10px] text-black/30">{formatShortDate(item.createdAt)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/60">{item.message}</p>
                        {item.attachments?.map(attachment => <ReplyMedia key={attachment.id} attachment={attachment} />)}
                      </div>
                    ))}
                  </div>
                ) : null}
                {request.status !== "closed" ? (
                  <div className="mt-3 border-t border-black/8 pt-3">
                    <textarea
                      value={replyDrafts[request.id] ?? ""}
                      onChange={event => setReplyDrafts(current => ({ ...current, [request.id]: event.target.value }))}
                      disabled={readOnly}
                      rows={2}
                      aria-label={`Reply to ${request.type.replaceAll("-", " ")}`}
                      placeholder="Continue the conversation"
                      className={`${CONTROL} min-h-20 resize-y py-2`}
                    />
                    <button
                      type="button"
                      onClick={() => void reply(request.id)}
                      disabled={readOnly || busy || !replyDrafts[request.id]?.trim()}
                      className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-md bg-[#1b1a18] px-3 text-xs font-medium text-white disabled:opacity-45"
                    >
                      <Send size={13} aria-hidden="true" />
                      Reply
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function ReplyMedia({ attachment }: { attachment: import("@/lib/inbox/media").InboxOutboundAttachment }) {
  if (attachment.kind === "image") return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 block"><img src={attachment.url} alt={attachment.name} className="max-h-48 max-w-full rounded-md object-contain" /></a>;
  if (attachment.kind === "audio") return <audio controls preload="metadata" src={attachment.url} className="mt-2 h-9 max-w-full" />;
  return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--portal-accent)]">{attachment.name} <ArrowUpRight size={12} /></a>;
}

export function CustomerFileLinkForm({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("inspiration");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "upload" ? !file : (!name.trim() || !url.trim())) return;
    setBusy(true);
    setNotice(null);
    try {
      let response: Response;
      if (mode === "upload" && file) {
        const form = new FormData();
        form.set("clientId", clientId);
        form.set("category", category);
        form.set("file", file);
        response = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
      } else {
        response = await fetch("/api/tenants/client-files", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            action: "add",
            file: { name, url, category },
          }),
        });
      }
      const payload = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not add that file.");
      setFile(null);
      setName("");
      setUrl("");
      setNotice("Added to your project files.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not add that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-black/10 pt-5">
      <div className="mb-4 inline-flex rounded-md border border-black/10 bg-black/[0.025] p-0.5">
        <button type="button" disabled={readOnly} onClick={() => setMode("upload")} className={`inline-flex min-h-9 items-center gap-2 rounded px-3 text-xs font-medium disabled:opacity-45 ${mode === "upload" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>
          <Upload size={13} aria-hidden="true" /> Upload
        </button>
        <button type="button" disabled={readOnly} onClick={() => setMode("link")} className={`inline-flex min-h-9 items-center gap-2 rounded px-3 text-xs font-medium disabled:opacity-45 ${mode === "link" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>
          <Link2 size={13} aria-hidden="true" /> Add link
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
        {mode === "upload" ? (
          <label className="grid gap-2 text-xs font-medium text-black/55">
            Choose a file <span className="font-normal text-black/35">PDF, document, image, video or text · up to 50 MB</span>
            <input
              type="file"
              disabled={readOnly}
              onChange={event => setFile(event.target.files?.[0] ?? null)}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.heif,.csv,.txt,.mp4,.zip"
              className={`${CONTROL} cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-black/[0.05] file:px-3 file:py-1 file:text-xs`}
            />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-medium text-black/55">
              Name
              <input disabled={readOnly} value={name} onChange={event => setName(event.target.value)} className={CONTROL} placeholder="Homepage inspiration" />
            </label>
            <label className="grid gap-2 text-xs font-medium text-black/55">
              Link
              <input disabled={readOnly} value={url} onChange={event => setUrl(event.target.value)} type="url" className={CONTROL} placeholder="https://" />
            </label>
          </div>
        )}
      <label className="grid gap-2 text-xs font-medium text-black/55">
        Type
        <select disabled={readOnly} value={category} onChange={event => setCategory(event.target.value)} className={CONTROL}>
          <option value="inspiration">Inspiration</option>
          <option value="design-feedback">Design feedback</option>
          <option value="brief">Brief</option>
          <option value="recording">Recording</option>
          <option value="misc">Other</option>
        </select>
      </label>
      <button type="submit" disabled={readOnly || busy || (mode === "upload" ? !file : (!name.trim() || !url.trim()))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#1b1a18] px-4 text-sm font-medium text-white disabled:opacity-45">
        {mode === "upload" ? <Upload size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
        {readOnly ? "Customer can add files" : busy ? "Adding..." : mode === "upload" ? "Upload file" : "Add link"}
      </button>
      </div>
      {notice && <p aria-live="polite" className="mt-3 text-xs text-black/50">{notice}</p>}
    </form>
  );
}

export function CustomerAgreements({
  clientId,
  initialContracts,
  readOnly = false,
  providerName = "Milesymedia",
}: {
  clientId: string;
  initialContracts: ClientContract[];
  readOnly?: boolean;
  providerName?: string;
}) {
  const [contracts, setContracts] = useState(initialContracts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = contracts.filter(contract => contract.status !== "draft");

  async function respond(contractId: string, action: "accept" | "decline") {
    setBusyId(contractId);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, contractId, action }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; contracts?: ClientContract[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not update the agreement.");
      setContracts(payload.contracts ?? contracts);
      setNotice(action === "accept"
        ? "Thank you. Your acceptance has been recorded."
        : `Your response has been sent to ${providerName}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not update the agreement.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-md border border-black/10 bg-white">
      <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Your record</p>
          <h2 className="mt-2 font-serif text-2xl">Agreements</h2>
        </div>
        <FileSignature size={19} className="text-[var(--portal-accent)]" aria-hidden="true" />
      </div>
      {visible.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-serif text-xl">No agreements need your attention.</p>
          <p className="mt-2 text-sm text-black/45">Any agreement {providerName} sends will appear here with its status.</p>
        </div>
      ) : (
        <ul className="divide-y divide-black/8">
          {visible.map(contract => (
            <li key={contract.id} className="grid gap-5 px-6 py-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{contract.title}</p>
                  <span className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    contract.status === "accepted"
                      ? "bg-emerald-50 text-emerald-800"
                      : contract.status === "declined"
                        ? "bg-red-50 text-red-700"
                        : "bg-[#f5efe2] text-[#765b2d]",
                  ].join(" ")}>
                    {contract.status}
                  </span>
                  <span className="text-[10px] text-black/35">Version {contract.version ?? 1}</span>
                </div>
                {contract.summary && <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">{contract.summary}</p>}
                {contract.body && (
                  <details className="mt-4 max-w-3xl rounded-md border border-black/10 bg-[#faf9f6] px-4 py-3">
                    <summary className="cursor-pointer text-xs font-medium text-black/65">Review the full terms</summary>
                    <div className="mt-4 whitespace-pre-wrap border-t border-black/10 pt-4 text-sm leading-7 text-black/65">
                      {contract.body}
                    </div>
                  </details>
                )}
                {contract.acceptedAt && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    {/* Bound to the version that was on screen when they agreed —
                        an amendment resets the agreement, it does not inherit
                        this acceptance. */}
                    Accepted version {contract.acceptedVersion ?? contract.version ?? 1} on {formatShortDate(contract.acceptedAt)}
                  </p>
                )}
                {contract.status === "sent" && !contractHasReviewableTerms(contract) && (
                  <p className="mt-3 text-xs text-amber-800">
                    There are no terms attached to this agreement yet, so there is nothing to accept.
                    {" "}{providerName} will add the terms before asking you to agree.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {contract.documentUrl && (
                  <a href={contract.documentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-4 text-xs font-medium">
                    Review document <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
                {contract.status === "sent" && contractHasReviewableTerms(contract) && !readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => void respond(contract.id, "decline")}
                      disabled={busyId === contract.id}
                      className="min-h-10 rounded-md border border-black/10 px-4 text-xs font-medium text-black/55 disabled:opacity-45"
                    >
                      Query agreement
                    </button>
                    <button
                      type="button"
                      onClick={() => void respond(contract.id, "accept")}
                      disabled={busyId === contract.id}
                      className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1b1a18] px-4 text-xs font-medium text-white disabled:opacity-45"
                    >
                      <Check size={13} aria-hidden="true" />
                      {busyId === contract.id ? "Recording..." : "Accept"}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {notice && <p aria-live="polite" className="border-t border-black/10 px-6 py-3 text-xs text-black/50">{notice}</p>}
    </section>
  );
}
