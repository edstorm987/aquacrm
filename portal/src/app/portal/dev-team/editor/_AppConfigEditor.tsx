"use client";

// The Editor's working surface: current values → edit → PREVIEW → apply.
//
// The preview step is the point of the screen, not decoration. Every write here
// lands on real persisted state for a real agency, so nothing is saved on first
// submit: the first request is always a dry run, the operator reads a
// field-by-field before → after, and only then is a second request sent with
// `confirm: true`. While the diff is on screen the inputs are locked, so the
// change that gets applied is exactly the one that was read.
//
// The server owns every decision. This component collects text and renders what
// came back; validation, conflict detection and the confirm rule all live in
// `appConfigAdapter` and the editing engine.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, RotateCcw, TriangleAlert } from "lucide-react";

import type { PublishOutcome } from "@/engines/editor/editing/engine";
import type { AppConfigFieldView } from "@/lib/server/editing/appConfigAdapter";
import { Panel, Pill } from "../_ui";

const ENDPOINT = "/api/portal/dev-team/editor";

interface InvalidValue {
  targetId: string;
  label: string;
  message: string;
}

interface SkippedValue {
  targetId: string;
  label: string;
}

interface EditorResponse {
  ok: boolean;
  error?: string;
  invalid?: InvalidValue[];
  skipped?: SkippedValue[];
  outcome?: PublishOutcome;
}

function initialValues(fields: AppConfigFieldView[]): Record<string, string> {
  return Object.fromEntries(fields.map(field => [field.id, field.value]));
}

/** Groups in the order the server listed them — no second source of ordering. */
function groupFields(fields: AppConfigFieldView[]): Array<{ group: string; fields: AppConfigFieldView[] }> {
  const groups: Array<{ group: string; fields: AppConfigFieldView[] }> = [];
  for (const field of fields) {
    const existing = groups.find(entry => entry.group === field.group);
    if (existing) existing.fields.push(field);
    else groups.push({ group: field.group, fields: [field] });
  }
  return groups;
}

function isColourish(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function Swatch({ value }: { value: string }) {
  if (!isColourish(value)) return null;
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-[color:var(--dev-line)] align-middle"
      style={{ background: value }}
    />
  );
}

function ValueChip({ value }: { value: string }) {
  if (value === "") return <span className="italic text-[color:var(--dt-faint)]">empty</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Swatch value={value} />
      <span className="min-w-0 break-words font-mono text-[12px] text-[color:var(--dt-ink)]">{value}</span>
    </span>
  );
}

