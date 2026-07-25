"use client";

// SettingsPage — per-install Anthropic API key + model preferences.
// Round-7.

import { useEffect, useState } from "react";

interface Settings {
  anthropicApiKey?: string;
  hasApiKey?: boolean;
  defaultModel?: string;
  fallbackModel?: string;
  cacheSystemPrompt?: boolean;
  maxTokens?: number;
  imageProvider?: "stub" | "openai";
  openaiApiKey?: string;
  monthlyTokenCeiling?: number;
  monthlyImageCeiling?: number;
}

interface UsageSnapshot {
  monthKey: string;
  tokens: number;
  images: number;
  tokenCeiling: number;
  imageCeiling: number;
  resetsOn: string;
}

export default function SettingsPage(_props: unknown) {
  const [settings, setSettings] = useState<Settings>({});
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/portal/ai-builder/settings", { cache: "no-store", credentials: "include" })
        .then(r => (r.ok ? r.json() as Promise<{ ok: boolean; settings?: Settings }> : Promise.resolve({ ok: false } as { ok: boolean; settings?: Settings }))),
      fetch("/api/portal/ai-builder/usage", { cache: "no-store", credentials: "include" })
        .then(r => (r.ok ? r.json() as Promise<{ ok: boolean; usage?: UsageSnapshot }> : Promise.resolve({ ok: false } as { ok: boolean; usage?: UsageSnapshot }))),
    ]).then(([s, u]) => {
      if (cancelled) return;
      if (s.ok && s.settings) setSettings(s.settings);
      if (u.ok && u.usage) setUsage(u.usage);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(s => ({ ...s, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/portal/ai-builder/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        // Re-fetch to pick up the masked API key.
        const next = await fetch("/api/portal/ai-builder/settings", { cache: "no-store", credentials: "include" });
        const data = await next.json() as { ok: boolean; settings?: Settings };
        if (data.ok && data.settings) setSettings(data.settings);
      }
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-brand-cream/45">Loading…</div>;

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-3xl space-y-6">
      <header>
        <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">AI</p>
        <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Settings</h1>
        <p className="text-brand-cream/45 text-sm mt-1">Per-install configuration. The API key never leaves the server.</p>
      </header>

      <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-brand-cream">Anthropic API</h2>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-[0.18em] text-brand-amber mb-1">API key</span>
          <input
            type="password"
            value={settings.anthropicApiKey ?? ""}
            onChange={e => patch("anthropicApiKey", e.target.value)}
            placeholder={settings.hasApiKey ? "•••••••••••• (replace to update)" : "sk-ant-..."}
            className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream font-mono"
          />
          <span className="block text-[11px] text-brand-cream/45 mt-1">
            {settings.hasApiKey ? "A key is configured. Leave the masked value to keep it." : "No key set yet."}
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-brand-cream">Models</h2>
        <Field label="Default model">
          <select
            value={settings.defaultModel ?? "claude-haiku-4-5-20251001"}
            onChange={e => patch("defaultModel", e.target.value)}
            className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
          >
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (recommended)</option>
            <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
            <option value="claude-opus-4-7">Claude Opus 4.7</option>
          </select>
        </Field>
        <Field label="Fallback model (used after schema-validation failure)">
          <select
            value={settings.fallbackModel ?? "claude-sonnet-4-6"}
            onChange={e => patch("fallbackModel", e.target.value)}
            className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
          >
            <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
            <option value="claude-opus-4-7">Claude Opus 4.7</option>
          </select>
        </Field>
        <Field label="Max output tokens per generation">
          <input
            type="number"
            value={settings.maxTokens ?? 4096}
            onChange={e => patch("maxTokens", Number(e.target.value))}
            className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.cacheSystemPrompt !== false}
            onChange={e => patch("cacheSystemPrompt", e.target.checked)}
          />
          Enable prompt caching (huge cost saver — keep on unless debugging)
        </label>
      </section>

      <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-brand-cream">Image generation (R9)</h2>
        <Field label="Provider">
          <select
            value={settings.imageProvider ?? "stub"}
            onChange={e => patch("imageProvider", e.target.value as "stub" | "openai")}
            className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
          >
            <option value="stub">Picsum placeholder (no key needed)</option>
            <option value="openai">OpenAI gpt-image-1</option>
          </select>
        </Field>
        {settings.imageProvider === "openai" && (
          <Field label="OpenAI API key">
            <input
              type="password"
              value={settings.openaiApiKey ?? ""}
              onChange={e => patch("openaiApiKey", e.target.value)}
              placeholder="sk-..."
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream font-mono"
            />
          </Field>
        )}
      </section>

      <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-brand-cream">Usage + ceilings (R9)</h2>
        {usage ? (
          <div className="grid grid-cols-2 gap-4 text-xs">
            <UsageMeter label="Tokens this month" used={usage.tokens} ceiling={usage.tokenCeiling} unit="tokens" />
            <UsageMeter label="Images this month" used={usage.images} ceiling={usage.imageCeiling} unit="images" />
            <p className="col-span-2 text-brand-cream/45">
              Period: {usage.monthKey}. Resets {new Date(usage.resetsOn).toLocaleString()}.
            </p>
          </div>
        ) : (
          <p className="text-xs text-brand-cream/45">Usage data unavailable.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monthly token ceiling">
            <input
              type="number"
              min={usage?.tokens ?? 0}
              value={settings.monthlyTokenCeiling ?? 10_000_000}
              onChange={e => patch("monthlyTokenCeiling", Number(e.target.value))}
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
            />
          </Field>
          <Field label="Monthly image ceiling">
            <input
              type="number"
              min={usage?.images ?? 0}
              value={settings.monthlyImageCeiling ?? 200}
              onChange={e => patch("monthlyImageCeiling", Number(e.target.value))}
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="text-sm px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-light text-white font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-xs text-green-300">✓ Saved</span>}
      </div>
    </div>
  );
}

function UsageMeter({ label, used, ceiling, unit }: { label: string; used: number; ceiling: number; unit: string }) {
  const pct = ceiling > 0 ? Math.min(100, Math.round((used / ceiling) * 100)) : 0;
  const colour = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-brand-amber mb-1">{label}</p>
      <p className="text-brand-cream font-mono">{used.toLocaleString()} / {ceiling.toLocaleString()} {unit} ({pct}%)</p>
      <div className="h-1.5 mt-1 bg-white/5 rounded">
        <div className={`h-full rounded ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.18em] text-brand-amber mb-1">{label}</span>
      {children}
    </label>
  );
}
