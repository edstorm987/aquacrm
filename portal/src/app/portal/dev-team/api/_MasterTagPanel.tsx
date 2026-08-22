"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Clipboard, ShieldCheck } from "lucide-react";
import { useState } from "react";

// The master Aqua Tag, seen as what it is on this page: a THIRD machine-facing
// surface with its own permanent credential. One script on someone else's
// website, one site key, three public endpoints.
//
// Everything here is derived — the snippet from `masterTagSnippet()`, the
// provider list from `INJECTION_PROVIDERS` — so it cannot drift from the tag.
// The guided setup (detect · scan forms · route a site · configure injections)
// is NOT duplicated here; it lives in Fulfilment → Aqua tags and is linked.

export interface TagProviderView {
  kind: string;
  label: string;
  valueLabel: string;
  valuePattern: string;
  defaultConsentCategory: string;
}

export interface MasterTagView {
  siteKey: string;
  snippet: string;
  scriptUrl: string;
  configUrl: string;
  formCaptureUrl: string;
  telemetryUrl: string;
  origin: string;
  originIsFallback: boolean;
  providers: TagProviderView[];
  taggedSiteCount: number;
}

const CONSENT_TONE: Record<string, string> = {
  necessary: "bg-[color:var(--dev-success-soft)] text-[color:var(--dev-success)]",
  preferences: "bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]",
  analytics: "bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]",
  marketing: "bg-[color:var(--dev-danger-soft)] text-[color:var(--dev-danger)]",
};

export function MasterTagPanel({ view }: { view: MasterTagView }) {
  const [copied, setCopied] = useState("");

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1_500);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--dt-muted)]">
          One script, pasted into a site&apos;s HTML, identified by a permanent agency site key. It captures forms,
          sends consent-gated telemetry, and acts as a tag manager for an allow-listed set of third-party tools.
          Unlike an API key this credential is <strong className="text-[color:var(--dt-ink)]">never rotated</strong> — it lives in
          other people&apos;s deployed sites.
        </p>
        <Link
          href="/portal/agency/fulfilment?view=tags"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] px-3 text-xs font-medium text-[color:var(--dev-accent)] transition-colors hover:border-[color:var(--dev-accent-line)] hover:bg-[color:var(--dt-raised)]"
        >
          Detect, route &amp; configure
          <ArrowUpRight size={13} />
        </Link>
      </div>

      {/* An inverted well, not "the ink colour as a background": --dev-ink is a
          TEXT token and flips to cream in the forge, which put white-on-cream
          at 1.19:1 — the snippet you are meant to copy vanished. --dev-inverse
          stays dark in both modes (11.8:1 / 16.1:1 for the snippet). */}
      <div className="mt-4 rounded-xl border border-[color:var(--dt-line)] bg-[color:var(--dev-inverse)] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--dev-inverse-muted)]">Paste into every site</span>
          <button
            type="button"
            onClick={() => copy(view.snippet, "snippet")}
            className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--dev-inverse-film)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--dev-inverse-ink)] transition-colors hover:bg-[color:var(--dev-inverse-film-hover)]"
          >
            {copied === "snippet" ? <Check size={12} /> : <Clipboard size={12} />}
            {copied === "snippet" ? "Copied" : "Copy snippet"}
          </button>
        </div>
        <code className="mt-2 block break-all font-mono text-[11px] leading-5 text-[color:var(--dev-inverse-ink)]">{view.snippet}</code>
      </div>

      {view.originIsFallback ? (
        <p className="mt-2 rounded-lg bg-[color:var(--dev-warning-soft)] px-3 py-2 text-[11px] leading-5 text-[color:var(--dev-warning)]">
          <strong>Don&apos;t paste this one anywhere real.</strong> It points at{" "}
          <code className="font-mono">{view.origin}</code>, which no visitor&apos;s browser can reach — every call the
          tag makes would fail silently. Set <code className="font-mono">NEXT_PUBLIC_PORTAL_BASE_URL</code> to the
          public portal URL and copy the snippet again.
        </p>
      ) : null}

      <div className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Value label="Agency site key" value={view.siteKey} hint="Permanent — generated once, never rotated" onCopy={() => copy(view.siteKey, "key")} copied={copied === "key"} />
        <Value label="Tag script" value={view.scriptUrl} hint="Public · served to any site" />
        <Value label="Config endpoint" value={view.configUrl} hint="GET/OPTIONS · which tools to inject, by key + host" />
        <Value label="Form capture" value={view.formCaptureUrl} hint="POST · captured forms → enquiries (live Supabase)" />
        <Value label="Telemetry + consent" value={view.telemetryUrl} hint="POST · page/consent events (live Supabase)" />
        <Value label="Routed sites" value={`${view.taggedSiteCount} tagged site${view.taggedSiteCount === 1 ? "" : "s"} configured`} hint="Host overrides for where enquiries land" />
      </div>

      <div className="mt-5 border-t border-[color:var(--dt-line)] pt-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-[color:var(--dev-accent)]" />
          <h3 className="text-sm font-semibold text-[color:var(--dt-ink)]">What the tag may inject</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-[color:var(--dt-muted)]">
          A strict allow-list — <strong className="text-[color:var(--dt-ink)]">there is deliberately no raw-snippet path</strong>.
          A value that doesn&apos;t match its provider&apos;s pattern never reaches the injected markup, and each tool
          waits for its consent bucket before it loads.
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-[color:var(--dt-hairline)] rounded-xl border border-[color:var(--dt-line)]">
          {view.providers.map(provider => (
            <li key={provider.kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs">
              <span className="min-w-[10rem] font-medium text-[color:var(--dt-ink)]">{provider.label}</span>
              <span className="text-[color:var(--dt-muted)]">{provider.valueLabel}</span>
              <code className="font-mono text-[10px] text-[color:var(--dt-faint)]">{provider.valuePattern}</code>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${CONSENT_TONE[provider.defaultConsentCategory] ?? "bg-[color:var(--dt-hairline)] text-[color:var(--dt-muted)]"}`}>
                {provider.defaultConsentCategory}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Value({ label, value, hint, onCopy, copied }: {
  label: string;
  value: string;
  hint?: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[color:var(--dt-line)] bg-[color:var(--dt-raised)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--dt-faint)]">{label}</span>
        {onCopy ? (
          <button type="button" onClick={onCopy} aria-label={`Copy ${label}`} className="rounded p-1 text-[color:var(--dt-faint)] hover:bg-[color:var(--dt-hairline)] hover:text-[color:var(--dt-ink)]">
            {copied ? <Check size={12} /> : <Clipboard size={12} />}
          </button>
        ) : null}
      </div>
      <p className="mt-1 truncate font-mono text-xs text-[color:var(--dt-ink)]" title={value}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-[color:var(--dt-faint)]">{hint}</p> : null}
    </div>
  );
}