export function AppConfigEditor({
  fields,
  revision,
  documentLabel,
}: {
  fields: AppConfigFieldView[];
  revision: string;
  documentLabel: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));
  const [preview, setPreview] = useState<PublishOutcome | null>(null);
  const [invalid, setInvalid] = useState<InvalidValue[]>([]);
  // Edits that normalised back to what is already stored. The server drops them
  // before the engine sees them — a trailing space must not veto the batch —
  // but the operator typed in those fields and gets told nothing was needed.
  const [skipped, setSkipped] = useState<SkippedValue[]>([]);
  const [applied, setApplied] = useState<PublishOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-sync when the server hands us a newer document (after an apply, or a
  // refresh). Done during render rather than in an effect: the fingerprints
  // below must never be one paint behind the values they describe.
  const [syncedRevision, setSyncedRevision] = useState(revision);
  if (syncedRevision !== revision) {
    setSyncedRevision(revision);
    setValues(initialValues(fields));
    setPreview(null);
    setInvalid([]);
    setSkipped([]);
    setError(null);
  }

  const dirty = fields.filter(field => (values[field.id] ?? "") !== field.value);
  const invalidById = new Map(invalid.map(entry => [entry.targetId, entry]));
  const locked = preview !== null || busy;

  function edit(id: string, value: string) {
    // Any keystroke retires the previewed plan. Confirming a diff that no
    // longer matches the form is precisely the trap this screen exists to shut.
    setValues(current => ({ ...current, [id]: value }));
    setPreview(null);
    setApplied(null);
    setError(null);
    setInvalid(current => current.filter(entry => entry.targetId !== id));
    setSkipped(current => current.filter(entry => entry.targetId !== id));
  }

  function reset() {
    setValues(initialValues(fields));
    setPreview(null);
    setInvalid([]);
    setSkipped([]);
    setError(null);
  }

  function backToEditing() {
    const stale = (preview?.rejected.length ?? 0) > 0;
    setPreview(null);
    // Only after a refusal. A refusal means the document moved, so the form's
    // fingerprints are wrong and re-previewing would fail the same way; every
    // other route back would silently discard the typing instead.
    if (stale) router.refresh();
  }

  async function send(confirm: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm,
          intents: dirty.map(field => ({
            targetId: field.id,
            expectedFingerprint: field.fingerprint,
            value: values[field.id] ?? "",
          })),
        }),
      });
      const body = await response.json().catch(() => null) as EditorResponse | null;

      if (body?.invalid?.length) {
        setInvalid(body.invalid);
        setSkipped([]);
        setPreview(null);
        return;
      }
      if (!response.ok || !body?.ok || !body.outcome) {
        setError(body?.error ?? `The editor could not be reached (${response.status}).`);
        setPreview(null);
        return;
      }

      setInvalid([]);
      setSkipped(body.skipped ?? []);
      if (body.outcome.published) {
        setApplied(body.outcome);
        setPreview(null);
        // Pulls fresh values + fingerprints; the sync above resets the form.
        router.refresh();
      } else if (confirm) {
        // Asked to publish and it did not: something moved underneath. Hold the
        // explanation on screen — refreshing here would swap the document out
        // and take the reason with it. "Back to editing" does the reload.
        setPreview(body.outcome);
      } else {
        setPreview(body.outcome);
      }
    } catch {
      setError("The editor could not be reached. Check the dev server and try again.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="dev-team-app-config-editor">
      {applied ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--dev-success-line)] bg-[color:var(--dev-success-soft)] p-4">
          <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color:var(--dev-success-soft)] text-[color:var(--dev-success)]">
            <Check size={15} />
          </span>
          <div className="min-w-0 text-sm">
            <div className="font-medium text-[color:var(--dt-ink)]">Applied</div>
            <p className="mt-0.5 text-[color:var(--dt-muted)]">{applied.summary}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--dev-danger-line)] bg-[color:var(--dev-danger-soft)] p-4 text-sm">
          <span aria-hidden className="mt-0.5 text-[color:var(--dev-danger)]"><TriangleAlert size={16} /></span>
          <p className="text-[color:var(--dev-danger)]">{error}</p>
        </div>
      ) : null}

      {invalid.length > 0 ? (
        <div className="rounded-2xl border border-[color:var(--dev-danger-line)] bg-[color:var(--dev-danger-soft)] p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-[color:var(--dev-danger)]">
            <TriangleAlert size={15} />
            Nothing was saved — {invalid.length} value{invalid.length === 1 ? " needs" : "s need"} fixing
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {invalid.map(entry => (
              <li key={entry.targetId} className="text-[color:var(--dt-muted)]">
                <span className="font-medium text-[color:var(--dt-ink)]">{entry.label}</span> — {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {skipped.length > 0 ? (
        <div className="rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] p-4 text-sm">
          <div className="font-medium text-[color:var(--dt-ink)]">
            {skipped.length} field{skipped.length === 1 ? "" : "s"} needed no change
          </div>
          <p className="mt-1 text-[color:var(--dt-muted)]">
            {skipped.map(entry => entry.label).join(", ")} — what you typed matches what is already
            stored once it is tidied up (spaces trimmed, capitals normalised). Skipped, so the rest of
            the batch is unaffected.
          </p>
        </div>
      ) : null}

      {preview ? (
        <Panel
          title="Preview"
          hint="Nothing has been written yet. This is exactly what Apply will do."
          right={<Pill tone="warn">Not applied</Pill>}
        >
          {preview.changes.length === 0 ? (
            <p className="text-sm text-[color:var(--dt-faint)]">{preview.summary}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
              {preview.changes.map(change => (
                <li key={change.target.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="text-sm font-medium text-[color:var(--dt-ink)]">{change.target.label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <ValueChip value={change.before} />
                    <ArrowRight size={13} className="shrink-0 text-[color:var(--dt-faint)]" aria-label="becomes" />
                    <ValueChip value={change.after} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {preview.rejected.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[color:var(--dev-danger-line)] bg-[color:var(--dev-danger-soft)] p-3 text-sm">
              <div className="font-medium text-[color:var(--dev-danger)]">These could not be applied</div>
              <ul className="mt-1 flex flex-col gap-1 text-[color:var(--dt-muted)]">
                {preview.rejected.map(rejection => (
                  <li key={rejection.targetId}>{rejection.detail}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[color:var(--dt-faint)]">
                Publishing is all-or-nothing, so nothing was written. Reload the page to see the current values.
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--dt-hairline)] pt-4">
            <button
              type="button"
              disabled={busy || preview.changes.length === 0 || preview.rejected.length > 0}
              onClick={() => void send(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--dev-accent)] px-3 py-1.5 text-sm font-medium text-[color:var(--dev-on-accent)] transition hover:bg-[color:var(--dev-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={14} />
              {busy ? "Applying…" : `Apply ${preview.changes.length} change${preview.changes.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={backToEditing}
              className="rounded-lg border border-[color:var(--dt-line)] px-3 py-1.5 text-sm text-[color:var(--dt-muted)] transition hover:border-[color:var(--dt-line)] disabled:opacity-40"
            >
              Back to editing
            </button>
            <span className="text-xs text-[color:var(--dt-faint)]">Applying writes to {documentLabel}.</span>
          </div>
        </Panel>
      ) : null}

      {groupFields(fields).map(({ group, fields: groupedFields }) => (
        <Panel key={group} title={group}>
          <div className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {groupedFields.map(field => {
              const value = values[field.id] ?? "";
              const changed = value !== field.value;
              const problem = invalidById.get(field.id);
              return (
                <div key={field.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-4">
                  <div className="min-w-0">
                    <label htmlFor={field.id} className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--dt-ink)]">
                      {field.label}
                      {changed ? <Pill tone="warn">edited</Pill> : null}
                    </label>
                    <p className="mt-0.5 text-xs leading-snug text-[color:var(--dt-faint)]">{field.hint}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {field.control === "color" ? (
                        <input
                          type="color"
                          aria-label={`${field.label} colour picker`}
                          disabled={locked}
                          value={isColourish(value) ? value : "var(--dev-ink)"}
                          onChange={event => edit(field.id, event.target.value)}
                          className="h-8 w-9 shrink-0 cursor-pointer rounded border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      ) : null}
                      {field.control === "textarea" ? (
                        <textarea
                          id={field.id}
                          rows={3}
                          disabled={locked}
                          value={value}
                          placeholder={field.placeholder}
                          onChange={event => edit(field.id, event.target.value)}
                          className={`w-full rounded-lg border bg-[color:var(--dt-surface)] px-2.5 py-1.5 text-sm text-[color:var(--dt-ink)] outline-none transition focus:border-[color:var(--dev-accent)] disabled:bg-[color:var(--dt-raised)] disabled:text-[color:var(--dt-faint)] ${problem ? "border-[color:var(--dev-danger-line)]" : "border-[color:var(--dt-line)]"}`}
                        />
                      ) : (
                        <input
                          id={field.id}
                          type="text"
                          inputMode={field.control === "url" ? "url" : "text"}
                          spellCheck={false}
                          disabled={locked}
                          value={value}
                          placeholder={field.placeholder}
                          onChange={event => edit(field.id, event.target.value)}
                          className={`w-full rounded-lg border bg-[color:var(--dt-surface)] px-2.5 py-1.5 font-mono text-[13px] text-[color:var(--dt-ink)] outline-none transition focus:border-[color:var(--dev-accent)] disabled:bg-[color:var(--dt-raised)] disabled:text-[color:var(--dt-faint)] ${problem ? "border-[color:var(--dev-danger-line)]" : "border-[color:var(--dt-line)]"}`}
                        />
                      )}
                    </div>
                    {problem ? <p className="mt-1 text-xs text-[color:var(--dev-danger)]">{problem.message}</p> : null}
                    {changed && !problem ? (
                      <p className="mt-1 text-xs text-[color:var(--dt-faint)]">
                        was <span className="font-mono">{field.value === "" ? "empty" : field.value}</span>
                        {field.optional ? "" : " · cannot be left empty"}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ))}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)]/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          disabled={busy || dirty.length === 0 || preview !== null}
          onClick={() => void send(false)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--dev-accent)] px-3 py-1.5 text-sm font-medium text-[color:var(--dev-on-accent)] transition hover:bg-[color:var(--dev-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eye size={14} />
          {busy && !preview ? "Checking…" : "Preview changes"}
        </button>
        <button
          type="button"
          disabled={busy || dirty.length === 0}
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--dt-line)] px-3 py-1.5 text-sm text-[color:var(--dt-muted)] transition hover:border-[color:var(--dt-line)] disabled:opacity-40"
        >
          <RotateCcw size={13} />
          Discard
        </button>
        <span className="text-xs text-[color:var(--dt-faint)]">
          {dirty.length === 0
            ? "No changes yet — nothing will be written."
            : `${dirty.length} field${dirty.length === 1 ? "" : "s"} edited · preview before anything is written`}
        </span>
      </div>
    </div>
  );
}
