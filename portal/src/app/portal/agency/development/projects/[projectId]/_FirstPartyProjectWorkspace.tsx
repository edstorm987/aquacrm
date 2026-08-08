"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check as CheckIcon,
  Copy,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitBranch,
  Globe2,
  MonitorPlay,
  RadioTower,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import type { FirstPartyDevelopmentProject } from "@/lib/firstPartyDevelopmentProjects";

export function FirstPartyProjectWorkspace({
  project,
  githubWriteConfigured,
}: {
  project: FirstPartyDevelopmentProject;
  githubWriteConfigured: boolean;
}) {
  const [mode, setMode] = useState<"preview" | "public">("preview");
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const frameUrl = mode === "preview" ? project.previewUrl : project.publicUrl;
  const tagSnippet = project.telemetrySiteKey && project.telemetryPropertyId
    ? `<script src="https://aqua-crm.com/aqua-tag.js" data-site-key="${project.telemetrySiteKey}" data-property="${project.telemetryPropertyId}" defer></script>`
    : "";

  async function copyTag() {
    if (!tagSnippet) return;
    await navigator.clipboard.writeText(tagSnippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <Link href="/portal/agency/development" className="inline-flex items-center gap-1.5 text-xs font-medium text-black/45 hover:text-black/75">
            <ArrowLeft size={13} />Development control centre
          </Link>
          <div className="mt-4 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{project.kind === "lead-magnet" ? "Lead magnet" : project.kind}</p>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-[10px] font-semibold uppercase text-brand">{project.brand}</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">{project.name}</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">{project.description}</p>
        </div>
        <div className="flex gap-2">
          <a href={project.previewUrl} target="_blank" rel="noreferrer" className={secondary}><MonitorPlay size={15} />Open real build</a>
          <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className={primary}><GitBranch size={15} />Repository</a>
        </div>
      </header>

      <section className="grid border-y border-black/10 sm:grid-cols-3">
        <Summary icon={<ShieldCheck size={16} />} label="Release" value={statusLabel(project.status)} />
        <Summary icon={<FolderGit2 size={16} />} label="Folder" value={project.folder} />
        <Summary icon={<FileCode2 size={16} />} label="Source" value={project.sourcePath} />
      </section>

      <section className="border-y border-black/10 py-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <Connection
            icon={<RadioTower size={17} />}
            label="Aqua tag"
            state={tagSnippet ? "Configured" : "Not required"}
            detail={tagSnippet
              ? "Consent-aware browser events are separated by this project's property ID. Form values are never collected by the tag."
              : "This internal project does not need a browser monitoring tag."}
          >
            {tagSnippet ? (
              <div className="mt-3 flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-black/[0.045] px-2 py-2 text-[10px] text-black/55">{tagSnippet}</code>
                <button type="button" onClick={() => void copyTag()} aria-label="Copy Aqua tag" title="Copy Aqua tag" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.04]">
                  {copied ? <CheckIcon size={14} /> : <Copy size={14} />}
                </button>
              </div>
            ) : null}
          </Connection>
          <Connection
            icon={<GitBranch size={17} />}
            label="Repository"
            state={githubWriteConfigured ? "Write access connected" : project.repositoryUrl ? "Repository linked" : "Not connected"}
            detail={githubWriteConfigured
              ? "A server-side GitHub credential is available for controlled source changes and release history. It never reaches the browser tag."
              : "The repository is known, but write access still needs a fine-grained GitHub credential in the server environment."}
          >
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {project.repositoryUrl ? <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Open repository <ExternalLink size={12} /></a> : null}
              {!githubWriteConfigured ? <Link href="/portal/agency/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Connect write access <ExternalLink size={12} /></Link> : null}
            </div>
          </Connection>
          <Connection
            icon={<Globe2 size={17} />}
            label="Analytics services"
            state="Separate authorisation"
            detail="Search Console and other provider data connect server-to-server. Visitor cookie choices continue to control only browser-side Aqua tag events."
          >
            <Link href="/portal/agency/settings" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Manage integrations <ExternalLink size={12} /></Link>
          </Connection>
        </div>
      </section>

      <section className="overflow-hidden border border-black/10 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-black/80">Project preview</h2>
            <p className="mt-0.5 text-xs text-black/40">{mode === "preview" ? "The local development build." : "The current public release."}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-1">
              <button type="button" onClick={() => setMode("public")} className={`${mode === "public" ? "bg-white text-black shadow-sm" : "text-black/45"} min-h-8 rounded px-3 text-xs font-semibold`}>
                Public site
              </button>
              <button type="button" onClick={() => setMode("preview")} className={`${mode === "preview" ? "bg-white text-black shadow-sm" : "text-black/45"} min-h-8 rounded px-3 text-xs font-semibold`}>
                Local build
              </button>
            </div>
            <button type="button" onClick={() => setPreviewKey(value => value + 1)} aria-label="Refresh project preview" title="Refresh preview" className="grid size-10 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]">
              <RefreshCw size={15} />
            </button>
            <a href={frameUrl} target="_blank" rel="noreferrer" aria-label="Open current preview in a new tab" title="Open in new tab" className="grid size-10 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]">
              <ExternalLink size={15} />
            </a>
          </div>
        </header>
        <iframe
          key={`${mode}:${previewKey}`}
          src={frameUrl}
          title={`${project.name} ${mode === "preview" ? "local build" : "public site"}`}
          className="h-[700px] w-full bg-white"
        />
      </section>

      <section className="grid gap-5 border-t border-black/10 pt-5 md:grid-cols-3">
        <Check label="Build" detail="Edit the source project and keep the preview running locally." />
        <Check label="Review" detail="Use the real-build preview without changing what public visitors see." />
        <Check label="Release" detail="Move the finished application out from behind the gate when it is ready." />
      </section>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-black/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="text-brand">{icon}</span>
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 truncate text-sm font-semibold text-black/70">{value}</p></div>
    </div>
  );
}

function Check({ label, detail }: { label: string; detail: string }) {
  return <div><h2 className="text-sm font-semibold text-black/75">{label}</h2><p className="mt-1 text-xs leading-5 text-black/45">{detail}</p></div>;
}

function Connection({ icon, label, state, detail, children }: { icon: React.ReactNode; label: string; state: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-black/10 pb-5 last:border-b-0 last:pb-0 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5 lg:last:border-r-0 lg:last:pr-0">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-black/80"><span className="text-brand">{icon}</span>{label}</span>
        <span className="text-[10px] font-semibold uppercase text-black/40">{state}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-black/50">{detail}</p>
      {children}
    </div>
  );
}

function statusLabel(status: FirstPartyDevelopmentProject["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-black/65 hover:bg-black/[0.03]";
