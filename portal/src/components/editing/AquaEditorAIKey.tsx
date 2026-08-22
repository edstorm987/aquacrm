"use client";

import { useEffect, useRef, useState } from "react";
import { Check, KeyRound, LoaderCircle, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";

import type { EditorAiStatus } from "@/server/types";
import {
  clearEditorAiKey,
  saveEditorAiSettings,
  setEditorAiKey,
  type EditorAiConfigResult,
} from "@/components/editing/editorAiClient";
import {
  ACCENT_BG,
  ACCENT_TEXT,
  BODY,
  CHIP_BUTTON,
  DANGER_BUTTON,
  FIELD,
  FOCUS_RING,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  STRONG,
} from "@/components/editing/editorAiSkin";

// ─── AQUA EDITOR AI — its own key, on this project ───────────────────────────
//
// Ed: "needs a seperate tocken please to configure please … and its saved per
// project this one is".
//
// This is that surface. It configures ONE project's assistant: its key, its
// model, its brief. It is not the agency assistant's settings, and pasting a
// key here does not switch the Aqua Advisor on.
//
// ── What this screen may know about the key ──────────────────────────────────
//
// Whether one is SET, and at most `••••` plus the last four characters — and
// only when the stored key is long enough that four characters are a hint
// rather than a fraction of the secret. That masked tail arrives on
// `EditorAiStatus`, which is the only shape the server lets across and has no
// field a key could occupy.
//
// The value itself is never read back. It cannot be: no GET exists on the
// route, and nothing returns it — not even the POST that just set it, because
// an operator confirming a paste is exactly the moment a value ends up in a
// screenshot. So the input below is WRITE-ONLY. It is never seeded from
// `tokenHint`, it is cleared the instant a save succeeds, and it is typed
// `password` with autocomplete off so a browser does not offer to remember it
// somewhere this code cannot see.

export function AquaEditorAIKey({
  projectId,
  projectName,
  status,
  reason,
  vaultAvailable,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  status: EditorAiStatus | null;
  /** Why it is off, in the server's words. Empty when it is on. */
  reason: string;
  /** False when this deployment has no vault, so a key cannot be stored at all. */
  vaultAvailable: boolean;
  onChanged: (result: EditorAiConfigResult) => void;
}) {
  // The server has not yet said what THIS project's setup is.
  //
  // After an in-editor project switch, the `status` in hand belongs to the
  // PREVIOUS project for one round-trip. Nothing below may render or seed a
  // credential fact from it — not the masked key tail, not the vault label,
  // not the model, not the brief — because project B wearing project A's
  // facts is exactly the bleed "saved per project" exists to prevent. The
  // forms stay shut too: `save` treats an empty brief as "clear the brief",
  // and saving a box this panel has never read would delete somebody's
  // instructions on their behalf.
  const unread = status?.projectId !== projectId;

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(unread ? "" : status?.model ?? "");
  const [instructions, setInstructions] = useState(unread ? "" : status?.instructions ?? "");
  const [busy, setBusy] = useState<"key" | "settings" | "clear" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // Seed the fields from the server's answer, ONCE per (project, answered
  // project) pair.
  //
  // Two things make this a ref compare rather than a plain effect body. React 19
  // Strict Mode invokes an effect twice on mount, so the guard has to give the
  // same answer however many times it runs — a consumable boolean would be spent
  // by the first invocation. And re-seeding on every `status` change would wipe
  // the success notice a save had just set, because `onChanged` re-renders this
  // component with the new status in the same tick.
  const seededFor = useRef("");
  useEffect(() => {
    const fresh = status?.projectId === projectId;
    // A stale answer counts as NO answer: the pair records "this project,
    // nothing heard yet", so the previous project's status can never seed
    // these fields, and this project's own answer re-runs the seed when it
    // lands.
    const answered = `${projectId}|${fresh ? status?.projectId ?? "" : ""}`;
    if (seededFor.current === answered) return;
    seededFor.current = answered;
    setModel(fresh ? status?.model ?? "" : "");
    setInstructions(fresh ? status?.instructions ?? "" : "");
    // A pasted key never survives a project changing under the panel.
    setApiKey("");
    setConfirmClear(false);
  }, [projectId, status?.projectId, status?.model, status?.instructions]);

  // Unread means UNKNOWN, not "not configured" — a stale status saying
  // "configured" is a fact about the previous project.
  const configured = !unread && Boolean(status?.configured);

  async function run(kind: "key" | "settings" | "clear", work: () => Promise<EditorAiConfigResult>, done: string) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const result = await work();
      // Cleared FIRST, before anything re-renders with it in hand. There is no
      // state in this component that outlives a successful save holding a key.
      setApiKey("");
      setConfirmClear(false);
      onChanged(result);
      setNotice(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pb-1">
      {/* ── Where it stands ─────────────────────────────────────────────── */}
      <div className={`${PANEL} p-3`}>
        <p className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${ACCENT_TEXT}`}>
          <KeyRound size={12} aria-hidden /> Its own key
        </p>
        <p className={`mt-2 text-[11px] leading-5 ${BODY}`}>
          Aqua Editor AI runs on a key of its own, saved against{" "}
          <strong className={`font-semibold ${STRONG}`}>{projectName || "this project"}</strong> and nothing else.
          It is separate from the agency assistant: a key here does not switch the Aqua Advisor on, and the
          Advisor&apos;s key does not switch this on.
        </p>

        {unread ? null : (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {configured ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-300/[0.08] px-2 py-1 font-semibold text-emerald-200">
                <ShieldCheck size={12} aria-hidden /> Key set
              </span>
              {status?.tokenHint ? (
                <span className={`font-mono ${MUTED}`} title="The last four characters. The key itself is never shown.">
                  {status.tokenHint}
                </span>
              ) : null}
              {status?.connectionLabel ? <span className={MUTED}>· {status.connectionLabel}</span> : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/[0.08] px-2 py-1 font-semibold text-amber-200">
              <TriangleAlert size={12} aria-hidden /> Not configured
            </span>
          )}
        </p>
        )}

        {/* The server's sentence, never one invented here, so the setup screen
            and the editor cannot end up saying different things. A stale
            sentence is about the previous project, so it waits with the rest. */}
        {reason && !unread ? <p className={`mt-2 text-[11px] leading-5 ${BODY}`}>{reason}</p> : null}
      </div>

      {/* ── Not configured: say what to actually do ──────────────────────── */}
      {!unread && !configured ? (
        <ol className={`${PANEL} grid gap-2 p-3 text-[11px] leading-5 ${BODY}`}>
          <li className="grid grid-cols-[16px_minmax(0,1fr)] gap-2">
            <span className={`font-mono font-semibold ${ACCENT_TEXT}`}>1</span>
            <span>Create an API key with your model provider. Aqua Editor AI uses an OpenAI-compatible key.</span>
          </li>
          <li className="grid grid-cols-[16px_minmax(0,1fr)] gap-2">
            <span className={`font-mono font-semibold ${ACCENT_TEXT}`}>2</span>
            <span>Paste it below and save. It is encrypted into the integrations vault — it is never stored on the project record and never sent back to this screen.</span>
          </li>
          <li className="grid grid-cols-[16px_minmax(0,1fr)] gap-2">
            <span className={`font-mono font-semibold ${ACCENT_TEXT}`}>3</span>
            <span>Every other project keeps its own key, or none. Switching project here switches assistant.</span>
          </li>
        </ol>
      ) : null}

      {unread ? (
        <p className={`flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11px] ${MUTED}`}>
          <LoaderCircle size={12} className="animate-spin" aria-hidden /> Reading this project&apos;s setup…
        </p>
      ) : null}

      {!vaultAvailable ? (
        <p className="rounded-md border border-amber-300/30 bg-amber-300/[0.07] px-2.5 py-2 text-[11px] leading-5 text-amber-100">
          The credential vault is not configured on this deployment, so a key cannot be stored yet.
        </p>
      ) : null}

      {/* ── Paste a key ──────────────────────────────────────────────────── */}
      <form
        className={`${PANEL} grid gap-2 p-3`}
        onSubmit={event => {
          event.preventDefault();
          if (!apiKey.trim()) return;
          void run("key", () => setEditorAiKey({ projectId, apiKey: apiKey.trim(), model, instructions }), "Key saved for this project.");
        }}
      >
        <label className={`grid gap-1.5 text-[11px] font-semibold ${MUTED}`} htmlFor="aqua-editor-ai-key">
          {configured ? "Replace the key" : "Paste the key"}
        </label>
        <input
          id="aqua-editor-ai-key"
          // WRITE-ONLY. Never seeded from `tokenHint`, and emptied on success.
          type="password"
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          disabled={busy !== null || unread || !vaultAvailable}
          className={`${FIELD} ${FOCUS_RING} font-mono disabled:opacity-50`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!apiKey.trim() || busy !== null || unread || !vaultAvailable}
            className={`${PRIMARY_BUTTON} ${ACCENT_BG} ${FOCUS_RING}`}
          >
            {busy === "key" ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
            {configured ? "Replace key" : "Save key"}
          </button>
          {configured ? (
            confirmClear ? (
              <>
                <button
                  type="button"
                  onClick={() => void run("clear", () => clearEditorAiKey(projectId), "Key removed. The model and brief were kept.")}
                  disabled={busy !== null}
                  className={`${DANGER_BUTTON} ${FOCUS_RING}`}
                >
                  {busy === "clear" ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <Trash2 size={12} aria-hidden />}
                  Remove it
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className={`${CHIP_BUTTON} ${FOCUS_RING}`}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className={`${DANGER_BUTTON} ${FOCUS_RING}`}>
                <Trash2 size={12} aria-hidden /> Remove key
              </button>
            )
          ) : null}
        </div>
        <p className={`text-[10px] leading-4 ${MUTED}`}>
          Stored encrypted, resolved on the server for each request. This screen can only ever be told whether a key
          is set — never what it is.
        </p>
      </form>

      {/* ── Model and brief ──────────────────────────────────────────────── */}
      <form
        className={`${PANEL} grid gap-2 p-3`}
        onSubmit={event => {
          event.preventDefault();
          void run("settings", () => saveEditorAiSettings({ projectId, model, instructions }), "Saved for this project.");
        }}
      >
        <label className={`grid gap-1.5 text-[11px] font-semibold ${MUTED}`} htmlFor="aqua-editor-ai-model">
          Model
        </label>
        <input
          id="aqua-editor-ai-model"
          value={model}
          onChange={event => setModel(event.target.value)}
          spellCheck={false}
          placeholder={unread ? "gpt-5-mini" : status?.model || "gpt-5-mini"}
          disabled={busy !== null || unread}
          className={`${FIELD} ${FOCUS_RING} font-mono disabled:opacity-50`}
        />
        <label className={`mt-1 grid gap-1.5 text-[11px] font-semibold ${MUTED}`} htmlFor="aqua-editor-ai-brief">
          What it should know about this project
        </label>
        <textarea
          id="aqua-editor-ai-brief"
          rows={4}
          value={instructions}
          onChange={event => setInstructions(event.target.value)}
          placeholder="The stack, the tone of the copy, anything it should never touch…"
          disabled={busy !== null || unread}
          className={`${FIELD} ${FOCUS_RING} resize-y leading-5 disabled:opacity-50`}
        />
        <button type="submit" disabled={busy !== null || unread} className={`${CHIP_BUTTON} ${FOCUS_RING} justify-self-start`}>
          {busy === "settings" ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />}
          Save model and brief
        </button>
      </form>

      {/* One live region, so a screen reader hears the outcome of a save. */}
      <p aria-live="polite" className="min-h-0">
        {error ? (
          <span className="block rounded-md border border-red-300/30 bg-red-300/[0.08] px-2.5 py-2 text-[11px] leading-5 text-red-100">
            {error}
          </span>
        ) : notice ? (
          <span className="block rounded-md border border-emerald-300/25 bg-emerald-300/[0.06] px-2.5 py-2 text-[11px] leading-5 text-emerald-100">
            {notice}
          </span>
        ) : null}
      </p>
    </div>
  );
}
