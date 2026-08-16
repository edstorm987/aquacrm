"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Save, StickyNote } from "lucide-react";

type NoteKey = "notes" | "sessionNotes" | "meetingNotes" | "supportNotes";

const FIELDS: Array<{ key: NoteKey; label: string; detail: string }> = [
  { key: "notes", label: "Working notes", detail: "General internal context and loose observations." },
  { key: "meetingNotes", label: "Meeting notes", detail: "Decisions, questions, and commitments from meetings." },
  { key: "sessionNotes", label: "Session notes", detail: "Discovery, strategy, and relationship context." },
  { key: "supportNotes", label: "Support notes", detail: "Recurring issues, preferences, and service context." },
];

export function ClientNotesWorkspace({ clientId, initial }: { clientId: string; initial: Record<NoteKey, string> }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const populatedCount = FIELDS.filter(field => notes[field.key].trim()).length;

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tenants/client-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, notes }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save notes.");
      setMessage("Notes saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save notes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="group border-y border-black/10" data-testid="client-private-notes">
      <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 py-4 marker:hidden">
        <span className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/48"><StickyNote size={18} /></span><span className="min-w-0"><strong className="block text-sm font-semibold text-black/78">Internal working notes</strong><span className="mt-0.5 block text-xs leading-5 text-black/42">Private scratchpads for loose context. {populatedCount ? `${populatedCount} of ${FIELDS.length} contain notes.` : "No notes recorded yet."}</span></span></span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-black/48">Open scratchpads <ChevronDown size={16} className="transition-transform group-open:rotate-180" /></span>
      </summary>
      <section className="grid gap-5 border-t border-black/10 pb-6 pt-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm leading-6 text-black/52">These notes remain internal across Journey and Fulfilment. Add a clean, dated record above when a decision or update should enter the permanent history or client portal.</p>
          <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-45"><Save size={15} /> {busy ? "Saving..." : "Save notes"}</button>
        </header>
        {message ? <p role="status" className={`border-l-2 px-3 py-2 text-sm ${message === "Notes saved." ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-800"}`}>{message}</p> : null}
        <div className="grid gap-5 lg:grid-cols-2">
          {FIELDS.map(field => <label key={field.key} className="block"><span className="text-sm font-semibold text-black/72">{field.label}</span><span className="mt-0.5 block text-xs text-black/40">{field.detail}</span><textarea value={notes[field.key]} onChange={event => setNotes(current => ({ ...current, [field.key]: event.target.value }))} rows={7} className="mt-2 w-full resize-y rounded-md border border-black/12 bg-white px-3 py-3 text-sm leading-6 text-black/72 outline-none focus:border-brand" /></label>)}
        </div>
      </section>
    </details>
  );
}
