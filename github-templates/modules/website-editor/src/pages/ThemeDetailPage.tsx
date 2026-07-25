"use client";

// ThemeDetailPage — token editor for a single ThemeRecord.
//
// Replaces the Round-1 stub. The plugin's theme model is per-site
// (ThemeRecord scoped under a siteId, persisted server-side via
// `/api/portal/website-editor/themes`) — different shape from 02's
// localStorage-singleton ThemeConfig, so this is a clean rewrite
// against the plugin's `lib/theme.ts` contract rather than a lift of
// `02/admin/theme/page.tsx`. The UX matches what 02 ships:
//
//   • Token editor for the 13 flat ThemeTokens fields
//   • Live preview pane (heading / body / button / card / divider)
//   • Save / Set as default / Duplicate / Delete actions
//   • Custom CSS escape hatch
//
// Round-4 follow-up: the broader 02 page also exposes deep-merge
// component overrides (button radius, card border, focus ring, etc.).
// Those map to a richer ThemeTokens shape than the plugin currently
// models. When ThemeTokens grows, extend both this page and the
// storefront's CSS-variable injector together.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  loadThemes,
  updateTheme,
  createTheme,
  deleteTheme,
} from "../lib/theme";
import type { ThemeRecord, ThemeTokens } from "../types/theme";
import { getActiveSiteId } from "../lib/sites";
import { confirm } from "../lib/confirm";
import { prompt } from "../lib/prompt";
import { notify } from "../lib/notify";
import AdminTabs from "../components/AdminTabs";
import { CONTENT_TABS } from "../lib/tabSets";
import PluginRequired from "../lib/pluginRequired";

interface TokenField {
  key: keyof ThemeTokens;
  label: string;
  hint?: string;
  type: "color" | "text" | "css";
  defaultValue?: string;
}

const PALETTE_FIELDS: TokenField[] = [
  { key: "primary",     label: "Primary (CTA / accent)",         type: "color", defaultValue: "#ff6b35" },
  { key: "surface",     label: "Surface (page background)",      type: "color", defaultValue: "#0a0a0a" },
  { key: "surfaceAlt",  label: "Surface alt (cards / sections)", type: "color", defaultValue: "#141414" },
  { key: "ink",         label: "Ink (body text)",                type: "color", defaultValue: "#faf5ee" },
  { key: "inkSoft",     label: "Ink soft (muted text)",          type: "color", defaultValue: "rgba(250,245,238,0.6)" },
  { key: "border",      label: "Border / divider",               type: "color", defaultValue: "rgba(255,255,255,0.08)" },
  { key: "shadow",      label: "Shadow",                         type: "text",  defaultValue: "0 1px 2px rgba(0,0,0,0.08)" },
];

const TYPOGRAPHY_FIELDS: TokenField[] = [
  { key: "fontHeading", label: "Heading font", type: "text", defaultValue: "Georgia, serif" },
  { key: "fontBody",    label: "Body font",    type: "text", defaultValue: "system-ui, sans-serif" },
  { key: "fontMono",    label: "Mono font",    type: "text", defaultValue: "ui-monospace, monospace" },
];

const SIZING_FIELDS: TokenField[] = [
  { key: "radius",      label: "Border radius", type: "text", defaultValue: "12px", hint: "e.g. 12px or 0.75rem" },
  { key: "spacingUnit", label: "Spacing unit",  type: "text", defaultValue: "8px",  hint: "Base spacing rhythm" },
];

export default function ThemeDetailPage(_props: unknown) {
  return (
    <PluginRequired plugin="website-editor">
      <ThemeDetailPageInner />
    </PluginRequired>
  );
}

function ThemeDetailPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const themeId = searchParams?.get("themeId") ?? "";
  const siteParam = searchParams?.get("siteId") ?? "";

  const [siteId, setSiteId] = useState<string>(siteParam || "");
  const [theme, setTheme] = useState<ThemeRecord | null>(null);
  const [tokens, setTokens] = useState<ThemeTokens>({});
  const [name, setName] = useState<string>("");
  const [appearance, setAppearance] = useState<"light" | "dark" | "auto">("auto");
  const [dirty, setDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const refresh = useCallback(async (sid: string) => {
    if (!sid) return;
    const list = await loadThemes(sid, true);
    const found = list.find(t => t.id === themeId) ?? list[0] ?? null;
    if (found) {
      setTheme(found);
      setTokens(found.tokens);
      setName(found.name);
      setAppearance(found.appearance ?? "auto");
      setDirty(false);
    }
  }, [themeId]);

  useEffect(() => {
    const sid = siteParam || getActiveSiteId();
    setSiteId(sid);
    void refresh(sid);
  }, [siteParam, refresh]);

  function patchToken<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) {
    setTokens(t => ({ ...t, [key]: value }));
    setDirty(true);
  }

  async function save() {
    if (!theme || !siteId) return;
    setSaving(true);
    try {
      const updated = await updateTheme(siteId, theme.id, { name, appearance, tokens });
      if (updated) {
        notify({ tone: "ok", title: "Theme saved", message: `"${name}" updated.` });
        setTheme(updated);
        setDirty(false);
        await refresh(siteId);
      } else {
        notify({ tone: "error", title: "Save failed", message: "Server didn't return the theme." });
      }
    } finally { setSaving(false); }
  }

  async function setAsDefault() {
    if (!theme || !siteId) return;
    const updated = await updateTheme(siteId, theme.id, { setAsDefault: true });
    if (updated) {
      notify({ tone: "ok", title: "Default theme set", message: `"${theme.name}" is now the site default.` });
      await refresh(siteId);
    }
  }

  async function duplicate() {
    if (!theme || !siteId) return;
    const newName = await prompt({
      title: "Duplicate theme",
      message: "Pick a name for the copy.",
      defaultValue: `${theme.name} (copy)`,
    });
    if (!newName) return;
    const created = await createTheme(siteId, { name: newName, appearance, tokens });
    if (created) {
      notify({ tone: "ok", title: "Duplicated", message: `"${newName}" created.` });
      router.push(`?siteId=${encodeURIComponent(siteId)}&themeId=${encodeURIComponent(created.id)}`);
    }
  }

  async function remove() {
    if (!theme || !siteId) return;
    if (theme.isDefault) {
      notify({ tone: "warn", title: "Default theme", message: "Set another theme as default first." });
      return;
    }
    const ok = await confirm({
      title: `Delete "${theme.name}"?`,
      message: "Pages using this theme fall back to the site default.",
      danger: true,
      confirmLabel: "Delete theme",
    });
    if (!ok) return;
    const deleted = await deleteTheme(siteId, theme.id);
    if (deleted) {
      notify({ tone: "ok", title: "Theme deleted" });
      router.push("../themes");
    }
  }

  if (!theme) {
    return (
      <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-4">
        <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />
        <Link href="../themes" className="text-[11px] text-brand-cream/40 hover:text-brand-cream">← Themes</Link>
        <p className="text-brand-cream/60">Loading theme…</p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6">
      <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="../themes" className="text-[11px] text-brand-cream/40 hover:text-brand-cream">← Themes</Link>
          <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mt-2 mb-2">Theme</p>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setDirty(true); }}
            className="font-display text-3xl sm:text-4xl text-brand-cream bg-transparent border-b border-white/10 focus:border-brand-orange/50 focus:outline-none"
            aria-label="Theme name"
          />
          {theme.isDefault && (
            <span className="ml-3 inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-brand-orange/15 text-brand-orange">
              Default
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!theme.isDefault && (
            <button onClick={setAsDefault} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-brand-cream/85">
              Set as default
            </button>
          )}
          <button onClick={duplicate} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-brand-cream/85">
            Duplicate
          </button>
          <button
            onClick={remove}
            disabled={theme.isDefault}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-300 disabled:opacity-30"
          >
            Delete
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="text-xs px-4 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-light text-white font-semibold disabled:opacity-40"
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        <div className="space-y-6">
          <Section title="Appearance">
            <select
              value={appearance}
              onChange={e => { setAppearance(e.target.value as "light" | "dark" | "auto"); setDirty(true); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-brand-cream"
            >
              <option value="auto">Auto (follow system)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Section>

          <Section title="Palette">
            <TokenGrid fields={PALETTE_FIELDS} tokens={tokens} onChange={patchToken} />
          </Section>

          <Section title="Typography">
            <TokenGrid fields={TYPOGRAPHY_FIELDS} tokens={tokens} onChange={patchToken} />
          </Section>

          <Section title="Sizing">
            <TokenGrid fields={SIZING_FIELDS} tokens={tokens} onChange={patchToken} />
          </Section>

          <Section title="Custom CSS" hint="Applied verbatim inside <style>. Scoped per-page.">
            <textarea
              value={tokens.customCss ?? ""}
              onChange={e => patchToken("customCss", e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-brand-cream font-mono"
              placeholder="/* Custom CSS for this theme */"
            />
          </Section>
        </div>

        <ThemePreview tokens={tokens} />
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="mb-3">
        <p className="text-[11px] tracking-[0.18em] uppercase text-brand-amber">{title}</p>
        {hint && <p className="text-[11px] text-brand-cream/45 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function TokenGrid({
  fields,
  tokens,
  onChange,
}: {
  fields: TokenField[];
  tokens: ThemeTokens;
  onChange: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map(field => {
        const value = tokens[field.key] ?? "";
        return (
          <label key={field.key} className="space-y-1">
            <span className="block text-[11px] text-brand-cream/65">
              {field.label}
              {field.hint && <span className="text-brand-cream/35 ml-2">— {field.hint}</span>}
            </span>
            {field.type === "color" ? (
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={normaliseHex(value, field.defaultValue ?? "#000000")}
                  onChange={e => onChange(field.key, e.target.value)}
                  className="h-8 w-12 rounded border border-white/10 bg-transparent cursor-pointer"
                  aria-label={field.label}
                />
                <input
                  type="text"
                  value={value}
                  onChange={e => onChange(field.key, e.target.value)}
                  placeholder={field.defaultValue}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-brand-cream font-mono"
                />
              </div>
            ) : (
              <input
                type="text"
                value={value}
                onChange={e => onChange(field.key, e.target.value)}
                placeholder={field.defaultValue}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-brand-cream"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function ThemePreview({ tokens }: { tokens: ThemeTokens }) {
  const style: React.CSSProperties = {
    background: tokens.surface ?? "#0a0a0a",
    color: tokens.ink ?? "#faf5ee",
    fontFamily: tokens.fontBody,
    padding: 24,
    borderRadius: 16,
    border: `1px solid ${tokens.border ?? "rgba(255,255,255,0.08)"}`,
    boxShadow: tokens.shadow,
  };

  return (
    <aside className="lg:sticky lg:top-6 self-start space-y-4">
      <p className="text-[11px] tracking-[0.18em] uppercase text-brand-amber">Preview</p>
      <div style={style}>
        <h3 style={{ fontFamily: tokens.fontHeading, fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>
          Heading sample
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 16px", color: tokens.ink }}>
          Body copy renders in your chosen body font. The preview updates live as you adjust tokens.
        </p>
        <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 16px", color: tokens.inkSoft }}>
          Muted (ink-soft) text is used for secondary copy and helper labels.
        </p>
        <button
          type="button"
          style={{
            padding: "10px 18px",
            borderRadius: tokens.radius ?? "12px",
            border: "none",
            background: tokens.primary ?? "#ff6b35",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Primary action
        </button>
        <hr
          style={{
            margin: `${tokens.spacingUnit ?? "16px"} 0`,
            border: 0,
            borderTop: `1px solid ${tokens.border ?? "rgba(255,255,255,0.08)"}`,
          }}
        />
        <div
          style={{
            background: tokens.surfaceAlt ?? "#141414",
            border: `1px solid ${tokens.border ?? "rgba(255,255,255,0.08)"}`,
            borderRadius: tokens.radius ?? "12px",
            padding: 16,
            fontSize: 13,
          }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Surface alt card</p>
          <p style={{ margin: 0, opacity: 0.7 }}>Cards and sections use surfaceAlt as their backing.</p>
        </div>
        <code
          style={{
            display: "inline-block",
            marginTop: 16,
            fontFamily: tokens.fontMono,
            fontSize: 12,
            padding: "4px 8px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 4,
          }}
        >
          font-mono sample
        </code>
      </div>
      {tokens.customCss && (
        <div className="text-[11px] text-brand-cream/45">
          Custom CSS is applied at runtime — not previewed inline above.
        </div>
      )}
    </aside>
  );
}

function normaliseHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1]!, g = value[2]!, b = value[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}
