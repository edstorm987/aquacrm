import Link from "next/link";
import type { ReactNode } from "react";
import { devTeamLinkPrefetch } from "@/lib/chrome/devTeamLinkPrefetch";

// Shared design kit for the Dev Team portal — one visual language across every
// section. Server-safe (no "use client": pure presentational components), so
// any section page can import these. Cohesive with AquaCRM's private surfaces
// (off-white page, white cards, muted-green text) with a deep-teal accent that
// gives the internal workspace its own quiet identity.

export const ACCENT = "var(--dev-accent)";
export const ACCENT_SOFT = "var(--dev-accent-soft)";

// Colour carries MEANING here, it isn't decoration. Each section owns a hue, so
// you learn the place by its colour before you read the label — and the hue is
// chosen to match what the section is FOR:
//   roadmap   green   — direction, what's ahead
//   findings  amber   — attention, something's wrong
//   working   blue    — in motion
//   library   teal    — the house colour, reference
//   docs      violet  — authoring
//   auditor   red     — verdicts, risk
//   profiles  purple  — identity
//   tools     indigo  — the controls: inspect, edit, connect
//   editor    indigo  — building
//   api       cyan    — connections out
//   updates   orange  — broadcast
//   notes     slate   — quiet, personal
export interface Accent {
  /** Icon + emphasis colour. */ fg: string;
  /** Icon chip background. */ bg: string;
  /** Border on hover. */ line: string;
  /** Glow colour for the hover lift. */ glow: string;
}

export const ACCENTS: Record<string, Accent> = {
  roadmap: { fg: "var(--dev-success)", bg: "color-mix(in srgb, var(--dev-success) 15%, transparent)", line: "color-mix(in srgb, var(--dev-success) 38%, transparent)", glow: "rgba(63,125,82,0.18)" },
  findings:{ fg: "var(--dev-warning)", bg: "color-mix(in srgb, var(--dev-warning) 15%, transparent)", line: "color-mix(in srgb, var(--dev-warning) 38%, transparent)", glow: "rgba(168,106,18,0.18)" },
  working: { fg: "var(--dev-info)", bg: "color-mix(in srgb, var(--dev-info) 15%, transparent)", line: "color-mix(in srgb, var(--dev-info) 38%, transparent)", glow: "rgba(47,111,143,0.18)" },
  library: { fg: "var(--dev-accent)", bg: "color-mix(in srgb, var(--dev-accent) 15%, transparent)", line: "color-mix(in srgb, var(--dev-accent) 38%, transparent)", glow: "rgba(11,111,109,0.18)" },
  docs: { fg: "var(--dev-violet)", bg: "color-mix(in srgb, var(--dev-violet) 15%, transparent)", line: "color-mix(in srgb, var(--dev-violet) 38%, transparent)", glow: "rgba(109,74,168,0.18)" },
  auditor: { fg: "var(--dev-danger)", bg: "color-mix(in srgb, var(--dev-danger) 15%, transparent)", line: "color-mix(in srgb, var(--dev-danger) 38%, transparent)", glow: "rgba(180,68,58,0.18)" },
  inspector: { fg: "var(--dev-purple)", bg: "color-mix(in srgb, var(--dev-purple) 15%, transparent)", line: "color-mix(in srgb, var(--dev-purple) 38%, transparent)", glow: "rgba(138,63,134,0.18)" },
  tools: { fg: "var(--dev-indigo)", bg: "color-mix(in srgb, var(--dev-indigo) 15%, transparent)", line: "color-mix(in srgb, var(--dev-indigo) 38%, transparent)", glow: "rgba(63,81,168,0.18)" },
  editor: { fg: "var(--dev-indigo)", bg: "color-mix(in srgb, var(--dev-indigo) 15%, transparent)", line: "color-mix(in srgb, var(--dev-indigo) 38%, transparent)", glow: "rgba(63,81,168,0.18)" },
  api: { fg: "var(--dev-cyan)", bg: "color-mix(in srgb, var(--dev-cyan) 15%, transparent)", line: "color-mix(in srgb, var(--dev-cyan) 38%, transparent)", glow: "rgba(14,116,144,0.18)" },
  updates: { fg: "var(--dev-warning)", bg: "color-mix(in srgb, var(--dev-warning) 15%, transparent)", line: "color-mix(in srgb, var(--dev-warning) 38%, transparent)", glow: "rgba(180,83,9,0.18)" },
  notes: { fg: "var(--dev-slate)", bg: "color-mix(in srgb, var(--dev-slate) 15%, transparent)", line: "color-mix(in srgb, var(--dev-slate) 38%, transparent)", glow: "rgba(74,92,106,0.18)" },
  default:  { fg: ACCENT, bg: ACCENT_SOFT, line: "var(--dev-accent-line)", glow: "rgba(11,111,109,0.18)" },
};

export function accentFor(key?: string): Accent {
  return (key && ACCENTS[key]) || ACCENTS.default;
}

// Text / border tokens (light — the app's private area is light-mode).
export const INK = "var(--dev-ink)";
export const MUTED = "var(--dev-ink-muted)";
export const FAINT = "var(--dev-faint)";
export const HAIR = "var(--dev-line)";

