"use client";

// /admin/themes — manage themes per active site. Default + Light + Dark
// are seeded automatically; admins can rename, tweak tokens, set the
// default, add new ones, or delete (the default cannot be deleted).
//
// Pages reference themes by id. Switching the page's theme in the
// editor re-renders with these tokens — no per-page edits needed.

import { useEffect, useState } from "react";
import type { ThemeRecord, ThemeTokens } from "../types/theme";
import { getActiveSite, type Site } from "../lib/sites";
import { createTheme, deleteTheme, loadThemes, onThemesChange, updateTheme } from "../lib/theme";
import PluginRequired from "../lib/pluginRequired";
import { confirm } from "../lib/confirm";
import AdminTabs from "../components/AdminTabs";
import { CONTENT_TABS } from "../lib/tabSets";

const TOKEN_KEYS: Array<{ key: keyof ThemeTokens; label: string; kind: "color" | "text" }> = [
  { key: "primary",     label: "Primary (CTA / accent)",          kind: "color" },
  { key: "surface",     label: "Surface (page background)",       kind: "color" },
  { key: "surfaceAlt",  label: "Surface alt (cards / sections)",  kind: "color" },
  { key: "ink",         label: "Ink (body text)",                 kind: "color" },
  { key: "inkSoft",     label: "Ink soft (muted text)",           kind: "color" },
  { key: "border",      label: "Border",                          kind: "color" },
  { key: "shadow",      label: "Shadow (CSS box-shadow)",         kind: "text"  },
  { key: "fontHeading", label: "Heading font",                    kind: "text"  },
  { key: "fontBody",    label: "Body font",                       kind: "text"  },
  { key: "radius",      label: "Border radius",                   kind: "text"  },
  { key: "spacingUnit", label: "Spacing unit",                    kind: "text"  },
];

const INPUT = "w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-brand-orange/50";

export default function ThemesPage(_props: unknown) {
  return <PluginRequired plugin="brand"><ThemesPageInner /></PluginRequired>;
}

