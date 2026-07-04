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

  return (
    <section data-block-type="form" style={{ maxWidth: 480, ...blockStylesToCss(block.styles) }}>
      {title && <h3 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 24, fontWeight: 700, marginBottom: 16 }}>{title}</h3>}
      <form action={action} method="POST" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {fields.map((f, i) => (
          <label key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{f.label}{f.required && <span style={{ color: "#ff6b35" }}> *</span>}</span>
            {f.type === "textarea"
              ? <textarea name={f.name} required={f.required} placeholder={f.placeholder} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              : <input name={f.name} type={f.type} required={f.required} placeholder={f.placeholder} style={inputStyle} />
            }
          </label>
        ))}
        <button type="submit" style={{ marginTop: 8, padding: "12px 20px", borderRadius: 12, border: "none", background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          {submitLabel}
        </button>
      </form>
    </section>
  );
}
