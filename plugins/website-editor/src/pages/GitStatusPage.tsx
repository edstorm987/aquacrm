"use client";

// GitStatusPage — surfaces the otherwise-invisible state of "what
// edits have landed in the per-client repo but haven't been pushed
// yet". Round-6.
//
// For each Live client whose `clients/<slug>/` exists, this page
// shows pending file changes + Stage / Unstage / Commit / Push /
// Open PR buttons routed through `lib/gitOps.ts`.
//
// When the GitOpsPort isn't wired yet (T6 R1 deferred), the page
// renders an inline "Set up the git ops port" notice — no network
// errors surface to the operator.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getActiveSiteId } from "../lib/sites";
import {
  fetchClientStatus,
  stageFiles,
  unstageFiles,
  commitFiles,
  pushBranch,
  openPullRequest,
  type ClientStatus,
} from "../lib/gitOps";
import { listSites } from "../lib/sitesAdmin";
import { confirm } from "../lib/confirm";
import { prompt } from "../lib/prompt";
import { notify } from "../lib/notify";
import AdminTabs from "../components/AdminTabs";
import PluginRequired from "../lib/pluginRequired";
import type { GitFileStatus } from "../server/extensionPorts";

export default function GitStatusPage(_props: unknown) {
  return (
    <PluginRequired plugin="website-editor">
      <GitStatusPageInner />
    </PluginRequired>
  );
}

function GitStatusPageInner() {
  const [clientId, setClientId] = useState<string>("");
  const [status, setStatus] = useState<ClientStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    if (!id) { setStatus(null); setLoading(false); return; }
    setLoading(true);
    try { setStatus(await fetchClientStatus(id)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Default the Client picker to the active site's clientId. The
    // sites lib already maintains an active-cursor; if no site is
    // selected, fall back to the first available one.
    const sites = listSites();
    const initial = getActiveSiteId() || sites[0]?.id || "";
    setClientId(initial);
    void refresh(initial);
  }, [refresh]);

  async function doStage(files: string[]) {
    if (!clientId || files.length === 0) return;
    setBusy("stage");
    try {
      const r = await stageFiles(clientId, files);
      if (r.ok) notify({ tone: "ok", title: "Files staged", message: `${files.length} file${files.length === 1 ? "" : "s"}` });
      else notify({ tone: "error", title: "Stage failed", message: r.error });
      await refresh(clientId);
    } finally { setBusy(null); }
  }

  async function doUnstage(files: string[]) {
    if (!clientId || files.length === 0) return;
    setBusy("unstage");
    try {
      const r = await unstageFiles(clientId, files);
      if (r.ok) notify({ tone: "ok", title: "Files unstaged" });
      else notify({ tone: "error", title: "Unstage failed", message: r.error });
      await refresh(clientId);
    } finally { setBusy(null); }
  }

  async function doCommit() {
    if (!clientId) return;
    const message = await prompt({
      title: "Commit message",
      message: "Summarise this change in one line.",
      defaultValue: `Update ${clientId} portal`,
    });
    if (!message) return;
    setBusy("commit");
    try {
      const r = await commitFiles(clientId, message);
      if (!r.available) notify({ tone: "warn", title: "Git ops not wired", message: "T6 R1 hasn't shipped GitOpsPort yet." });
      else if (r.ok) notify({ tone: "ok", title: "Committed", message: r.sha ? r.sha.slice(0, 8) : "" });
      else notify({ tone: "error", title: "Commit failed", message: r.error });
      await refresh(clientId);
    } finally { setBusy(null); }
  }

  async function doPush() {
    if (!clientId) return;
    const ok = await confirm({
      title: "Push to remote?",
      message: "This pushes the current branch upstream.",
      confirmLabel: "Push",
    });
    if (!ok) return;
    setBusy("push");
    try {
      const r = await pushBranch(clientId);
      if (!r.available) notify({ tone: "warn", title: "Git ops not wired" });
      else if (r.ok) notify({ tone: "ok", title: "Pushed", message: r.remoteBranch ?? "" });
      else notify({ tone: "error", title: "Push failed", message: r.error });
      await refresh(clientId);
    } finally { setBusy(null); }
  }

  async function doOpenPr() {
    if (!clientId) return;
    const title = await prompt({
      title: "Pull request title",
      defaultValue: `Update ${clientId} portal`,
    });
    if (!title) return;
    setBusy("pr");
    try {
      const r = await openPullRequest(clientId, title);
      if (!r.available) notify({ tone: "warn", title: "Git ops not wired" });
      else if (r.ok) {
        notify({ tone: "ok", title: "PR opened", message: r.url ?? "" });
        if (r.url && typeof window !== "undefined") window.open(r.url, "_blank");
      } else notify({ tone: "error", title: "PR open failed", message: r.error });
    } finally { setBusy(null); }
  }

  const sites = listSites();
  const portUnavailable = status && !status.available;

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6">
      <AdminTabs
        ariaLabel="Growth"
        tabs={[
          { label: "Portals", href: "../portals" },
          { label: "Sites", href: "../sites" },
          { label: "Git status", href: "../git-status" },
        ]}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">Per-client repo</p>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Git status</h1>
          <p className="text-brand-cream/45 text-sm mt-1">
            Pending file changes in <code>clients/&lt;slug&gt;/</code> per Live client. Stage → Commit → Push → Open PR.
          </p>
        </div>
        <select
          value={clientId}
          onChange={e => { setClientId(e.target.value); void refresh(e.target.value); }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
        >
          {sites.length === 0 && <option value="">No clients</option>}
          {sites.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-brand-cream/45 text-sm">Loading…</p>}

      {!loading && portUnavailable && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          <p className="font-semibold mb-1">Git ops port not wired</p>
          <p className="opacity-80">
            T6 R1's deployment work will ship the <code>GitOpsPort</code> implementation that powers this page.
            Until then, edits made in client-repo mode land on disk under <code>clients/&lt;slug&gt;/</code> but
            commits + pushes are manual (run <code>git</code> in the client's folder).
          </p>
        </div>
      )}

      {!loading && status?.available && status.status && (
        <StatusView
          status={status.status}
          busy={busy}
          onStage={doStage}
          onUnstage={doUnstage}
          onCommit={doCommit}
          onPush={doPush}
          onOpenPr={doOpenPr}
        />
      )}

      {!loading && status?.available === false && status.error && (
        <p className="text-sm text-red-300">Couldn't load git status: {status.error}</p>
      )}

      <p className="text-[11px] text-brand-cream/35">
        Tip: live editor edits made in <strong>client-repo</strong> mode land here as pending changes.
        See the <Link href="../editor" className="underline hover:text-brand-cream/65">visual editor</Link> for the toggle.
      </p>
    </div>
  );
}

function StatusView({
  status, busy, onStage, onUnstage, onCommit, onPush, onOpenPr,
}: {
  status: NonNullable<ClientStatus["status"]>;
  busy: string | null;
  onStage: (files: string[]) => Promise<void>;
  onUnstage: (files: string[]) => Promise<void>;
  onCommit: () => Promise<void>;
  onPush: () => Promise<void>;
  onOpenPr: () => Promise<void>;
}) {
  const staged = status.files.filter(f => f.staged);
  const unstaged = status.files.filter(f => !f.staged);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
          branch <code className="text-brand-cream">{status.branch}</code>
        </span>
        {status.ahead > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-500/25">
            ↑ {status.ahead} ahead
          </span>
        )}
        {status.behind > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/25">
            ↓ {status.behind} behind
          </span>
        )}
        {!status.hasRemote && (
          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 opacity-70">
            no remote configured
          </span>
        )}
        <span className="ml-auto flex gap-2">
          <button
            onClick={() => void onCommit()}
            disabled={busy !== null || staged.length === 0}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-brand-cream/85 disabled:opacity-40"
          >
            Commit{busy === "commit" ? "…" : ""}
          </button>
          <button
            onClick={() => void onPush()}
            disabled={busy !== null || !status.hasRemote || status.ahead === 0}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-brand-cream/85 disabled:opacity-40"
          >
            Push{busy === "push" ? "…" : ""}
          </button>
          <button
            onClick={() => void onOpenPr()}
            disabled={busy !== null || !status.hasRemote}
            className="text-xs px-4 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-light text-white font-semibold disabled:opacity-40"
          >
            Open PR{busy === "pr" ? "…" : ""}
          </button>
        </span>
      </div>

      <FileList
        title="Staged for commit"
        files={staged}
        emptyText="Nothing staged."
        action={{ label: "Unstage", onClick: paths => void onUnstage(paths), busy: busy === "unstage" }}
      />

      <FileList
        title="Changed (unstaged)"
        files={unstaged}
        emptyText="Working tree clean."
        action={{ label: "Stage", onClick: paths => void onStage(paths), busy: busy === "stage" }}
      />
    </div>
  );
}