export function PageHeader({
  icon,
  title,
  subtitle,
  meta,
  accent,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  /** Key into ACCENTS — keeps the header the same hue as the section's card. */
  accent?: string;
}) {
  const a = accentFor(accent);
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            aria-hidden
            className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset"
            style={{ background: a.bg, color: a.fg, boxShadow: `0 6px 16px -8px ${a.glow}`, ["--tw-ring-color" as string]: a.line }}
          >
            {icon}
          </span>
        ) : null}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dt-ink)]">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-[color:var(--dt-muted)]">{subtitle}</p> : null}
        </div>
      </div>
      {meta ? <div className="shrink-0 pt-1 text-right text-sm text-[color:var(--dt-faint)]">{meta}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  hint,
  right,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-5 ${className}`}>
      {title || right ? (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <div>
            {title ? (
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">{title}</h2>
            ) : null}
            {hint ? <p className="mt-0.5 text-xs text-[color:var(--dt-faint)]">{hint}</p> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

// A navigation tile (the section cards on Home). Icon chip + label + hint,
// with a soft hover lift.
export function NavCard({
  href,
  icon,
  label,
  hint,
  accent,
  badge,
}: {
  href: string;
  icon?: ReactNode;
  label: string;
  hint?: string;
  /** Key into ACCENTS — gives the card its meaning-colour. */
  accent?: string;
  badge?: ReactNode;
}) {
  const a = accentFor(accent);
  return (
    <Link
      href={href}
      prefetch={devTeamLinkPrefetch(href)}
      style={{ ["--a-fg" as string]: a.fg, ["--a-bg" as string]: a.bg, ["--a-line" as string]: a.line, ["--a-glow" as string]: a.glow }}
      className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[color:var(--a-line)] hover:shadow-[0_14px_30px_-12px_var(--a-glow)]"
    >
      {/* A colour wash that breathes in on hover — the section's identity. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `linear-gradient(135deg, ${a.bg} 0%, transparent 60%)` }}
      />
      {/* Left edge lights up. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-0.5 scale-y-0 transition-transform duration-200 group-hover:scale-y-100"
        style={{ background: a.fg }}
      />
      {icon ? (
        <span
          aria-hidden
          className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110"
          style={{ background: a.bg, color: a.fg }}
        >
          {icon}
        </span>
      ) : null}
      <div className="relative min-w-0">
        <div className="flex items-center gap-1.5 font-medium text-[color:var(--dt-ink)]">
          {label}
          {badge}
          <span
            className="translate-x-0 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
            style={{ color: a.fg }}
            aria-hidden
          >
            →
          </span>
        </div>
        {hint ? <div className="mt-0.5 text-xs leading-snug text-[color:var(--dt-muted)]">{hint}</div> : null}
      </div>
    </Link>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "danger" | "ok" | "accent" | "warn";
}) {
  const tones: Record<string, string> = {
    muted: "bg-[color:var(--dt-hairline)] text-[color:var(--dt-muted)]",
    danger: "bg-[color:var(--dev-danger-soft)] text-[color:var(--dev-danger)]",
    ok: "bg-[color:var(--dev-success-soft)] text-[color:var(--dev-success)]",
    accent: "bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]",
    warn: "bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[color:var(--dt-faint)]">{children}</p>;
}

// ---- Section views ---------------------------------------------------------
//
// The sidebar used to carry a row per screen, and most of those screens were
// the same job at a different zoom or a sibling of the one above it. So the
// workspace is organised into a few SECTIONS, each with views switched by a
// `?view=` on one route. One route per section keeps the sidebar honest — the
// nav item stays highlighted across every view — and keeps every old URL
// working through a redirect.

export interface SectionView {
  key: string;
  label: string;
  /** Full href including the `?view=` for anything but the default. */
  href: string;
}

export const SECTION_VIEWS: Record<string, SectionView[]> = {
  roadmap: [
    { key: "plan", label: "Roadmap", href: "/portal/dev-team/roadmap" },
    { key: "now", label: "Right now", href: "/portal/dev-team/roadmap?view=now" },
    { key: "tasks", label: "Tasks", href: "/portal/dev-team/roadmap?view=tasks" },
  ],
  findings: [
    { key: "mine", label: "Found by me", href: "/portal/dev-team/findings" },
    { key: "auditor", label: "Found by the auditor", href: "/portal/dev-team/findings?view=auditor" },
  ],
  library: [
    { key: "docs", label: "Docs", href: "/portal/dev-team/library" },
    { key: "logs", label: "Logs", href: "/portal/dev-team/library?view=logs" },
    { key: "updates", label: "Updates", href: "/portal/dev-team/library?view=updates" },
  ],
  tools: [
    { key: "inspector", label: "Inspector", href: "/portal/dev-team/tools" },
    { key: "editor", label: "Editor", href: "/portal/dev-team/tools?view=editor" },
    { key: "api", label: "API & MCP", href: "/portal/dev-team/tools?view=api" },
  ],
};

/** The pill switcher a section's views share. Sits in the PageHeader's meta. */
export function ViewTabs({ section, active }: { section: keyof typeof SECTION_VIEWS | string; active: string }) {
  const views = SECTION_VIEWS[section] ?? [];
  const a = accentFor(section);
  if (views.length < 2) return null;
  return (
    <div className="inline-flex rounded-full border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-0.5">
      {views.map(view => {
        const on = view.key === active;
        return (
          <Link
            key={view.key}
            href={view.href}
            prefetch={section === "library" ? false : undefined}
            aria-current={on ? "page" : undefined}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={on
              ? { background: a.fg, color: "var(--dev-on-accent)" }
              : { color: "var(--dt-muted)" }}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
