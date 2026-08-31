"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronDown, Mail, MessageSquare, Phone, Plus, ShieldCheck, ShieldAlert, StickyNote, Trash2 } from "lucide-react";

import {
  INTERACTION_LABELS,
  type PersonInteraction,
} from "@/lib/inbox/personInteractions";

/**
 * Everything this person has said to us, on the same screen as the buttons
 * that classify them.
 *
 * Without this the card asks for a decision — sales, supplier, spam — while
 * showing none of the message it is asking you to judge. The first enquiry is
 * expanded by default for exactly that reason: the common case is one enquiry
 * awaiting classification, and making you click to read it is one click too
 * many when the whole point is to see it.
 */
export function Interactions({ interactions, personId, complete = true }: { interactions: PersonInteraction[]; personId: string; complete?: boolean }) {
  // A refused enquiry read left this list short — and, when nothing else was
  // hand-recorded, empty. "Nothing recorded yet" would then be a claim about
  // the relationship built on a read that never happened (issues #57).
  const incomplete = complete ? null : (
    <p role="status" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
      Enquiries could not be read, so this timeline is incomplete. Reload before deciding what this person is.
    </p>
  );

  if (!interactions.length) {
    return (
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="text-sm font-semibold text-black/80">Interactions</h2>
        {complete ? (
          <p className="mt-2 text-sm text-black/45">
            Nothing recorded yet. Enquiries, replies, calls and meetings appear here as they happen.
          </p>
        ) : incomplete}
        <AddRecord personId={personId} />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4" data-testid="interactions">
      <h2 className="text-sm font-semibold text-black/80">
        Interactions <span className="ml-1 font-normal text-black/40">({interactions.length})</span>
      </h2>
      <p className="mt-1 text-xs text-black/50">
        Everything this person has sent or been sent — read it before deciding what they are.
      </p>
      {incomplete}

      <ol className="mt-3 flex flex-col gap-2">
        {interactions.map((interaction, index) => (
          <InteractionRow
            key={interaction.id}
            interaction={interaction}
            // The newest enquiry is what you are almost certainly here to read.
            defaultOpen={index === 0 && interaction.kind === "enquiry"}
          />
        ))}
      </ol>

      <AddRecord personId={personId} />
    </section>
  );
}

/**
 * Log a meeting, call or note against this person.
 *
 * Available before they are a client on purpose — this is the record of a
 * relationship being built, and it seeds the client record when they convert.
 * Waiting until conversion would mean the months of work that won them are
 * missing from the workspace that needs them most.
 */
function AddRecord({ personId }: { personId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"meeting" | "call" | "note">("meeting");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/portal/persons/${encodeURIComponent(personId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add-record", kind, summary, body, outcome }),
      });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "That did not save.");
      setSummary(""); setBody(""); setOutcome(""); setOpen(false);
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-black/15 px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.035]"
      >
        <Plus size={13} aria-hidden />Log a meeting, call or note
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-black/15 p-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="What are you recording?">
        {([
          ["meeting", "Meeting", CalendarDays],
          ["call", "Call", Phone],
          ["note", "Note", StickyNote],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${
              kind === value ? "bg-black text-white" : "border border-black/15 text-black/65"
            }`}
          >
            <Icon size={13} aria-hidden />{label}
          </button>
        ))}
      </div>

      <input
        value={summary}
        onChange={event => setSummary(event.target.value)}
        placeholder={kind === "meeting" ? "Discovery call at their office" : kind === "call" ? "Called about the quote" : "What happened"}
        aria-label="Summary"
        className="mt-2 h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
      />
      <textarea
        value={body}
        onChange={event => setBody(event.target.value)}
        rows={3}
        placeholder="Anything worth remembering"
        aria-label="Detail"
        className="mt-2 w-full resize-y rounded-md border border-black/12 px-3 py-2 text-sm leading-6 outline-none focus:border-brand"
      />
      <input
        value={outcome}
        onChange={event => setOutcome(event.target.value)}
        placeholder="Outcome — what happens next"
        aria-label="Outcome"
        className="mt-2 h-10 w-full rounded-md border border-black/12 px-3 text-sm outline-none focus:border-brand"
      />

      {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy || !summary.trim()}
          onClick={() => void save()}
          className="inline-flex h-9 items-center rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="inline-flex h-9 items-center rounded-md border border-black/15 px-3 text-xs font-semibold text-black/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function InteractionRow({
  interaction,
  defaultOpen,
}: {
  interaction: PersonInteraction;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = interaction.kind === "call"
    ? Phone
    : interaction.kind === "reply"
      ? Mail
      : MessageSquare;

  const consent = interaction.fields.find(field => field.label === "Consent given");
  const consentGiven = consent?.value.startsWith("Yes");

  return (
    <li className="overflow-hidden rounded-md border border-black/10">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-black/[0.02]"
      >
        <Icon size={15} className="shrink-0 text-black/35" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-black/82">{interaction.summary}</strong>
            <span className="rounded bg-black/6 px-1.5 py-0.5 text-[11px] text-black/55">
              {INTERACTION_LABELS[interaction.kind]}
            </span>
            {/* Consent is shown on the collapsed row too — it changes what you
                are allowed to do, so it should not need a click to discover. */}
            {consent ? (
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                  consentGiven ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                }`}
              >
                {consentGiven
                  ? <ShieldCheck size={11} aria-hidden />
                  : <ShieldAlert size={11} aria-hidden />}
                {consentGiven ? "Consented" : consent.value === "No" ? "No consent" : "Consent unknown"}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-black/45">
            {new Date(interaction.at).toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
            {interaction.source ? ` · ${interaction.source}` : ""}
          </span>
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={`shrink-0 text-black/30 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t border-black/[0.07] bg-black/[0.012] px-3 py-3">
          {interaction.body ? (
            <blockquote className="whitespace-pre-wrap rounded border-l-2 border-black/15 bg-white px-3 py-2 text-sm leading-6 text-black/75">
              {interaction.body}
            </blockquote>
          ) : null}

          <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {interaction.fields.map(field => (
              <div key={field.label} className="flex min-w-0 gap-2 text-xs">
                <dt className="shrink-0 text-black/40">{field.label}</dt>
                <dd className={`min-w-0 break-words ${field.important ? "font-semibold text-black/85" : "text-black/70"}`}>
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>

          {interaction.href ? (
            <Link
              href={interaction.href}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-black/55 hover:text-black"
            >
              Open in the inbox <ArrowUpRight size={12} aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
