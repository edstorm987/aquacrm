"use client";

// /admin/portals — Customer-facing portal designer.
//
// Felicia (the operator) designs the public portals her customers see —
// login, affiliates dashboard, order history, account home — as one or
// more "variants" per portal role. A variant is an EditorPage with a
// portalRole tag, edited in the existing visual editor. One variant per
// (site, role) is flagged active; the matching public route renders it.
//
// This page is the picker: switch between portal roles, list the
// variants for the active site, create new ones, set which is active,
// open in the editor.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EditorPage } from "../types/editorPage";
import type { PortalRole } from "../lib/portalRole";
import { listSites, getActiveSite, type Site } from "../lib/sites";
import {
  listPortalVariants, setActivePortalVariant, createPage, deletePage, onPagesChange,
} from "../lib/editorPages";
import { starterForRole } from "../lib/portalStarters";
import { confirm } from "../lib/confirm";
import { prompt } from "../lib/prompt";
import { notify } from "../lib/notify";

// Role catalogue. Order matters — drives the tab order.
// publicHref is the customer-facing URL the active variant renders at.
const ROLES: Array<{
  id: PortalRole;
  label: string;
  eyebrow: string;
  description: string;
  defaultPath: string;
  publicHref: string;
}> = [
  {
    id: "login",
    label: "Login",
    eyebrow: "Sign-in",
    description: "What your customers see when they go to /login. Hero copy, branding, social-auth toggles, footer links.",
    defaultPath: "/portal/login",
    publicHref: "/account",
  },
  {
    id: "affiliates",
    label: "Affiliates",
    eyebrow: "Partners",
    description: "Customer-facing affiliate dashboard. Stats, referral links, payouts, signup form for new affiliates.",
    defaultPath: "/portal/affiliates",
    publicHref: "/affiliates",
  },
  {
    id: "orders",
    label: "Orders",
    eyebrow: "Account",
    description: "Customer's view of their order history. Status, tracking, reorder, refund requests.",
    defaultPath: "/portal/orders",
    publicHref: "/account/orders",
  },
  {
    id: "account",
    label: "Account home",
    eyebrow: "Account",
    description: "Logged-in account landing — shortcuts to orders, profile, addresses, subscription, downloads.",
    defaultPath: "/portal/account",
    publicHref: "/account",
  },
];

// Plugin-page entry point. Foundation passes PluginPageProps when it
// mounts the page at /portal/clients/[clientId]/portals; the inner
// component pulls data from session-scoped endpoints so we don't
// thread the clientId through manually.
export default function AdminPortalsPage(_props: unknown) {
  return (
    <Suspense fallback={<div className="p-8 text-[12px] text-brand-cream/45">Loading…</div>}>
      <AdminPortalsInner />
    </Suspense>
  );
}

function AdminPortalsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams?.get("role") as PortalRole | null) ?? "login";

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [role, setRole] = useState<PortalRole>(ROLES.some(r => r.id === initialRole) ? initialRole : "login");
  const [variants, setVariants] = useState<EditorPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Per-role flag — true when that role has an active variant. Used by
  // the tab strip to show a small dot indicator so the operator can see
  // at a glance which portals are running custom variants vs the
  // built-in defaults. Loaded in parallel for all roles on site change.
  const [activeByRole, setActiveByRole] = useState<Record<PortalRole, boolean>>({
    login: false, affiliates: false, orders: false, account: false,
  });

  // Sites + initial active-site selection.
  useEffect(() => {
    const all = listSites();
    const active = getActiveSite() ?? all[0] ?? null;
    setSites(all);
    setSiteId(active?.id ?? "");
  }, []);

  // Load variants whenever site or role changes; refresh on page mutations.
  // Also reload the per-role active map so tab indicators stay accurate
  // after Make active / Clear active / Delete.
  useEffect(() => {
    if (!siteId) { setVariants([]); setLoading(false); return; }
    let cancelled = false;
    async function reloadRoleMap() {
      const entries = await Promise.all(
        ROLES.map(async r => {
          const list = await listPortalVariants(siteId, r.id);
          return [r.id, list.some(v => v.isActivePortal)] as const;
        }),
      );
      if (cancelled) return;
      const next = { login: false, affiliates: false, orders: false, account: false } as Record<PortalRole, boolean>;
      for (const [id, hasActive] of entries) next[id] = hasActive;
      setActiveByRole(next);
    }
    async function reload() {
      setLoading(true);
      const list = await listPortalVariants(siteId, role);
      if (!cancelled) {
        setVariants(list);
        setLoading(false);
      }
    }
    void reload();
    void reloadRoleMap();
    const off = onPagesChange(s => {
      if (s === siteId) {
        void reload();
        void reloadRoleMap();
      }
    });
    return () => { cancelled = true; off(); };
  }, [siteId, role]);

  function changeRole(next: PortalRole) {
    setRole(next);
    // Reflect in URL so refresh keeps the tab.
    router.replace(`/admin/portals?role=${next}`);
  }

  async function handleNewVariant() {
    if (!siteId || busy) return;
    const meta = ROLES.find(r => r.id === role);
    if (!meta) return;
    const name = (await prompt({
      title: `New ${meta.label} variant`,
      message: `Create a fresh ${meta.label.toLowerCase()} layout for this site. You'll edit it in the visual editor.`,
      defaultValue: `${meta.label} v${variants.length + 1}`,
      placeholder: `${meta.label} v1`,
    })) ?? "";
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Slug needs to be unique per site. Append the variant name to keep
      // multiple variants from clashing.
      const slug = `${meta.defaultPath}/${slugify(name)}`;
      const page = await createPage(siteId, {
        slug,
        title: name.trim(),
        portalRole: role,
        // Pre-populate the editor with a sensible role-specific starter
        // tree (heading + copy + auth form for login/affiliates, etc.)
        // so the operator gets a working layout to tweak instead of a
        // blank canvas.
        blocks: starterForRole(role),
      });
      if (!page) {
        notify({ tone: "error", title: "Couldn't create variant", message: "The server didn't return a page. Try again." });
        return;
      }
      // Refresh, then open the new variant in the visual editor.
      const list = await listPortalVariants(siteId, role);
      setVariants(list);
      router.push(`/admin/editor?page=${page.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetActive(pageId: string) {
    if (!siteId || busy) return;
    setBusy(true);
    try {
      const list = await setActivePortalVariant(siteId, role, pageId);
      setVariants(list);
      notify({ tone: "ok", title: "Variant activated", message: "Customers see this version now." });
    } finally {
      setBusy(false);
    }
  }

  async function handleClearActive() {
    if (!siteId || busy) return;
    if (!(await confirm({
      title: "Clear active variant?",
      message: "Customers will see the built-in default until you activate one again.",
      confirmLabel: "Clear",
    }))) return;
    setBusy(true);
    try {
      const list = await setActivePortalVariant(siteId, role, null);
      setVariants(list);
    } finally { setBusy(false); }
  }

  async function handleDelete(page: EditorPage) {
    if (busy) return;
    if (!(await confirm({
      title: `Delete "${page.title}"?`,
      message: page.isActivePortal
        ? "This is the active variant — deleting it will fall back to the built-in default."
        : "The variant + its blocks will be removed permanently.",
      danger: true,
      confirmLabel: "Delete variant",
    }))) return;
    setBusy(true);
    try {
      await deletePage(siteId, page.id);
      const list = await listPortalVariants(siteId, role);
      setVariants(list);
    } finally { setBusy(false); }
  }

  async function handleDuplicate(page: EditorPage) {
    if (busy || !siteId) return;
    setBusy(true);
    try {
      // Slug needs to stay unique per site — append a short timestamp
      // suffix so multiple duplicates don't clash.
      const suffix = Date.now().toString(36).slice(-4);
      const baseSlug = page.slug.replace(/-(copy-?[a-z0-9]*)$/, "");
      const copy = await createPage(siteId, {
        slug: `${baseSlug}-copy-${suffix}`,
        title: `${page.title} (copy)`,
        description: page.description,
        blocks: page.blocks,
        portalRole: page.portalRole,
      });
      if (!copy) {
        notify({ tone: "error", title: "Couldn't duplicate variant", message: "The server didn't return a page." });
        return;
      }
      const list = await listPortalVariants(siteId, role);
      setVariants(list);
      notify({ tone: "ok", title: "Duplicated", message: `${copy.title} is ready to edit.` });
    } finally { setBusy(false); }
  }

  const meta = ROLES.find(r => r.id === role)!;
  const activeSite = sites.find(s => s.id === siteId);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">Portals</p>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Customer-facing portal designer</h1>
          <p className="text-brand-cream/55 text-sm mt-1 max-w-prose leading-relaxed">
            Design what your customers see when they log in, view their orders, manage affiliate links, or land on
            their account home. Each portal can have multiple variants — pick which one's live.
          </p>
        </div>
        {sites.length > 1 && (
          <select
            value={siteId}
            onChange={e => setSiteId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream focus:outline-none focus:border-brand-orange/50"
          >
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </header>

      {/* Role tabs */}
      <nav aria-label="Portal type" className="border-b border-white/8 overflow-x-auto no-scrollbar">
        <ul className="flex items-center gap-0.5 min-w-max">
          {ROLES.map(r => {
            const active = r.id === role;
            const hasActiveVariant = activeByRole[r.id];
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => changeRole(r.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[12px] tracking-wide whitespace-nowrap transition-colors ${
                    active ? "text-brand-cream" : "text-brand-cream/55 hover:text-brand-cream/85"
                  }`}
                  title={hasActiveVariant ? "A custom variant is active for this portal" : undefined}
                >
                  {r.label}
                  {hasActiveVariant && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                      aria-label="Custom variant is live"
                    />
                  )}
                  {active && <span className="absolute inset-x-2 -bottom-px h-px bg-cyan-400" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Header for active role */}
      <section className="rounded-2xl border border-white/8 bg-brand-black-card p-5 sm:p-6 flex flex-col sm:flex-row gap-4 sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] tracking-[0.32em] uppercase text-cyan-400 mb-1">{meta.eyebrow}</p>
          <h2 className="font-display text-xl text-brand-cream">{meta.label}</h2>
          <p className="text-[12px] text-brand-cream/55 mt-1 leading-relaxed max-w-prose">{meta.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleNewVariant}
            disabled={busy || !siteId}
            className="text-xs px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-light text-white font-semibold disabled:opacity-40"
          >
            + New variant
          </button>
          {variants.some(v => v.isActivePortal) && (
            <button
              type="button"
              onClick={handleClearActive}
              disabled={busy}
              className="text-xs px-3 py-2 rounded-lg border border-white/10 text-brand-cream/65 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
            >
              Clear active
            </button>
          )}
        </div>
      </section>

      {/* Variants list */}
      {loading ? (
        <p className="text-[12px] text-brand-cream/45">Loading variants…</p>
      ) : variants.length === 0 ? (
        <section className="rounded-2xl border border-white/8 bg-brand-black-card p-8 text-center">
          <p className="text-[13px] text-brand-cream/85">No {meta.label.toLowerCase()} variants yet for {activeSite?.name ?? "this site"}.</p>
          <p className="text-[12px] text-brand-cream/55 mt-2 max-w-md mx-auto leading-relaxed">
            Click <strong className="text-brand-cream">+ New variant</strong> to design one in the visual editor. You can keep multiple variants and switch between them with one click.
          </p>
        </section>
      ) : (
        <div className="space-y-2">
          {variants.map(v => (
            <article
              key={v.id}
              className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${
                v.isActivePortal
                  ? "border-cyan-400/30 bg-cyan-500/[0.04]"
                  : "border-white/8 bg-white/[0.02]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="text-[14px] font-semibold text-brand-cream truncate">{v.title}</p>
                  {v.isActivePortal && (
                    <span className="text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-cyan-400/15 text-cyan-300">active</span>
                  )}
                  <span className="text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-white/5 text-brand-cream/55">{v.status}</span>
                </div>
                <p className="text-[11px] text-brand-cream/55 font-mono truncate">{v.slug}</p>
                <p className="text-[10px] text-brand-cream/40 mt-0.5">
                  {v.blocks.length} block{v.blocks.length === 1 ? "" : "s"} · updated {new Date(v.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!v.isActivePortal && (
                  <button
                    type="button"
                    onClick={() => void handleSetActive(v.id)}
                    disabled={busy}
                    className="text-[11px] px-3 py-1.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20 disabled:opacity-40"
                  >
                    Make active
                  </button>
                )}
                {v.isActivePortal && (
                  <Link
                    href={meta.publicHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] px-3 py-1.5 rounded-md border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10"
                    title={`Opens ${meta.publicHref} in a new tab`}
                  >
                    View live ↗
                  </Link>
                )}
                <Link
                  href={`/admin/portals/preview/${v.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] px-3 py-1.5 rounded-md border border-white/10 text-brand-cream/70 hover:text-brand-cream hover:border-white/30"
                  title="Render this variant exactly as a customer would see it, without activating it"
                >
                  Preview ↗
                </Link>
                <Link
                  href={`/admin/editor?page=${v.id}`}
                  className="text-[11px] px-3 py-1.5 rounded-md border border-brand-orange/40 bg-brand-orange/10 text-brand-orange/90 hover:bg-brand-orange/20"
                >
                  Edit in editor →
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDuplicate(v)}
                  disabled={busy}
                  className="text-[11px] px-3 py-1.5 rounded-md border border-white/10 text-brand-cream/65 hover:text-brand-cream hover:border-white/30 disabled:opacity-40"
                  title="Duplicate variant"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(v)}
                  disabled={busy}
                  className="text-[11px] px-2 py-1.5 rounded-md text-brand-cream/45 hover:text-red-400 disabled:opacity-40"
                  title="Delete variant"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "variant";
}
