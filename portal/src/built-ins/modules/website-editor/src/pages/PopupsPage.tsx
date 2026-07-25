"use client";

import { useEffect, useState } from "react";
import {
  getPopupConfig, savePopupConfig, resetPopupConfig, onPopupChange,
  type PopupConfig, type PopupTrigger,
} from "../lib/popup";
import Tip from "../components/Tip";
import { confirm } from "../lib/confirm";
import { notify } from "../lib/notify";
import AdminTabs from "../components/AdminTabs";
import { CONTENT_TABS } from "../lib/tabSets";

const INPUT = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-brand-orange/50";

export default function AdminPopupPage(_props: unknown) {
  const [cfg, setCfg] = useState<PopupConfig>(() => getPopupConfig());
  const [showOnInput, setShowOnInput] = useState("");
  const [hideOnInput, setHideOnInput] = useState("");

  useEffect(() => {
    setCfg(getPopupConfig());
    setShowOnInput(getPopupConfig().showOnPaths.join(", "));
    setHideOnInput(getPopupConfig().hideOnPaths.join(", "));
    return onPopupChange(() => {
      const next = getPopupConfig();
      setCfg(next);
      setShowOnInput(next.showOnPaths.join(", "));
      setHideOnInput(next.hideOnPaths.join(", "));
    });
  }, []);

  function patch<K extends keyof PopupConfig>(key: K, value: PopupConfig[K]) {
    savePopupConfig({ [key]: value } as Partial<PopupConfig>);
  }

  function commitPaths(field: "showOnPaths" | "hideOnPaths", raw: string) {
    const parsed = raw.split(",").map(s => s.trim()).filter(Boolean);
    savePopupConfig({ [field]: parsed } as Partial<PopupConfig>);
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6">
      <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">Marketing</p>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Discount popup</h1>
            <Tip
              id="popup.header"
              text="The discount popup runs on the storefront. Edit copy, change the trigger (delay/scroll/exit-intent/always), and set per-path targeting rules."
              align="bottom"
            />
          </div>
          <p className="text-brand-cream/45 text-sm mt-1">
            Edit the copy, trigger and targeting rules of the storefront discount popup.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              localStorage.removeItem("odo_discount_seen");
              notify({ tone: "ok", title: "Seen flag cleared", message: "Refresh the storefront and the popup will fire again." });
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-brand-cream/55 hover:text-brand-cream"
          >
            Reset seen flag
          </button>
          <button
            onClick={async () => { if (await confirm({ title: "Reset all popup settings to defaults?", confirmLabel: "Reset" })) resetPopupConfig(); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-brand-cream/55 hover:text-brand-cream"
          >
            Reset all
          </button>
        </div>
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-2xl border border-white/8 bg-brand-black-card">
        <div>
          <p className="text-sm font-medium text-brand-cream">Popup enabled</p>
          <p className="text-xs text-brand-cream/45 mt-0.5">Turn the storefront popup off entirely without losing your settings.</p>
        </div>
        <button
          onClick={() => patch("enabled", !cfg.enabled)}
          className={`w-12 h-6 rounded-full px-0.5 flex items-center transition-colors shrink-0 ${cfg.enabled ? "bg-brand-orange justify-end" : "bg-white/10 justify-start"}`}
        >
          <div className="w-5 h-5 rounded-full bg-white" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Form column */}
        <div className="space-y-5">
          {/* Trigger */}
          <Card title="Trigger" tip="When to show the popup. Delay = N seconds after page load. Scroll = after N% page scroll. Exit-intent = when the cursor leaves the viewport.">
            <Field label="Trigger type">
              <select value={cfg.trigger} onChange={e => patch("trigger", e.target.value as PopupTrigger)} className={INPUT}>
                <option value="delay">Time delay</option>
                <option value="scroll">Scroll percentage</option>
                <option value="exit">Exit intent</option>
                <option value="always">Immediate</option>
              </select>
            </Field>
            {cfg.trigger === "delay" && (
              <Field label="Delay (seconds)">
                <input type="number" min={0} max={120} value={cfg.delaySeconds}
                  onChange={e => patch("delaySeconds", Number(e.target.value))} className={INPUT} />
              </Field>
            )}
            {cfg.trigger === "scroll" && (
              <Field label="Scroll percentage">
                <input type="number" min={1} max={100} value={cfg.scrollPercent}
                  onChange={e => patch("scrollPercent", Number(e.target.value))} className={INPUT} />
              </Field>
            )}
          </Card>

          {/* Copy */}
          <Card title="Copy">
            <Field label="Eyebrow"><input value={cfg.eyebrow} onChange={e => patch("eyebrow", e.target.value)} className={INPUT} /></Field>
            <Field label="Headline"><input value={cfg.headline} onChange={e => patch("headline", e.target.value)} className={INPUT} /></Field>
            <Field label="Subheadline">
              <textarea value={cfg.subheadline} onChange={e => patch("subheadline", e.target.value)} rows={3} className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CTA button label"><input value={cfg.ctaLabel} onChange={e => patch("ctaLabel", e.target.value)} className={INPUT} /></Field>
              <Field label="Decline link label"><input value={cfg.declineLabel} onChange={e => patch("declineLabel", e.target.value)} className={INPUT} /></Field>
            </div>
            <Field label="Consent checkbox text">
              <textarea value={cfg.consentLabel} onChange={e => patch("consentLabel", e.target.value)} rows={2} className={INPUT} />
            </Field>
          </Card>

          {/* Discount reveal */}
          <Card title="Discount reveal" tip="Shown after the user submits their email. The discount code is dropped into checkout-ready format.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Discount code"><input value={cfg.discountCode} onChange={e => patch("discountCode", e.target.value.toUpperCase())} className={INPUT + " font-mono uppercase tracking-widest"} /></Field>
              <Field label="Success text"><input value={cfg.successText} onChange={e => patch("successText", e.target.value)} className={INPUT} /></Field>
              <Field label="Copy button label"><input value={cfg.copyLabel} onChange={e => patch("copyLabel", e.target.value)} className={INPUT} /></Field>
              <Field label="After-copy label"><input value={cfg.copiedLabel} onChange={e => patch("copiedLabel", e.target.value)} className={INPUT} /></Field>
            </div>
          </Card>

          {/* Targeting */}
          <Card title="Targeting" tip="Limit which paths the popup fires on. Leave 'Show on' empty to fire everywhere except the 'Hide on' paths.">
            <Field label="Show on paths (comma-separated, leave empty for all)">
              <input
                value={showOnInput}
                onChange={e => setShowOnInput(e.target.value)}
                onBlur={() => commitPaths("showOnPaths", showOnInput)}
                placeholder="e.g. /, /products, /collections"
                className={INPUT + " font-mono"}
              />
            </Field>
            <Field label="Hide on paths">
              <input
                value={hideOnInput}
                onChange={e => setHideOnInput(e.target.value)}
                onBlur={() => commitPaths("hideOnPaths", hideOnInput)}
                placeholder="/checkout, /admin, /account"
                className={INPUT + " font-mono"}
              />
            </Field>
          </Card>

          {/* Visibility rules */}
          <Card title="Visibility rules">
            <Toggle label="Hide for logged-in users" tip="Don't show to users who are already signed in." value={cfg.hideForLoggedIn} onChange={v => patch("hideForLoggedIn", v)} />
            <Toggle label="Hide after first dismissal" tip="Once a visitor closes the popup, don't show it again on this device." value={cfg.hideAfterSeen} onChange={v => patch("hideAfterSeen", v)} />
            <Toggle label="Hide for returning customers" tip="Don't show to people who've already placed an order." value={cfg.hideForReturningCustomers} onChange={v => patch("hideForReturningCustomers", v)} />
          </Card>

          {/* Styling */}
          <Card title="Styling">
            <Field label="Accent colour">
              <div className="flex items-center gap-2">
                <input type="color" value={cfg.accentColor} onChange={e => patch("accentColor", e.target.value)} className="w-12 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
                <input type="text" value={cfg.accentColor} onChange={e => patch("accentColor", e.target.value)} className={INPUT + " font-mono"} />
              </div>
            </Field>
          </Card>
        </div>

        {/* Live preview column */}
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <p className="text-xs tracking-[0.22em] uppercase text-brand-cream/45 px-1">Live preview</p>
          <div className="rounded-2xl border border-white/8 bg-black/40 p-4 overflow-hidden">
            <div className="rounded-2xl bg-brand-black-card border border-brand-purple/20 p-6 text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1" style={{ background: `linear-gradient(to right, ${cfg.accentColor}, #ffb84d, #b478e0)` }} />
              <p className="text-[9px] tracking-[0.3em] uppercase mb-2" style={{ color: cfg.accentColor }}>{cfg.eyebrow}</p>
              <h3 className="font-display text-xl font-bold text-brand-cream leading-tight mb-2">{cfg.headline}</h3>
              <p className="text-xs text-brand-cream/55 leading-relaxed mb-4">{cfg.subheadline}</p>
              <div className="text-[10px] text-brand-cream/30 mb-2 truncate">{cfg.consentLabel}</div>
              <button
                disabled
                className="w-full py-2.5 rounded-lg text-white text-xs font-semibold cursor-default"
                style={{ background: cfg.accentColor }}
              >
                {cfg.ctaLabel}
              </button>
              <div className="mt-3 text-[9px] tracking-widest uppercase text-brand-cream/30">{cfg.declineLabel}</div>
            </div>
            <p className="text-[11px] text-brand-cream/35 mt-3 leading-relaxed">
              Trigger: <span className="text-brand-cream/55">{cfg.trigger}{cfg.trigger === "delay" ? ` after ${cfg.delaySeconds}s` : cfg.trigger === "scroll" ? ` at ${cfg.scrollPercent}%` : ""}</span><br/>
              Code: <span className="font-mono text-brand-amber">{cfg.discountCode}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, tip, children }: { title: string; tip?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-brand-black-card overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 bg-brand-black-soft/40 flex items-center gap-2">
        <h2 className="text-xs tracking-[0.22em] uppercase text-brand-cream/60">{title}</h2>
        {tip && <Tip text={tip} />}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] tracking-[0.18em] uppercase text-brand-cream/50 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, tip, value, onChange }: { label: string; tip?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-brand-cream/70 flex-1 flex items-center gap-1.5">
        {label}
        {tip && <Tip text={tip} />}
      </span>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${value ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"}`}
      >
        <div className="w-4 h-4 rounded-full bg-white" />
      </button>
    </div>
  );
}
