"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { confirm } from "../lib/confirm";
import { notify } from "../lib/notify";
import { prompt } from "../lib/prompt";
import {
  getBranding, saveBranding, resetBranding,
  listCustomTabs, createCustomTab, updateCustomTab, deleteCustomTab, moveCustomTab,
  onAdminConfigChange,
  type AdminBranding, type CustomTab,
} from "../lib/customise";
import {
  getLoginCustomisation, saveLoginCustomisation, resetLoginCustomisation,
  onLoginCustomisationChange,
  type LoginCustomisation, type LoginLayout,
} from "../lib/loginCustomisation";
import {
  getSidebarLayout, saveSidebarLayout, resetSidebarLayout,
  onSidebarLayoutChange, newId, DEFAULT_LAYOUT,
  MAX_SIDEBAR_DEPTH, canAddFolderInside,
  type SidebarLayout, type SidebarPanel, type SidebarItem,
} from "../lib/sidebarLayout";
import Tip from "../components/Tip";
import PluginRequired from "../lib/pluginRequired";
import {
  getEditorComplexity, setEditorComplexity, onEditorComplexityChange,
  COMPLEXITY_OPTIONS,
  type EditorComplexity,
} from "../lib/editorMode";
import AdminTabs from "../components/AdminTabs";
import { SETTINGS_TABS } from "../lib/tabSets";

type Tab = "branding" | "sidebar" | "tabs" | "login" | "export";

export default function AdminCustomisePage(_props: unknown) {
  return <PluginRequired plugin="brand"><AdminCustomisePageInner /></PluginRequired>;
}

