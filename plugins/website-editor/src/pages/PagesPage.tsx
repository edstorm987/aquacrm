"use client";

// PagesPage — admin list of EditorPages for the active site. Re-pointed
// in Round 3 from the Round-1 placeholder shell to consume the
// plugin's `lib/editorPages.ts` listing.
//
// Round-4 follow-up: 02's `admin/pages/page.tsx` is the catalogue for a
// separate `customPages.ts` localStorage block system distinct from
// EditorPage. That backend isn't in the plugin yet (likely becomes its
// own page-builder plugin). When it does, this page can grow tabs to
// flip between EditorPages and CustomPages, or split into two
// surfaces. For now: EditorPage list only, which matches the plugin's
// actual content model.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  listPages,
  deletePage,
  publishPage,
  createPage,
  onPagesChange,
} from "../lib/editorPages";
import type { EditorPage } from "../types/editorPage";
import { getActiveSiteId } from "../lib/sites";
import { confirm } from "../lib/confirm";
import { prompt } from "../lib/prompt";
import { notify } from "../lib/notify";
import AdminTabs from "../components/AdminTabs";
import { CONTENT_TABS } from "../lib/tabSets";
import PluginRequired from "../lib/pluginRequired";

export default function PagesPage(_props: unknown) {
  return (
    <PluginRequired plugin="website-editor">
      <PagesPageInner />
    </PluginRequired>
  );
}

function PagesPageInner() {
  const router = useRouter();
  const [siteId, setSiteId] = useState<string>("");
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async (sid: string) => {
    if (!sid) { setPages([]); setLoading(false); return; }
    setLoading(true);
    try {
      const list = await listPages(sid, true);
      setPages(list);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const sid = getActiveSiteId();
    setSiteId(sid);
    void refresh(sid);
    return onPagesChange(changed => {
      if (changed === sid) void refresh(sid);
    });
  }, [refresh]);

  async function handleNewPage() {
    if (!siteId) return;
    const title = await prompt({
      title: "New page",
      message: "Pick a name. You can change the slug afterwards.",
      defaultValue: "New page",
    });
    if (!title) return;
    const slug = "/" + title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const created = await createPage(siteId, { title, slug, blocks: [] });
    if (created) {
      notify({ tone: "ok", title: "Page created", message: `"${title}"` });
      router.push(`../editor?page=${encodeURIComponent(created.id)}`);
    } else {
      notify({ tone: "error", title: "Couldn't create page", message: "Server didn't return the page." });
    }
  }

  async function handleDelete(page: EditorPage) {
    const ok = await confirm({
      title: `Delete "${page.title || page.slug}"?`,
      message: "This removes the page and its blocks. The customer-facing route falls back to a 404.",
      danger: true,
      confirmLabel: "Delete page",
    });
    if (!ok) return;
    const deleted = await deletePage(siteId, page.id);
    if (deleted) {
      notify({ tone: "ok", title: "Page deleted" });
      await refresh(siteId);
    }
  }

  async function handlePublish(page: EditorPage) {
    const updated = await publishPage(siteId, page.id);
    if (updated) {
      notify({ tone: "ok", title: "Published", message: `"${updated.title || updated.slug}"` });
      await refresh(siteId);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6">
      <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">Pages</p>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">All pages</h1>
          <p className="text-brand-cream/45 text-sm mt-1">
            Pages composed in the visual editor. Click a row to open in the editor; use Publish to push the draft live.
          </p>
        </div>
        <button
          onClick={handleNewPage}
          className="text-xs px-4 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-light text-white font-semibold"
        >
          + New page
        </button>
      </div>

      {loading ? (
        <p className="text-brand-cream/45 text-sm py-10 text-center">Loading…</p>
      ) : pages.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-brand-black-card px-6 py-10 text-center">
          <p className="text-brand-cream/45 text-sm">No pages yet.</p>
          <button
            onClick={handleNewPage}
            className="mt-4 text-xs px-4 py-2 rounded-lg bg-brand-orange text-white font-semibold"
          >
            Create one
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-brand-black-card overflow-hidden divide-y divide-white/5">
          {pages.map(page => {
            const isPublished = page.status === "published";
            const blockCount = page.blocks?.length ?? 0;
            const portalRole = page.portalRole;
            const isHomepage = page.isHomepage;
            return (
              <div key={page.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02]">
                <Link
                  href={`../editor?page=${encodeURIComponent(page.id)}`}
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-brand-cream truncate">{page.title || page.slug}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isPublished ? "bg-green-400/20 text-green-300" : "bg-white/10 text-brand-cream/55"}`}>
                      {isPublished ? "published" : "draft"}
                    </span>
                    {portalRole && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300">
                        {portalRole}
                      </span>
                    )}
                    {isHomepage && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-purple/20 text-brand-purple-light">
                        home
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-brand-cream/40">
                    {page.slug} · {blockCount} block{blockCount === 1 ? "" : "s"}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {!isPublished && (
                    <button
                      onClick={() => void handlePublish(page)}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-green-400/20 bg-green-400/10 text-green-300 hover:bg-green-400/20"
                    >
                      Publish
                    </button>
                  )}
                  <Link
                    href={`../editor?page=${encodeURIComponent(page.id)}`}
                    className="text-[11px] text-brand-cream/40 hover:text-brand-cream"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => void handleDelete(page)}
                    className="text-[11px] text-brand-cream/40 hover:text-brand-orange"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
