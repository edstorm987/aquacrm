"use client";

// Editor top bar — Wix / Figma / GoHighLevel-style chrome with
// grouped icon menus. Sits above the iframe in /admin/editor.
//
// Sections (left → right):
//   • Brand chip + back-to-admin link
//   • Site picker
//   • Page picker
//   • Mode switcher (Live / Block / Code)
//   • Edit / View toggle
//   • Reload iframe
//   • Connection indicator + unsaved counter
//   • Action menu (undo / redo / save / publish)

import Link from "next/link";

interface PageEntry { id: string; slug: string; title: string }
interface SiteEntry { id: string; name: string }

export type EditorMode = "live" | "block" | "code";

interface Props {
  sites: SiteEntry[];
  siteId: string;
  onSiteChange: (id: string) => void;
  pages: PageEntry[];
  pageId: string | null;
  onPageChange: (id: string) => void;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  edit: "edit" | "view";
  onEditChange: (mode: "edit" | "view") => void;
  onReload: () => void;
  iframeReady: boolean;
  unsaved: number;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSave?: () => void;
  onPublish?: () => void;
  // Round-7: opens the AI page-builder modal. When undefined the
  // ✨ Generate button is hidden (ai-builder plugin not installed).
  onGenerate?: () => void;
  // What the operator is currently editing. Page-targets get the full
  // page picker / mode switcher / preview controls; funnels just show
  // the site picker + a context badge so the chrome stays calm.
  targetKind?: "page" | "funnel";
  funnelLabel?: string;
  // Editor complexity controls how much surface we render. Simple
  // hides the Block/Code mode buttons (Live only); Full/Pro show
  // the full mode switcher; Pro adds the Page-settings gear.
  complexity?: import("../../lib/editorMode").EditorComplexity;
  onComplexityChange?: (c: import("../../lib/editorMode").EditorComplexity) => void;
  // Pro-mode shortcut: opens the per-page advanced settings drawer
  // (custom head/foot, theme override, layout overrides). Ignored
  // when complexity !== "pro".
  onOpenPageSettings?: () => void;
  // Optional context label shown next to the page picker. Used to
  // indicate when a page is a portal variant so the operator never
  // forgets they're editing a customer-facing flow.
  portalRoleLabel?: string;
}

