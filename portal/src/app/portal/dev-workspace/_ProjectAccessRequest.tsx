"use client";

import Link from "next/link";
import { LockKeyhole, Send } from "lucide-react";
import { useState } from "react";

import type { AccessEnvironment } from "@/server/types";

export function ProjectAccessRequest({
  projectId,
  environment,
}: {
  projectId: string;
  environment: AccessEnvironment;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/access/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: { kind: "project", id: projectId },
          environment,
          capabilities: ["project.view", "element.project.editor.view"],
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || payload?.error || "The access request could not be sent.");
      }
      setSent(true);
      setReason("");
      setMessage("Request sent. Access remains locked until an authorised reviewer approves it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The access request could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#0f1210] px-4 py-8 text-white sm:px-6 lg:grid lg:place-items-center">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl sm:p-7">
        <span aria-hidden className="grid size-11 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><LockKeyhole size={20} /></span>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-200/70">Exact project boundary</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">This Dev Workspace needs permission.</h1>
        <p className="mt-3 text-sm leading-6 text-white/55">Your account is valid, but this project and its editor have not been shared with you. Requesting access does not unlock anything until it is approved.</p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
            <p role="status" className="text-sm font-medium text-emerald-100">{message}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-3">
            <label htmlFor="project-access-reason" className="text-xs font-semibold text-white/70">Why do you need this project?</label>
            <textarea
              id="project-access-reason"
              required
              minLength={8}
              maxLength={1000}
              rows={4}
              value={reason}
              onChange={event => setReason(event.target.value)}
              className="w-full resize-y rounded-lg border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus-visible:ring-2 focus-visible:ring-cyan-300"
              placeholder="Explain the work you have been asked to do."
            />
            <button disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-bold text-[#0b1415] outline-none hover:bg-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1210] disabled:opacity-50 sm:w-fit">
              <Send size={15} /> {busy ? "Sending…" : "Request editor access"}
            </button>
          </form>
        )}

        {!sent && message ? <p role="alert" className="mt-4 text-sm text-rose-200">{message}</p> : null}
        <Link href="/portal/dev-workspace" className="mt-6 inline-flex min-h-10 items-center text-sm font-semibold text-white/55 hover:text-white">Back to my projects</Link>
      </section>
    </main>
  );
}