function AdminCustomisePageInner() {
  const [tab, setTab] = useState<Tab>("branding");
  const [branding, setBranding] = useState<AdminBranding>(getBranding);
  const [tabs, setTabs] = useState<CustomTab[]>(listCustomTabs);
  const [login, setLogin] = useState<LoginCustomisation>(getLoginCustomisation);
  const [sidebar, setSidebar] = useState<SidebarLayout>(getSidebarLayout);
  const [editorComplexity, setEditorComplexityState] = useState<EditorComplexity>(getEditorComplexity);
  const [exporting, setExporting] = useState(false);

  // Sync if the operator flips complexity from inside the editor.
  useEffect(() => onEditorComplexityChange(() => setEditorComplexityState(getEditorComplexity())), []);

  function selectEditorComplexity(c: EditorComplexity) {
    setEditorComplexity(c);
    setEditorComplexityState(c);
  }

  useEffect(() => {
    const refresh = () => {
      setBranding(getBranding());
      setTabs(listCustomTabs());
    };
    refresh();
    const off1 = onAdminConfigChange(refresh);
    const off2 = onLoginCustomisationChange(() => setLogin(getLoginCustomisation()));
    const off3 = onSidebarLayoutChange(() => setSidebar(getSidebarLayout()));
    return () => { off1(); off2(); off3(); };
  }, []);

  function patchSidebar(next: SidebarLayout) {
    saveSidebarLayout(next);
    setSidebar(next);
  }

  function patchBranding(p: Partial<AdminBranding>) {
    saveBranding(p);
    setBranding({ ...branding, ...p });
  }

  function patchLogin(p: Partial<LoginCustomisation>) {
    saveLoginCustomisation(p);
    setLogin({ ...login, ...p });
  }

  async function exportCode() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/export-code");
      if (!res.ok) {
        notify({ tone: "error", title: "Export failed", message: res.statusText });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `luv-ker-website-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify({ tone: "error", title: "Export failed", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  }

  const TABS: Array<{ id: Tab; label: string; desc: string }> = [
    { id: "branding", label: "Branding",      desc: "Logo, colours, custom CSS" },
    { id: "sidebar",  label: "Sidebar",       desc: `Edit panels, links, and nested folders (up to ${MAX_SIDEBAR_DEPTH} levels deep)` },
    { id: "tabs",     label: "Custom tabs",   desc: "Add iframe-embedded sidebar tabs" },
    { id: "login",    label: "Login page",    desc: "Customise the public login UI" },
    { id: "export",   label: "Export & repo", desc: "Download code and view repo" },
  ];

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6">
      <AdminTabs tabs={SETTINGS_TABS} ariaLabel="Settings" />
      <div>
        <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">Admin panel</p>
        <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Customise the panel</h1>
        <p className="text-brand-cream/45 text-sm mt-1">
          Make this admin panel your own — branding, custom embedded tabs, login page, and code export.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.desc}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.id ? "border-brand-orange text-brand-cream" : "border-transparent text-brand-cream/50 hover:text-brand-cream/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BRANDING ───────────────────────────────────────────────────────── */}
      {tab === "branding" && (
        <div className="space-y-5">
          <Card title="Names & logo" tip="The panel name and short name shown in the sidebar header.">
            <Field label="Panel name" tip="Full name shown at the top of the sidebar.">
              <input value={branding.panelName} onChange={e => patchBranding({ panelName: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Short name / subtitle" tip="Smaller text under the panel name, e.g. 'Admin'.">
              <input value={branding.shortName} onChange={e => patchBranding({ shortName: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Logo URL or data URI" tip="An image shown beside the panel name. Leave empty for text-only.">
              <input value={branding.logoUrl} onChange={e => patchBranding({ logoUrl: e.target.value })} placeholder="https://… or data:image/…" className={INPUT} />
            </Field>
            {branding.logoUrl && (
              <div className="mt-2 flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt="Logo preview" className="h-8 w-auto object-contain" />
                <span className="text-xs text-brand-cream/45">Logo preview</span>
              </div>
            )}
          </Card>

          <Card title="Colours" tip="Override the admin panel colours. Each admin can also pick a built-in mode (dark/light/sand/midnight) from the sidebar — those override these unless 'Custom' is selected.">
            <ColorRow label="Accent colour"   tip="Primary buttons, active nav highlights." value={branding.accentColor}  onChange={v => patchBranding({ accentColor: v })} />
            <ColorRow label="Sidebar background" tip="Used when admin mode is 'Custom'." value={branding.sidebarBg}   onChange={v => patchBranding({ sidebarBg: v })} />
            <ColorRow label="Sidebar text"    tip="Used when admin mode is 'Custom'." value={branding.sidebarText} onChange={v => patchBranding({ sidebarText: v })} />
            <ColorRow label="Panel background"   tip="Used when admin mode is 'Custom'." value={branding.panelBg}    onChange={v => patchBranding({ panelBg: v })} />
            <ColorRow label="Panel text"      tip="Used when admin mode is 'Custom'." value={branding.panelText}  onChange={v => patchBranding({ panelText: v })} />
          </Card>

          <Card title="GitHub repository" tip="A link to your code repository, shown in the sidebar footer.">
            <Field label="Repository URL" tip="e.g. https://github.com/yourorg/yourrepo">
              <input value={branding.githubRepoUrl} onChange={e => patchBranding({ githubRepoUrl: e.target.value })} placeholder="https://github.com/…" className={INPUT} />
            </Field>
          </Card>

          <Card title="Custom CSS" tip="Power-user override. Wraps inside [data-admin-panel] scope automatically.">
            <textarea
              value={branding.customCSS}
              onChange={e => patchBranding({ customCSS: e.target.value })}
              rows={6}
              placeholder="/* e.g. */&#10;[data-admin-panel] aside { box-shadow: inset -1px 0 0 rgba(255,107,53,0.3); }"
              className={INPUT + " font-mono text-xs"}
            />
          </Card>

          <Card title="Visual editor mode" tip="Choose how much editor surface to show by default. Each editor also has its own switcher in the toolbar so you can change on the fly.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {COMPLEXITY_OPTIONS.map(opt => {
                const active = editorComplexity === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => selectEditorComplexity(opt.id)}
                    aria-pressed={active}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      active
                        ? "border-brand-orange bg-brand-orange/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25"
                    }`}
                  >
                    <p className={`text-[13px] font-semibold ${active ? "text-brand-cream" : "text-brand-cream/85"}`}>
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-brand-cream/55 mt-1 leading-relaxed">{opt.description}</p>
                    {active && <p className="text-[10px] tracking-wider uppercase text-brand-orange/85 mt-2">Default</p>}
                  </button>
                );
              })}
            </div>
          </Card>

          <div>
            <button
              onClick={async () => { if (await confirm({ title: "Reset all branding to defaults?", confirmLabel: "Reset" })) { resetBranding(); setBranding(getBranding()); } }}
              className="text-xs text-brand-cream/45 hover:text-brand-orange"
            >
              Reset branding to defaults
            </button>
          </div>
        </div>
      )}

      {/* ── SIDEBAR ────────────────────────────────────────────────────────── */}
      {tab === "sidebar" && (
        <SidebarEditor
          layout={sidebar}
          onChange={patchSidebar}
          onReset={() => { resetSidebarLayout(); setSidebar(getSidebarLayout()); }}
        />
      )}

      {/* ── CUSTOM TABS ────────────────────────────────────────────────────── */}
      {tab === "tabs" && (
        <div className="space-y-5">
          <Card title="What are custom tabs?" tip="Add your own sidebar tabs that embed any external site via iframe — Notion, Google Docs, Stripe Dashboard, third-party tools, anything.">
            <p className="text-sm text-brand-cream/55 leading-relaxed">
              Add custom tabs to your sidebar that embed any URL via iframe.
              Useful for Notion docs, Stripe dashboard, third-party tools, or any internal page.
            </p>
            <button
              onClick={async () => {
                const label = await prompt({ title: "Tab label", defaultValue: "My tab", placeholder: "Notion docs" });
                if (!label) return;
                const url = await prompt({ title: "URL to embed", placeholder: "https://", defaultValue: "https://" });
                if (!url) return;
                createCustomTab({
                  label,
                  embedUrl: url,
                  icon: "🔗",
                  group: "Custom",
                  openInNewTab: false,
                  visibleToRoles: [],
                });
              }}
              className="mt-3 text-xs px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold"
            >
              + New custom tab
            </button>
          </Card>

          {tabs.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-brand-black-card px-6 py-10 text-center">
              <p className="text-brand-cream/45 text-sm">No custom tabs yet. Add one above.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-brand-black-card divide-y divide-white/5 overflow-hidden">
              {tabs.map((t, i) => (
                <CustomTabRow
                  key={t.id}
                  tab={t}
                  isFirst={i === 0}
                  isLast={i === tabs.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LOGIN PAGE ─────────────────────────────────────────────────────── */}
      {tab === "login" && (
        <div className="space-y-5">
          {/* Bridge to the new portal-variant editor. The fields below are
              the simple form-based customisation (kept for back-compat);
              for full block-tree control, the operator designs a "login"
              portal variant in /admin/portals → Login. */}
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] tracking-[0.28em] uppercase text-cyan-300 mb-1">New</p>
              <p className="text-[13px] text-brand-cream">Want full control over the login layout?</p>
              <p className="text-[12px] text-brand-cream/55 leading-relaxed">
                Design a login variant block-by-block in the visual editor — heroes, custom CTAs,
                multiple variants you can A/B between. The fields below stay as the quick-config fallback.
              </p>
            </div>
            <a
              href="/admin/portals?role=login"
              className="text-[11px] px-3 py-2 rounded-md border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/10 shrink-0 self-start sm:self-auto"
            >
              Open portal editor →
            </a>
          </div>

          <Card title="Layout" tip="Choose between a centered card, a split with hero image, or a minimal layout.">
            <div className="grid grid-cols-3 gap-2">
              {(["centered", "split", "minimal"] as LoginLayout[]).map(l => (
                <button
                  key={l}
                  onClick={() => patchLogin({ layout: l })}
                  className={`px-3 py-3 rounded-xl border text-xs capitalize transition-colors ${
                    login.layout === l ? "border-brand-orange bg-brand-orange/10 text-brand-cream" : "border-white/10 text-brand-cream/55 hover:border-white/25"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Headlines" tip="The text shown on the login and signup forms.">
            <Field label="Login headline"   tip="The main heading on the sign-in form."><input value={login.headline}        onChange={e => patchLogin({ headline: e.target.value })}        className={INPUT} /></Field>
            <Field label="Login subheadline" tip="The subtitle under the login headline."><input value={login.subheadline}     onChange={e => patchLogin({ subheadline: e.target.value })}     className={INPUT} /></Field>
            <Field label="Signup headline"  tip="The main heading on the sign-up form."><input value={login.signupHeadline}    onChange={e => patchLogin({ signupHeadline: e.target.value })}    className={INPUT} /></Field>
            <Field label="Signup subheadline" tip="The subtitle under the signup headline."><input value={login.signupSubheadline} onChange={e => patchLogin({ signupSubheadline: e.target.value })} className={INPUT} /></Field>
            <Field label="Login button label"  tip="Text on the sign-in submit button."><input value={login.loginButtonLabel}  onChange={e => patchLogin({ loginButtonLabel: e.target.value })}  className={INPUT} /></Field>
            <Field label="Signup button label" tip="Text on the sign-up submit button."><input value={login.signupButtonLabel} onChange={e => patchLogin({ signupButtonLabel: e.target.value })} className={INPUT} /></Field>
          </Card>

          <Card title="Branding" tip="Logo and colours specifically for the login page.">
            <Field label="Logo URL" tip="A custom logo for the login page only."><input value={login.logoUrl} onChange={e => patchLogin({ logoUrl: e.target.value })} placeholder="https://… or empty" className={INPUT} /></Field>
            <ToggleRow label="Show logo" tip="Hide the logo entirely if you want a text-only header." value={login.showLogo} onChange={v => patchLogin({ showLogo: v })} />
            <ColorRow label="Primary / accent" tip="Submit button colour."   value={login.primaryColor} onChange={v => patchLogin({ primaryColor: v })} />
          </Card>

          <Card title="Hero image (split layout)" tip="The background image shown beside the form when layout is 'split'.">
            <Field label="Image URL" tip="An image URL or data URI."><input value={login.heroImage} onChange={e => patchLogin({ heroImage: e.target.value })} placeholder="https://…" className={INPUT} /></Field>
            <ColorRow label="Overlay colour" tip="A semi-transparent colour layered on top of the image." value={login.heroOverlayColor} onChange={v => patchLogin({ heroOverlayColor: v })} />
            <Field label={`Overlay opacity (${Math.round(login.heroOverlayOpacity * 100)}%)`} tip="0% = no overlay, 100% = solid colour blocks the image.">
              <input type="range" min={0} max={1} step={0.05} value={login.heroOverlayOpacity} onChange={e => patchLogin({ heroOverlayOpacity: Number(e.target.value) })} className="w-full accent-brand-orange" />
            </Field>
          </Card>

          <Card title="Features" tip="Toggle which login features are available.">
            <ToggleRow label="Enable Google sign-in"  tip="Show 'Continue with Google' button."   value={login.enableGoogle}  onChange={v => patchLogin({ enableGoogle: v })} />
            <ToggleRow label="Enable signup"          tip="Allow new accounts to be created here."  value={login.enableSignup}  onChange={v => patchLogin({ enableSignup: v })} />
            <ToggleRow label="Enable forgot password" tip="Show the 'Forgot your password?' link." value={login.enableForgotPassword} onChange={v => patchLogin({ enableForgotPassword: v })} />
            <ToggleRow label="Show social proof"      tip="Show a small line of customer count / trust signal under the form." value={login.showSocialProof} onChange={v => patchLogin({ showSocialProof: v })} />
            {login.showSocialProof && (
              <Field label="Social proof text" tip="Shown below the form."><input value={login.socialProofText} onChange={e => patchLogin({ socialProofText: e.target.value })} className={INPUT} /></Field>
            )}
          </Card>

          <Card title="Custom CSS" tip="Power-user override applied only on the /account page.">
            <textarea
              value={login.customCSS}
              onChange={e => patchLogin({ customCSS: e.target.value })}
              rows={5}
              placeholder="/* e.g. */&#10;[data-login-page] form { backdrop-filter: blur(20px); }"
              className={INPUT + " font-mono text-xs"}
            />
          </Card>

          <div className="flex flex-wrap gap-3 items-center">
            <Link href="/account" target="_blank" className="text-xs px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold">
              Preview /account ↗
            </Link>
            <button
              onClick={async () => { if (await confirm({ title: "Reset login customisation to defaults?", confirmLabel: "Reset" })) { resetLoginCustomisation(); setLogin(getLoginCustomisation()); } }}
              className="text-xs text-brand-cream/45 hover:text-brand-orange"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}

      {/* ── EXPORT & REPO ──────────────────────────────────────────────────── */}
      {tab === "export" && (
        <div className="space-y-5">
          <Card title="Download website code" tip="Downloads a zip of the entire src/ directory — every component, library, and page.">
            <p className="text-sm text-brand-cream/55 leading-relaxed">
              Get a complete copy of the website code as a ZIP file.
              Useful for backup, audit, or migration.
            </p>
            <button
              onClick={exportCode}
              disabled={exporting}
              className="mt-3 text-xs px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold disabled:opacity-60"
            >
              {exporting ? "Preparing zip…" : "↓ Export website code"}
            </button>
          </Card>

          <Card title="GitHub repository" tip="Link to your codebase on GitHub.">
            {branding.githubRepoUrl ? (
              <a
                href={branding.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 text-brand-cream hover:border-brand-orange hover:text-brand-orange text-sm transition-colors"
              >
                <span>🔗</span> View repo ↗
              </a>
            ) : (
              <p className="text-sm text-brand-cream/45">
                No repository URL configured. Set one in the <button onClick={() => setTab("branding")} className="text-brand-orange hover:underline">Branding tab</button>.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Custom tab editor row ────────────────────────────────────────────────────

function CustomTabRow({ tab, isFirst, isLast }: { tab: CustomTab; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab);
  useEffect(() => setDraft(tab), [tab]);

  function save() {
    updateCustomTab(tab.id, {
      label: draft.label,
      embedUrl: draft.embedUrl,
      icon: draft.icon,
      group: draft.group,
      openInNewTab: draft.openInNewTab,
    });
    setEditing(false);
  }

  return (
    <div className="px-4 py-3">
      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-2">
            <input value={draft.icon} onChange={e => setDraft({ ...draft, icon: e.target.value })} placeholder="Icon" className={INPUT + " w-16 text-center"} />
            <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Label" className={INPUT} />
            <input value={draft.group} onChange={e => setDraft({ ...draft, group: e.target.value })} placeholder="Group" className={INPUT} />
          </div>
          <input value={draft.embedUrl} onChange={e => setDraft({ ...draft, embedUrl: e.target.value })} placeholder="https://…" className={INPUT + " font-mono text-xs"} />
          <label className="flex items-center gap-2 text-xs text-brand-cream/55">
            <input type="checkbox" checked={draft.openInNewTab} onChange={e => setDraft({ ...draft, openInNewTab: e.target.checked })} />
            Open in new browser tab instead of iframe
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={save} className="text-xs px-3 py-1.5 rounded-lg bg-brand-orange text-white font-semibold">Save</button>
            <button onClick={() => { setDraft(tab); setEditing(false); }} className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/55">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-xl shrink-0">{tab.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brand-cream truncate">{tab.label}</p>
            <p className="text-[11px] text-brand-cream/35 font-mono truncate">{tab.embedUrl}</p>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-brand-cream/40 shrink-0">{tab.group}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button disabled={isFirst} onClick={() => moveCustomTab(tab.id, -1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↑</button>
            <button disabled={isLast} onClick={() => moveCustomTab(tab.id, 1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↓</button>
            <button onClick={() => setEditing(true)} className="text-[11px] px-2 py-1 text-brand-cream/55 hover:text-brand-cream">Edit</button>
            <button
              onClick={async () => { if (await confirm({ title: `Delete "${tab.label}"?`, danger: true, confirmLabel: "Delete tab" })) deleteCustomTab(tab.id); }}
              className="text-[11px] px-2 py-1 text-brand-cream/45 hover:text-brand-orange"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── UI helpers (with tooltips) ───────────────────────────────────────────────

const INPUT = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-brand-orange/50";

function Card({ title, tip, children }: { title: string; tip?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-cream/50">{title}</p>
        {tip && <Tip text={tip} />}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="block text-[11px] tracking-[0.18em] uppercase text-brand-cream/50">{label}</label>
        {tip && <Tip text={tip} />}
      </div>
      {children}
    </div>
  );
}

function ColorRow({ label, value, onChange, tip }: { label: string; value: string; onChange: (v: string) => void; tip?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-brand-cream/70 flex-1 flex items-center gap-1.5">
        {label}
        {tip && <Tip text={tip} />}
      </span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded-lg border border-white/20 cursor-pointer bg-transparent" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-24 text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-brand-cream font-mono focus:outline-none focus:border-brand-orange/50" />
      </div>
    </div>
  );
}

// ─── Sidebar editor ──────────────────────────────────────────────────────────

function SidebarEditor({
  layout, onChange, onReset,
}: {
  layout: SidebarLayout;
  onChange: (l: SidebarLayout) => void;
  onReset: () => void;
}) {
  function updatePanels(panels: SidebarPanel[]) {
    onChange({ ...layout, panels });
  }
  function patchPanel(id: string, patch: Partial<SidebarPanel>) {
    updatePanels(layout.panels.map(p => p.id === id ? { ...p, ...patch } : p));
  }
  function movePanel(id: string, dir: -1 | 1) {
    const idx = layout.panels.findIndex(p => p.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= layout.panels.length) return;
    const next = [...layout.panels];
    { const a = next[idx]!; const b = next[j]!; next[idx] = b; next[j] = a; }
    updatePanels(next);
  }
  async function deletePanel(id: string) {
    if (!(await confirm({ title: "Delete this panel and all its items?", message: "Sub-folders and links underneath are removed too.", danger: true, confirmLabel: "Delete panel" }))) return;
    updatePanels(layout.panels.filter(p => p.id !== id));
  }
  async function addPanel() {
    const label = await prompt({ title: "Panel name", defaultValue: "New panel", placeholder: "Marketing" });
    if (!label) return;
    const icon = (await prompt({ title: "Icon", message: "Emoji or short text shown in the sidebar.", defaultValue: "✨" })) ?? "✨";
    updatePanels([...layout.panels, {
      id: newId("panel"),
      label,
      icon,
      description: "",
      items: [],
    }]);
  }

  return (
    <div className="space-y-5">
      <Card title="How it works" tip="The admin sidebar is organised as top-level panels. Click a panel to drill in; click 'All panels' to come back.">
        <p className="text-sm text-brand-cream/55 leading-relaxed">
          The sidebar opens with a list of <strong className="text-brand-cream">panels</strong> (Store, Website, Users, Settings).
          Clicking a panel <strong className="text-brand-cream">drills in</strong> and shows that panel&apos;s items;
          a back button returns to the top level. Each item can be a <strong className="text-brand-cream">link</strong> or a
          <strong className="text-brand-cream"> folder</strong>; folders can hold further folders, up to
          <strong className="text-brand-cream"> {MAX_SIDEBAR_DEPTH} levels deep</strong> (counting the panel as level 1).
          Links accept either internal admin paths or external URLs.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button onClick={addPanel} className="text-xs px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold">
            + Add panel
          </button>
          <button onClick={onReset} className="text-xs px-3 py-2 rounded-lg border border-white/10 text-brand-cream/60 hover:text-brand-cream">
            Reset to defaults
          </button>
        </div>
      </Card>

      <div className="space-y-4">
        {layout.panels.map((panel, i) => (
          <PanelEditor
            key={panel.id}
            panel={panel}
            isFirst={i === 0}
            isLast={i === layout.panels.length - 1}
            onPatch={p => patchPanel(panel.id, p)}
            onMove={d => movePanel(panel.id, d)}
            onDelete={() => deletePanel(panel.id)}
            onItemsChange={items => patchPanel(panel.id, { items })}
          />
        ))}
        {layout.panels.length === 0 && (
          <div className="rounded-2xl border border-white/8 bg-brand-black-card px-6 py-10 text-center">
            <p className="text-brand-cream/45 text-sm mb-3">No panels yet — your sidebar will be empty.</p>
            <button
              onClick={() => onChange(DEFAULT_LAYOUT)}
              className="text-xs px-4 py-2 rounded-lg bg-brand-orange text-white font-semibold"
            >
              Restore defaults
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelEditor({
  panel, isFirst, isLast, onPatch, onMove, onDelete, onItemsChange,
}: {
  panel: SidebarPanel;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (p: Partial<SidebarPanel>) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onItemsChange: (items: SidebarItem[]) => void;
}) {
  async function addLink() {
    const label = await prompt({ title: "Link label", defaultValue: "New link", placeholder: "Refunds dashboard" });
    if (!label) return;
    const href = await prompt({ title: "URL or admin path", message: "Use /admin/foo for internal pages or https://… for external.", defaultValue: "/admin/" });
    if (!href) return;
    onItemsChange([...panel.items, {
      type: "link",
      id: newId("link"),
      label,
      href,
      external: href.startsWith("http"),
    }]);
  }
  // Panels sit at depth 1, so their direct children sit at depth 2. Adding a
  // folder here always fits within the depth budget.
  const canAddFolder = canAddFolderInside(1);

  async function addGroup() {
    if (!canAddFolder) return;
    const label = await prompt({ title: "Folder name", defaultValue: "New folder", placeholder: "Reports" });
    if (!label) return;
    onItemsChange([...panel.items, {
      type: "group",
      id: newId("group"),
      label,
      defaultOpen: true,
      items: [],
    }]);
  }
  function patchItem(id: string, patch: Partial<SidebarItem>) {
    onItemsChange(panel.items.map(it => it.id === id
      ? { ...it, ...patch } as SidebarItem
      : it,
    ));
  }
  async function deleteItem(id: string) {
    if (!(await confirm({ title: "Delete this item?", danger: true, confirmLabel: "Delete" }))) return;
    onItemsChange(panel.items.filter(it => it.id !== id));
  }
  function moveItem(id: string, dir: -1 | 1) {
    const idx = panel.items.findIndex(it => it.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= panel.items.length) return;
    const next = [...panel.items];
    { const a = next[idx]!; const b = next[j]!; next[idx] = b; next[j] = a; }
    onItemsChange(next);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center gap-3">
        <input
          value={panel.icon}
          onChange={e => onPatch({ icon: e.target.value })}
          placeholder="Icon"
          className={INPUT + " w-14 text-center"}
        />
        <input
          value={panel.label}
          onChange={e => onPatch({ label: e.target.value })}
          placeholder="Panel name"
          className={INPUT + " flex-1 font-semibold"}
        />
        <div className="flex items-center gap-1">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25" title="Move up">↑</button>
          <button disabled={isLast} onClick={() => onMove(1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25" title="Move down">↓</button>
          <button onClick={onDelete} className="text-[11px] px-2 py-1 text-brand-cream/45 hover:text-brand-orange">Delete</button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <input
          value={panel.description ?? ""}
          onChange={e => onPatch({ description: e.target.value })}
          placeholder="Short description (shown under the panel name)"
          className={INPUT}
        />

        <div className="space-y-1.5 pt-1">
          {panel.items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              depth={2}
              isFirst={i === 0}
              isLast={i === panel.items.length - 1}
              onPatch={p => patchItem(item.id, p)}
              onMove={d => moveItem(item.id, d)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
          {panel.items.length === 0 && (
            <p className="text-xs text-brand-cream/35 px-3 py-3 text-center">
              No items in this panel yet.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={addLink} className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/70 hover:text-brand-cream hover:border-white/30">
            + Link
          </button>
          <button
            onClick={addGroup}
            disabled={!canAddFolder}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-white/15 text-brand-cream/70 hover:text-brand-cream hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            + Folder
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemEditor({
  item, depth, isFirst, isLast, onPatch, onMove, onDelete,
}: {
  item: SidebarItem;
  depth: number;            // 2 for direct panel children, +1 per nested level
  isFirst: boolean;
  isLast: boolean;
  onPatch: (p: Partial<SidebarItem>) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  if (item.type === "link") {
    return (
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded-lg border border-white/5 bg-white/[0.015]">
        <span className="text-[10px] uppercase tracking-wider text-brand-cream/35 w-12 shrink-0">Link</span>
        <input
          value={item.label}
          onChange={e => onPatch({ label: e.target.value } as Partial<SidebarItem>)}
          placeholder="Label"
          className={INPUT + " flex-1 min-w-[120px]"}
        />
        <input
          value={item.href}
          onChange={e => onPatch({ href: e.target.value, external: e.target.value.startsWith("http") } as Partial<SidebarItem>)}
          placeholder="/admin/… or https://…"
          className={INPUT + " flex-[2] min-w-[180px] font-mono text-xs"}
        />
        <div className="flex items-center gap-1">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↑</button>
          <button disabled={isLast} onClick={() => onMove(1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↓</button>
          <button onClick={onDelete} className="text-[11px] px-2 py-1 text-brand-cream/45 hover:text-brand-orange">×</button>
        </div>
      </div>
    );
  }
  // Folder editor — narrows `item` so the closures below see the group shape.
  const group = item;
  const childDepth = depth + 1;
  // A folder at this depth may host a nested folder iff the child folder's
  // own children would still fit inside MAX_SIDEBAR_DEPTH.
  const canAddFolder = canAddFolderInside(depth);

  async function addLinkChild() {
    const label = await prompt({ title: "Link label", defaultValue: "New link" });
    if (!label) return;
    const href = await prompt({ title: "URL or admin path", defaultValue: "/admin/" });
    if (!href) return;
    onPatch({
      items: [
        ...group.items,
        { type: "link", id: newId("link"), label, href, external: href.startsWith("http") },
      ],
    } as Partial<SidebarItem>);
  }
  async function addFolderChild() {
    if (!canAddFolder) return;
    const label = await prompt({ title: "Folder name", defaultValue: "New folder" });
    if (!label) return;
    onPatch({
      items: [
        ...group.items,
        { type: "group", id: newId("group"), label, defaultOpen: true, items: [] },
      ],
    } as Partial<SidebarItem>);
  }
  function patchChild(id: string, patch: Partial<SidebarItem>) {
    onPatch({
      items: group.items.map(c => c.id === id ? { ...c, ...patch } as SidebarItem : c),
    } as Partial<SidebarItem>);
  }
  async function deleteChild(id: string) {
    if (!(await confirm({ title: "Delete this item?", danger: true, confirmLabel: "Delete" }))) return;
    onPatch({ items: group.items.filter(c => c.id !== id) } as Partial<SidebarItem>);
  }
  function moveChild(id: string, dir: -1 | 1) {
    const idx = group.items.findIndex(c => c.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= group.items.length) return;
    const next = [...group.items];
    { const a = next[idx]!; const b = next[j]!; next[idx] = b; next[j] = a; }
    onPatch({ items: next } as Partial<SidebarItem>);
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-white/5">
        <span className="text-[10px] uppercase tracking-wider text-brand-amber/60 w-12 shrink-0">Folder</span>
        <input
          value={group.label}
          onChange={e => onPatch({ label: e.target.value } as Partial<SidebarItem>)}
          placeholder="Folder name"
          className={INPUT + " flex-1 font-medium"}
        />
        <span
          className="text-[9px] uppercase tracking-wider text-brand-cream/30 px-2 py-0.5 rounded-full border border-white/10"
          title={`Level ${depth} of ${MAX_SIDEBAR_DEPTH}`}
        >
          L{depth}
        </span>
        <div className="flex items-center gap-1">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↑</button>
          <button disabled={isLast} onClick={() => onMove(1)} className="px-1.5 py-1 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↓</button>
          <button onClick={onDelete} className="text-[11px] px-2 py-1 text-brand-cream/45 hover:text-brand-orange">×</button>
        </div>
      </div>
      <div className="p-2 space-y-1.5">
        {group.items.length === 0 && (
          <p className="text-xs text-brand-cream/30 px-3 py-2 text-center">Empty folder.</p>
        )}
        {group.items.map((child, i) => (
          <div key={child.id} className="pl-3">
            <ItemEditor
              item={child}
              depth={childDepth}
              isFirst={i === 0}
              isLast={i === group.items.length - 1}
              onPatch={p => patchChild(child.id, p)}
              onMove={d => moveChild(child.id, d)}
              onDelete={() => deleteChild(child.id)}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1 pl-3">
          <button onClick={addLinkChild} className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 text-brand-cream/65 hover:text-brand-cream hover:border-white/25">
            + Link
          </button>
          <button
            onClick={addFolderChild}
            disabled={!canAddFolder}
            title={canAddFolder ? "" : `Max ${MAX_SIDEBAR_DEPTH} levels — add a link instead`}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 text-brand-cream/65 hover:text-brand-cream hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            + Folder
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange, tip }: { label: string; value: boolean; onChange: (v: boolean) => void; tip?: string }) {
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
        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
      </button>
    </div>
  );
}