export default function EditorTopBar({
  sites, siteId, onSiteChange,
  pages, pageId, onPageChange,
  mode, onModeChange,
  edit, onEditChange,
  onReload, iframeReady, unsaved,
  onUndo, onRedo, canUndo = false, canRedo = false,
  onSave, onPublish, onGenerate,
  targetKind = "page", funnelLabel,
  complexity = "full", onComplexityChange,
  onOpenPageSettings, portalRoleLabel,
}: Props) {
  const isSimple = complexity === "simple";
  const isPro = complexity === "pro";
  const isPage = targetKind === "page";
  return (
    <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-brand-black-soft">
      {/* Back chip */}
      <Link href="/admin" className="flex items-center gap-1.5 text-[11px] text-cyan-400/70 hover:text-cyan-300" title="Back to admin">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        <span>Admin</span>
      </Link>

      <span className="w-px h-5 bg-white/10" />

      {/* Site picker — always visible */}
      <SelectChip
        icon="◉"
        label="Site"
        value={siteId}
        onChange={onSiteChange}
        options={sites.map(s => ({ value: s.id, label: s.name }))}
        title="Active site"
      />

      {isPage ? (
        <>
          {/* Page picker */}
          <SelectChip
            icon="📄"
            label="Page"
            value={pageId ?? ""}
            onChange={onPageChange}
            options={pages.map(p => ({ value: p.id, label: `${p.title} · ${p.slug}` }))}
            title="Page being edited"
            wide
            allowEmpty={pageId === null}
          />

          {/* Portal-role context badge. Only shown when the current page
              is a portal variant — keeps the operator oriented when
              hopping between site pages and customer-portal variants. */}
          {portalRoleLabel && (
            <span
              className="px-2 py-0.5 rounded-md text-[10px] tracking-wider uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-400/20 truncate max-w-[150px]"
              title={`This page is the ${portalRoleLabel} portal variant`}
            >
              ⤷ {portalRoleLabel}
            </span>
          )}

          <span className="w-px h-5 bg-white/10" />

          {/* Mode switcher — Simple gets Live only, Full/Pro see all three */}
          {!isSimple && (
            <div className="flex items-center gap-0.5 border border-white/10 rounded-lg p-0.5 bg-white/[0.02]">
              <ModeBtn current={mode} value="live"  onClick={onModeChange} icon="◧" label="Live" title="Live editor (iframe + click-to-edit)" />
              <ModeBtn current={mode} value="block" onClick={onModeChange} icon="▦" label="Block" title="Block-based drag-drop builder" />
              <ModeBtn current={mode} value="code"  onClick={onModeChange} icon="</>" label="Code" title="JSON tree / code view" />
            </div>
          )}

          {/* Edit / View */}
          {mode === "live" && (
            <div className="flex items-center gap-0.5 border border-white/10 rounded-lg p-0.5 bg-white/[0.02]">
              <ToggleBtn active={edit === "edit"} onClick={() => onEditChange("edit")} icon="✎" title="Edit mode" />
              <ToggleBtn active={edit === "view"} onClick={() => onEditChange("view")} icon="👁" title="Preview mode" />
            </div>
          )}

          {/* Reload */}
          <IconBtn onClick={onReload} title="Reload preview" aria-label="Reload preview">↻</IconBtn>
        </>
      ) : (
        <span
          className="px-2.5 py-1 rounded-md text-[11px] bg-cyan-500/10 text-cyan-200 border border-cyan-400/20 truncate max-w-[280px]"
          title={funnelLabel ?? "Funnel"}
        >
          ⤳ {funnelLabel ?? "Funnel"}
        </span>
      )}

      <div className="flex-1" />

      {/* Complexity selector — segmented control. Simple / Full / Pro. */}
      {onComplexityChange && (
        <>
          <div className="flex items-center gap-0.5 border border-white/10 rounded-lg p-0.5 bg-white/[0.02]">
            {(["simple", "full", "pro"] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => onComplexityChange(c)}
                title={`${c.charAt(0).toUpperCase() + c.slice(1)} mode`}
                aria-pressed={complexity === c}
                className={`px-2 py-0.5 text-[10px] tracking-wide uppercase rounded ${
                  complexity === c
                    ? "bg-cyan-500/20 text-cyan-200"
                    : "text-brand-cream/55 hover:text-brand-cream/85"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="w-px h-5 bg-white/10" />
        </>
      )}

      {/* Undo / redo — hidden in Simple mode to keep the toolbar quiet */}
      {onUndo && !isSimple && (
        <>
          <IconBtn onClick={onUndo} title="Undo (⌘Z)" aria-label="Undo" disabled={!canUndo}>↶</IconBtn>
          <IconBtn onClick={() => onRedo?.()} title="Redo (⌘⇧Z)" aria-label="Redo" disabled={!canRedo}>↷</IconBtn>
          <span className="w-px h-5 bg-white/10" />
        </>
      )}

      {/* Status */}
      {unsaved > 0 ? (
        <span className="text-[11px] text-amber-300/85" title={`${unsaved} unsaved edits`}>
          {unsaved} unsaved
        </span>
      ) : iframeReady ? (
        <span className="text-[11px] text-emerald-300/65" title="All saved">
          Saved
        </span>
      ) : null}
      <span
        className={`w-2 h-2 rounded-full ${iframeReady ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`}
        title={iframeReady ? "Editor connected" : "Connecting…"}
      />

      {/* Pro-only: Page-settings drawer for advanced fields (custom
          head/foot, theme override, layout overrides). Reachable from
          the Outliner in Full mode; promoted to a topbar gear in Pro. */}
      {isPro && onOpenPageSettings && (
        <IconBtn onClick={onOpenPageSettings} title="Page settings — head/foot, theme, layout overrides" aria-label="Page settings">⚙</IconBtn>
      )}

      {/* Round-7: AI page-builder. Hidden when ai-builder plugin is
          not installed (onGenerate undefined). Sits left of Save so
          generated content can flow straight into a save. */}
      {onGenerate && (
        <button
          onClick={onGenerate}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/20"
          title="Generate a page section with AI"
          aria-label="Generate with AI"
        >
          ✨ Generate
        </button>
      )}

      {/* Save */}
      {onSave && (
        <IconBtn onClick={onSave} title="Save (⌘S)" aria-label="Save" highlighted>💾</IconBtn>
      )}

      {/* Publish */}
      {onPublish ? (
        <button
          onClick={onPublish}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20"
          title="Publish changes"
        >
          Publish →
        </button>
      ) : (
        <Link
          href="/admin/repo"
          className="px-3 py-1.5 rounded-md text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20"
          title="Open the GitHub repo browser to publish a PR"
        >
          Publish to GitHub
        </Link>
      )}
    </header>
  );
}

function SelectChip({
  icon, label, value, onChange, options, title, wide, allowEmpty,
}: {
  icon: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  title?: string;
  wide?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5" title={title}>
      <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">{icon} {label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[12px] text-brand-cream focus:outline-none focus:border-cyan-400/40 ${wide ? "min-w-[200px]" : ""}`}
      >
        {(options.length === 0 || allowEmpty) && <option value="">(none)</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ModeBtn<T extends string>({
  current, value, onClick, icon, label, title,
}: {
  current: T;
  value: T;
  onClick: (v: T) => void;
  icon: string;
  label: string;
  title?: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      title={title}
      aria-label={label}
      className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors ${
        active ? "bg-cyan-500/15 text-cyan-200 border border-cyan-400/20" : "text-brand-cream/55 hover:text-brand-cream"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function ToggleBtn({
  active, onClick, icon, title,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`px-2 py-1 rounded text-[12px] transition-colors ${
        active ? "bg-cyan-500/15 text-cyan-200" : "text-brand-cream/55 hover:text-brand-cream"
      }`}
    >
      {icon}
    </button>
  );
}

function IconBtn({
  onClick, title, children, highlighted, disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  highlighted?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`w-8 h-8 rounded-md flex items-center justify-center text-[13px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        highlighted
          ? "bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20"
          : "bg-white/5 hover:bg-white/10 text-brand-cream/85"
      }`}
    >
      {children}
    </button>
  );
}