function ThemesPageInner() {
  const [site, setSite] = useState<Site | null>(null);
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAppearance, setNewAppearance] = useState<"light" | "dark" | "auto">("auto");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(siteId: string) {
    const list = await loadThemes(siteId, true);
    setThemes(list);
  }

  useEffect(() => {
    const s = getActiveSite();
    setSite(s ?? null);
    if (s) void refresh(s.id);
    return onThemesChange(id => { if (site?.id === id) void refresh(id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(id: string, patch: Parameters<typeof updateTheme>[2]) {
    if (!site) return;
    setError(null);
    const next = await updateTheme(site.id, id, patch);
    if (!next) { setError("Could not save"); return; }
    setSavedAt(Date.now());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!site || !newName.trim()) return;
    setError(null);
    await createTheme(site.id, { name: newName.trim(), appearance: newAppearance });
    setNewName(""); setCreating(false);
    void refresh(site.id);
  }

  async function handleDelete(id: string) {
    if (!site) return;
    if (!(await confirm({
      title: "Delete this theme?",
      message: "Pages using it fall back to the default theme.",
      danger: true,
      confirmLabel: "Delete",
    }))) return;
    const ok = await deleteTheme(site.id, id);
    if (!ok) setError("Default theme can't be deleted. Set another as default first.");
    void refresh(site.id);
  }

  async function handleSetDefault(id: string) {
    if (!site) return;
    await updateTheme(site.id, id, { setAsDefault: true });
    void refresh(site.id);
  }

  if (!site) return <main className="p-6 text-[12px] text-brand-cream/45">No active site.</main>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-[0.28em] uppercase text-brand-orange mb-1">Branding</p>
          <h1 className="font-display text-3xl text-brand-cream">Themes</h1>
          <p className="text-[12px] text-brand-cream/55 mt-1">Site: <span className="text-brand-cream/85">{site.name}</span></p>
        </div>
        <button onClick={() => setCreating(c => !c)} className="px-3 py-2 rounded-lg bg-brand-orange text-white text-[12px] font-semibold hover:opacity-90">
          {creating ? "Cancel" : "+ New theme"}
        </button>
      </header>

      {creating && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] tracking-[0.18em] uppercase text-brand-cream/45 mb-1">Name</span>
              <input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Forest" className={INPUT} />
            </label>
            <label className="block">
              <span className="block text-[10px] tracking-[0.18em] uppercase text-brand-cream/45 mb-1">Appearance</span>
              <select value={newAppearance} onChange={e => setNewAppearance(e.target.value as "light" | "dark" | "auto")} className={INPUT}>
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
          <button type="submit" disabled={!newName.trim()} className="px-3 py-2 rounded-lg bg-brand-orange text-white text-[12px] font-semibold disabled:opacity-50">
            Create theme
          </button>
        </form>
      )}

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[12px] text-red-400">{error}</div>}
      {savedAt && <p className="text-[11px] text-brand-cream/55">Saved</p>}

      <div className="space-y-4">
        {themes.map(theme => (
          <details key={theme.id} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden" open={theme.isDefault}>
            <summary className="cursor-pointer px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
              <span className="w-6 h-6 rounded-lg shrink-0 ring-1 ring-white/10" style={{ background: theme.tokens.surface ?? "#000" }} />
              <span className="w-6 h-6 rounded-lg shrink-0 ring-1 ring-white/10" style={{ background: theme.tokens.primary ?? "#fff" }} />
              <span className="font-semibold text-brand-cream">{theme.name}</span>
              {theme.isDefault && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">Default</span>}
              {theme.appearance && <span className="text-[10px] uppercase tracking-wider text-brand-cream/40">{theme.appearance}</span>}
              <span className="ml-auto text-[10px] font-mono text-brand-cream/30">{theme.id}</span>
            </summary>
            <div className="p-4 border-t border-white/8 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[10px] tracking-[0.18em] uppercase text-brand-cream/45 mb-1">Name</span>
                  <input
                    defaultValue={theme.name}
                    onBlur={e => e.target.value !== theme.name && patch(theme.id, { name: e.target.value })}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] tracking-[0.18em] uppercase text-brand-cream/45 mb-1">Appearance</span>
                  <select
                    defaultValue={theme.appearance ?? "auto"}
                    onChange={e => patch(theme.id, { appearance: e.target.value as "light" | "dark" | "auto" })}
                    className={INPUT}
                  >
                    <option value="auto">Auto</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {TOKEN_KEYS.map(({ key, label, kind }) => {
                  const value = (theme.tokens[key] as string | undefined) ?? "";
                  return (
                    <label key={key as string} className="block">
                      <span className="block text-[10px] tracking-[0.18em] uppercase text-brand-cream/45 mb-1">{label}</span>
                      {kind === "color" ? (
                        <div className="flex gap-2">
                          <input
                            type="color"
                            defaultValue={value.startsWith("#") ? value : "#000000"}
                            onChange={e => patch(theme.id, { tokens: { [key]: e.target.value } })}
                            className="w-10 h-8 rounded cursor-pointer bg-transparent border border-white/10"
                          />
                          <input
                            defaultValue={value}
                            onBlur={e => e.target.value !== value && patch(theme.id, { tokens: { [key]: e.target.value || undefined } })}
                            className={INPUT + " font-mono"}
                          />
                        </div>
                      ) : (
                        <input
                          defaultValue={value}
                          onBlur={e => e.target.value !== value && patch(theme.id, { tokens: { [key]: e.target.value || undefined } })}
                          className={INPUT + " font-mono"}
                          placeholder="—"
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <details className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
                <summary className="cursor-pointer px-3 py-2 text-[11px] tracking-[0.18em] uppercase text-brand-cream/55">Custom CSS (advanced)</summary>
                <div className="p-3 pt-0">
                  <textarea
                    defaultValue={theme.tokens.customCss ?? ""}
                    onBlur={e => e.target.value !== (theme.tokens.customCss ?? "") && patch(theme.id, { tokens: { customCss: e.target.value || undefined } })}
                    rows={6}
                    spellCheck={false}
                    className={INPUT + " font-mono"}
                    placeholder="/* applied to pages using this theme */"
                  />
                </div>
              </details>

              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                {!theme.isDefault && (
                  <button onClick={() => handleSetDefault(theme.id)} className="px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 text-[11px] font-semibold">
                    Set as default
                  </button>
                )}
                {!theme.isDefault && (
                  <button onClick={() => handleDelete(theme.id)} className="ml-auto px-3 py-1.5 rounded-lg text-red-400/85 hover:bg-red-500/10 text-[11px] font-semibold">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </details>
        ))}
      </div>
    </main>
  );
}
