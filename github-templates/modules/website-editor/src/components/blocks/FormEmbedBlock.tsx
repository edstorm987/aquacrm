"use client";

// R015 — FormEmbedBlock. Renders a form from `@aqua/plugin-forms`
// by id; fetches the published schema via the public endpoint,
// renders the field set, posts to the public submit endpoint.
//
// Honoured server-side: `submitAction.kind` (store-only / redirect /
// thank-you / external-webhook) drives post-submit behaviour.
// `spamProtection.minSecondsBetweenSubmits` is enforced by the
// forms plugin per-IP — this block also stamps a hidden honeypot
// `_h` field that bots tend to fill.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";

interface FormFieldOption { value: string; label: string }

interface FormFieldDef {
  id: string;
  kind:
    | "text" | "email" | "phone" | "textarea"
    | "select" | "multiselect" | "radio" | "checkbox"
    | "number" | "date" | "hidden";
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  defaultValue?: string;
  options?: FormFieldOption[];
}

interface SubmitAction {
  kind: "store-only" | "redirect" | "thank-you" | "external-webhook";
  redirectUrl?: string;
  thankYouMessage?: string;
}

interface FormSchema {
  id: string;
  name: string;
  description?: string;
  fields: FormFieldDef[];
  submitAction: SubmitAction;
}

