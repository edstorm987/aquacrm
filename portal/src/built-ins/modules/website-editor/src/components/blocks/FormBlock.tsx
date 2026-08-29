"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "tel" | "url" | "textarea";
  required?: boolean;
  placeholder?: string;
}

export default function FormBlock({ block }: BlockRenderProps) {
  const title = (block.props.title as string | undefined) ?? "";
  const action = (block.props.action as string | undefined) ?? "";
  const fields = (block.props.fields as FormField[] | undefined) ?? [];
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Submit";

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    fontSize: 14,
    color: "inherit",
    fontFamily: "inherit",
  };

  // A form with nowhere to send is not a form.
  //
  // Issue #29, found 2026-08-27. `action` comes from the block's props and the
  // page templates were seeding `/api/contact`, which is not a route — it
  // answers 404. Left as-is this renders a perfectly convincing form that
  // throws the visitor's message away, and the page templates put one on every
  // Contact page anybody creates.
  //
  // Blanking the template default alone would NOT have fixed it: an empty
  // `action` posts to the current URL, so the visitor's message would go to the
  // page itself. Both roads end at a form that lies, which is why the honest
  // state lives here in the block rather than in the template.
  //
  // The fields are still shown, so the person building the page sees what they
  // designed — it simply cannot be submitted until an endpoint is set.
  const connected = action.trim().length > 0;

  return (
    <section data-block-type="form" data-form-connected={connected ? "yes" : "no"} style={{ maxWidth: 480, ...blockStylesToCss(block.styles) }}>
      {title && <h3 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 24, fontWeight: 700, marginBottom: 16 }}>{title}</h3>}
      {!connected && (
        <p
          role="note"
          style={{
            margin: "0 0 12px", padding: "10px 12px", borderRadius: 8,
            border: "1px dashed rgba(255,107,53,0.5)", background: "rgba(255,107,53,0.07)",
            fontSize: 12, lineHeight: 1.5,
          }}
        >
          This form has no destination yet, so it cannot be sent. Set “Action” in
          the block settings to the address that should receive submissions.
        </p>
      )}
      <form
        action={connected ? action : undefined}
        method="POST"
        onSubmit={connected ? undefined : (event) => event.preventDefault()}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {fields.map((f, i) => (
          <label key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{f.label}{f.required && <span style={{ color: "#ff6b35" }}> *</span>}</span>
            {f.type === "textarea"
              ? <textarea name={f.name} required={f.required} placeholder={f.placeholder} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              : <input name={f.name} type={f.type} required={f.required} placeholder={f.placeholder} style={inputStyle} />
            }
          </label>
        ))}
        <button type="submit" disabled={!connected} style={{ marginTop: 8, padding: "12px 20px", borderRadius: 12, border: "none", background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: connected ? "pointer" : "not-allowed", opacity: connected ? 1 : 0.5 }}>
          {submitLabel}
        </button>
      </form>
    </section>
  );
}
