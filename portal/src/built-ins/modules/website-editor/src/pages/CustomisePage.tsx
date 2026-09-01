"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminTabs from "../components/AdminTabs";
import {
  COMPLEXITY_OPTIONS,
  getEditorComplexity,
  onEditorComplexityChange,
  setEditorComplexity,
  type EditorComplexity,
} from "../lib/editorMode";
import { notify } from "../lib/notify";
import PluginRequired from "../lib/pluginRequired";
import { SETTINGS_TABS } from "../lib/tabSets";

interface ExportSite {
  id: string;
  name: string;
  slug: string;
}

interface SitesResponse {
  ok?: boolean;
  error?: string;
  sites?: ExportSite[];
}

const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";

export default function EditorSettingsPage(_props: unknown) {
  return (
    <PluginRequired plugin="website-editor">
      <EditorSettingsPageInner />
    </PluginRequired>
  );
}

function EditorSettingsPageInner() {
  const [complexity, setComplexityState] = useState<EditorComplexity>(getEditorComplexity);
  const [sites, setSites] = useState<ExportSite[]>([]);
  const [siteId, setSiteId] = useState("");
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(
    () => onEditorComplexityChange(() => setComplexityState(getEditorComplexity())),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      setSitesLoading(true);
      setSitesError(null);
      try {
        const response = await fetch("/api/portal/website-editor/sites", {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json().catch(() => null) as SitesResponse | null;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.sites)) {
          throw new Error(payload?.error || `Could not read websites (${response.status}).`);
        }
        if (cancelled) return;
        const availableSites = payload.sites;
        setSites(availableSites);
        setSiteId(current => availableSites.some(site => site.id === current)
          ? current
          : availableSites[0]?.id ?? "");
      } catch (error) {
        if (cancelled) return;
        setSites([]);
        setSiteId("");
        setSitesError(error instanceof Error ? error.message : "Could not read websites.");
      } finally {
        if (!cancelled) setSitesLoading(false);
      }
    }

    void loadSites();
    return () => { cancelled = true; };
  }, []);

  function selectEditorComplexity(next: EditorComplexity) {
    setEditorComplexity(next);
    setComplexityState(next);
  }

  async function exportSite() {
    if (!siteId || sitesLoading || sitesError) return;
    setExporting(true);
    try {
      const response = await fetch(
        `/api/portal/website-editor/export?siteId=${encodeURIComponent(siteId)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `Export failed (${response.status}).`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${siteId}-export.zip`;
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);

      const unsupported = Number(response.headers.get("x-aqua-export-unsupported-blocks") ?? "0");
      notify({
        tone: unsupported > 0 ? "warn" : "ok",
        title: unsupported > 0 ? "Export downloaded with warnings" : "Export downloaded",
        message: unsupported > 0
          ? `${unsupported} unsupported block type${unsupported === 1 ? "" : "s"} are named in the export README.`
          : "The published site snapshot is ready.",
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "Export failed",
        message: error instanceof Error ? error.message : "The export could not be created.",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-6 p-6 sm:p-8 lg:p-10">
      <div className="[&_nav]:!border-slate-200 [&_a]:!text-slate-600 [&_a:hover]:!bg-slate-100 [&_a:hover]:!text-slate-950">
        <AdminTabs tabs={SETTINGS_TABS} ariaLabel="Settings" />
      </div>

      <header>
        <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-amber-700">Website editor</p>
        <h1 className="font-display text-3xl text-slate-950 sm:text-4xl">Editor settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Choose how this browser presents the editor, or download a snapshot from the shared website store.
        </p>
      </header>

      <section className={CARD} aria-labelledby="editor-mode-heading">
        <h2 id="editor-mode-heading" className="text-sm font-semibold text-slate-950">Editor mode</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          This is a personal preference for this browser. It changes editor controls only; it does not alter published content.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {COMPLEXITY_OPTIONS.map(option => {
            const selected = complexity === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectEditorComplexity(option.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-orange-600 bg-orange-50"
                    : "border-slate-200 bg-slate-50 hover:border-slate-400"
                }`}
              >
                <span className="block text-[13px] font-semibold text-slate-950">{option.label}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-600">{option.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={CARD} aria-labelledby="export-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="export-heading" className="text-sm font-semibold text-slate-950">Download published website</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
              The export comes from tenant-scoped server data. Its README names any dynamic or unsupported blocks instead of silently promising a complete copy.
            </p>
          </div>
          <Link
            href="../git-status"
            className="text-xs text-cyan-700 underline decoration-cyan-700/30 underline-offset-4 hover:text-cyan-800"
          >
            View Git status
          </Link>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-slate-600">Website</span>
            <select
              value={siteId}
              onChange={event => setSiteId(event.target.value)}
              disabled={sitesLoading || Boolean(sitesError) || sites.length === 0}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 focus:border-orange-600 focus:outline-none disabled:opacity-50"
            >
              {sitesLoading ? <option value="">Loading websites…</option> : null}
              {!sitesLoading && sites.length === 0 ? <option value="">No website available</option> : null}
              {sites.map(site => <option key={site.id} value={site.id}>{site.name || site.slug || site.id}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void exportSite()}
            disabled={!siteId || sitesLoading || Boolean(sitesError) || exporting}
            className="rounded-xl bg-orange-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? "Creating export…" : "Download ZIP"}
          </button>
        </div>

        {sitesError ? (
          <p role="alert" className="mt-3 text-xs text-red-700">{sitesError} Reload this page to retry.</p>
        ) : null}
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        Branding and theme changes belong in the shared <Link href="../themes" className="text-slate-700 underline underline-offset-4">Themes</Link> workspace. Page structure belongs in the <Link href="../editor" className="text-slate-700 underline underline-offset-4">Editor</Link>.
      </p>
    </div>
  );
}