export default function FormEmbedBlock({ block }: BlockRenderProps) {
  const formId = block.props.formId as string | undefined;
  const fallbackTitle = block.props.fallbackTitle as string | undefined;
  const inlineThankYou = (block.props.inlineThankYou as string | undefined)
    ?? "Thanks — we got it.";

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!formId) { setError("No formId set. Pick a form in the editor."); return; }
    fetch(`/api/portal/forms/public/form/${encodeURIComponent(formId)}`)
      .then(r => r.json() as Promise<{ ok: boolean; form?: FormSchema; error?: string }>)
      .then(data => {
        if (!data.ok || !data.form) { setError(data.error ?? "form not found"); return; }
        setSchema(data.form);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [formId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!schema || !formId) return;
    const form = e.currentTarget;
    // Honeypot check — if a bot filled the hidden _h field, drop
    // silently with the success state to mask the rejection.
    const honeypot = (form.elements.namedItem("_h") as HTMLInputElement | null)?.value;
    if (honeypot) { setSubmitted(true); return; }

    setSubmitting(true); setError(null);
    try {
      const formData = new FormData(form);
      const data: Record<string, unknown> = {};
      for (const field of schema.fields) {
        if (field.kind === "multiselect") {
          data[field.id] = formData.getAll(field.id);
        } else if (field.kind === "checkbox") {
          data[field.id] = formData.get(field.id) === "on";
        } else {
          const v = formData.get(field.id);
          if (v != null) data[field.id] = v;
        }
      }
      const res = await fetch(`/api/portal/forms/public/submit/${encodeURIComponent(formId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: data }),
      });
      const result = await res.json() as { ok: boolean; error?: string; redirect?: string };
      if (!result.ok) {
        setError(result.error ?? `submit failed (${res.status})`);
        return;
      }
      setSubmitted(true);
      // Honour submitAction.kind: redirect overrides inline thank-you.
      const action = schema.submitAction;
      if (action.kind === "redirect" && action.redirectUrl) {
        try { window.location.href = action.redirectUrl; } catch {}
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div data-block-type="form-embed" style={{ padding: 16, color: "#fca5a5", fontSize: 13 }}>
        {error}
      </div>
    );
  }
  if (!schema) {
    return (
      <div data-block-type="form-embed" style={{ padding: 16, color: "var(--brand-text-muted, #94a3b8)", fontSize: 13 }}>
        {fallbackTitle ?? "Loading form…"}
      </div>
    );
  }
  if (submitted) {
    const action = schema.submitAction;
    const message = action.kind === "thank-you"
      ? (action.thankYouMessage ?? inlineThankYou)
      : inlineThankYou;
    return (
      <div data-block-type="form-embed" data-state="submitted"
        style={{
          padding: 24, textAlign: "center", color: "var(--brand-text, currentColor)",
          background: "var(--brand-bg-elevated, rgba(255,255,255,0.03))",
          borderRadius: "var(--brand-radius-md, 10px)",
          border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
        }}>
        <p style={{ fontSize: 16, margin: 0 }}>{message}</p>
      </div>
    );
  }

  return (
    <form data-block-type="form-embed" onSubmit={onSubmit}
      style={{
        maxWidth: 560, margin: "0 auto", padding: 16,
        color: "var(--brand-text, currentColor)",
        fontFamily: "var(--brand-font-body, inherit)",
      }}>
      {schema.name && <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, fontFamily: "var(--brand-font-heading, inherit)" }}>{schema.name}</h3>}
      {schema.description && <p style={{ fontSize: 13, color: "var(--brand-text-muted, #94a3b8)", marginBottom: 16 }}>{schema.description}</p>}

      {/* Honeypot — visually hidden, screen-reader hidden, no tab. */}
      <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label>If you're human, leave this empty:
          <input type="text" name="_h" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {schema.fields.map(field => renderField(field))}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={submitting}
          style={{
            padding: "8px 16px", fontSize: 14, fontWeight: 600,
            background: "var(--brand-primary, #0ea5e9)",
            color: "var(--brand-text, #fff)",
            border: "none", borderRadius: "var(--brand-radius-sm, 6px)",
            cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
          }}>
          {submitting ? "Sending…" : "Submit"}
        </button>
      </div>
    </form>
  );
}

function renderField(field: FormFieldDef): React.JSX.Element {
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
    border: "1px solid var(--brand-border, rgba(255,255,255,0.12))",
    borderRadius: "var(--brand-radius-sm, 4px)",
    color: "var(--brand-text, currentColor)",
  };
  const labelText = field.required ? `${field.label} *` : field.label;
  const help = field.helpText
    ? <small style={{ fontSize: 11, color: "var(--brand-text-muted, #94a3b8)", marginTop: 2, display: "block" }}>{field.helpText}</small>
    : null;

  if (field.kind === "textarea") {
    return (
      <label key={field.id} style={{ fontSize: 12 }}>
        {labelText}
        <textarea name={field.id} required={field.required} placeholder={field.placeholder}
          defaultValue={field.defaultValue} rows={5} style={{ ...inputStyle, marginTop: 4 }} />
        {help}
      </label>
    );
  }
  if (field.kind === "select" || field.kind === "multiselect") {
    return (
      <label key={field.id} style={{ fontSize: 12 }}>
        {labelText}
        <select name={field.id} required={field.required}
          multiple={field.kind === "multiselect"}
          defaultValue={field.defaultValue}
          style={{ ...inputStyle, marginTop: 4 }}>
          {(field.options ?? []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {help}
      </label>
    );
  }
  if (field.kind === "radio") {
    return (
      <fieldset key={field.id} style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 12 }}>{labelText}</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {(field.options ?? []).map(o => (
            <label key={o.value} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name={field.id} value={o.value} required={field.required} />
              {o.label}
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }
  if (field.kind === "checkbox") {
    return (
      <label key={field.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" name={field.id} required={field.required} defaultChecked={field.defaultValue === "true"} />
        <span>{labelText}</span>
        {help}
      </label>
    );
  }
  if (field.kind === "hidden") {
    return <input key={field.id} type="hidden" name={field.id} defaultValue={field.defaultValue ?? ""} />;
  }
  // text / email / phone / number / date
  const inputType: Record<string, string> = {
    text: "text", email: "email", phone: "tel", number: "number", date: "date",
  };
  return (
    <label key={field.id} style={{ fontSize: 12 }}>
      {labelText}
      <input type={inputType[field.kind] ?? "text"} name={field.id}
        required={field.required} placeholder={field.placeholder}
        defaultValue={field.defaultValue}
        style={{ ...inputStyle, marginTop: 4 }} />
      {help}
    </label>
  );
}