function FileList({
  title,
  files,
  emptyText,
  action,
}: {
  title: string;
  files: GitFileStatus[];
  emptyText: string;
  action: { label: string; onClick: (paths: string[]) => void; busy: boolean };
}) {
  return (
    <section className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] tracking-[0.18em] uppercase text-brand-amber">{title} · {files.length}</p>
        {files.length > 0 && (
          <button
            onClick={() => action.onClick(files.map(f => f.path))}
            disabled={action.busy}
            className="text-[11px] px-2.5 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-brand-cream/75 disabled:opacity-40"
          >
            {action.label} all{action.busy ? "…" : ""}
          </button>
        )}
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-brand-cream/45">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {files.map(f => (
            <li key={f.path} className="flex items-center gap-3 py-1.5 text-xs">
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold"
                style={{
                  background:
                    f.status === "added" ? "rgba(34,197,94,0.18)" :
                    f.status === "deleted" ? "rgba(239,68,68,0.18)" :
                    f.status === "renamed" ? "rgba(168,85,247,0.18)" :
                    f.status === "untracked" ? "rgba(99,123,255,0.18)" :
                    "rgba(255,255,255,0.08)",
                  color:
                    f.status === "added" ? "#86efac" :
                    f.status === "deleted" ? "#fca5a5" :
                    f.status === "renamed" ? "#d8b4fe" :
                    f.status === "untracked" ? "#bcc6ff" :
                    "rgba(255,255,255,0.7)",
                }}
              >
                {f.status === "added" ? "A" : f.status === "deleted" ? "D" : f.status === "renamed" ? "R" : f.status === "untracked" ? "?" : "M"}
              </span>
              <code className="font-mono flex-1 min-w-0 truncate">{f.path}</code>
              <button
                onClick={() => action.onClick([f.path])}
                disabled={action.busy}
                className="text-[10px] text-brand-cream/55 hover:text-brand-cream/85 disabled:opacity-40"
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
