"use client";

// Aqua Tag SETUP — the tags themselves: registering a site, its key, install
// state. Lives under Fulfilment because tagging a site is delivery work.
//
// `agency/performance/_AquaTagDashboard.tsx` is the OTHER Aqua Tag surface, and
// it answers a different question: what the tags have MEASURED. Both are called
// "Aqua Tag" screens and neither is a rename of the other.
//
// Setup belongs here; analytics belongs there. See
// docs/workspace/hazards-and-duplication.md before adding a third.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle, Boxes, Building2, Check, Code2, Copy, FileSearch, Globe, Inbox, Link2, Loader2, Plus, Radio,
  ScanLine, Sparkles, PencilRuler, Trash2,
} from "lucide-react";

/**
 * Aqua Tags — the Fulfilment home (technical delivery) for the master tag and
 * the guided setup that follows it.
 *
 * The whole point is to run the exact flow a client's site will run, but on
 * Ed's own sites first: generate the master tag, prove it is live on the
 * domain, scan the forms, link the code, pull the site into our own editor,
 * and attach it to a company. Doing it to ourselves is the accurate test —
 * the client version is the same flow, repackaged.
 *
 * Steps one to three ship live: generate the tag, fetch the domain to prove the
 * tag is installed, and count the forms it will capture. The rest are laid out
 * honestly as the flow still to build.
 */

interface Step {
  icon: React.ReactNode;
  title: string;
  detail: string;
  status: "done" | "next" | "planned";
}

interface Detection {
  url: string;
  finalUrl?: string;
  reachable: boolean;
  statusCode?: number;
  tagPresent: boolean;
  keyMatches: boolean;
  detectedSiteKey?: string;
  forms: { total: number; capturable: number };
  error?: string;
}

export function AquaTagsWorkspace({
  snippet,
  siteKey,
  canUse,
  canManage,
}: {
  snippet: string;
  siteKey: string;
  canUse: boolean;
  canManage: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [domain, setDomain] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Detection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_500);
    } catch { /* the field selects on focus */ }
  }

  async function detect() {
    if (!canUse) return;
    const url = domain.trim();
    if (!url || checking) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/portal/aqua-tags/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; detection?: Detection; error?: string } | null;
      if (!response.ok || !data?.ok || !data.detection) {
        setError(data?.error ?? "We couldn't check that site. Try again in a moment.");
        return;
      }
      setResult(data.detection);
    } catch {
      setError("We couldn't reach the checker. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  const steps: Step[] = [
    { icon: <Sparkles size={16} aria-hidden />, title: "Generate the master tag", detail: "One tag for all your own sites. Every submission pours into your inbox — no per-site setup.", status: "done" },
    { icon: <Radio size={16} aria-hidden />, title: "Detect it on the domain", detail: "Paste the tag on a site, then we fetch the domain and confirm the tag is actually live.", status: "done" },
    { icon: <ScanLine size={16} aria-hidden />, title: "Scan for forms", detail: "We read the page and count every form we can capture, so nothing goes unwatched.", status: "done" },
    { icon: <Code2 size={16} aria-hidden />, title: "Link the repo", detail: "Connect the site's code so edits can publish back to it.", status: "next" },
    { icon: <PencilRuler size={16} aria-hidden />, title: "Seed the site into the editor", detail: "Pull the site into Dev Editor Engine, so it's editable right here.", status: "planned" },
    { icon: <Building2 size={16} aria-hidden />, title: "Link the site to a company", detail: "Route a tagged site to one of your companies (above) so its enquiries are attributed there, not left in the agency inbox.", status: "done" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Fulfilment · technical delivery</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Aqua Tags</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
          Set up your own websites the exact way a client&rsquo;s will be — generate the master tag, prove it&rsquo;s
          live, scan the forms, and pull the site in. Running it on yourself first is the real test before any
          client touches it.
        </p>
      </header>

      <section className="rounded-2xl border border-brand/25 bg-brand/[0.04] p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand/15 text-brand"><Sparkles size={20} aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-black/85">Your master tag</h2>
            <p className="mt-1 text-sm leading-6 text-black/60">
              Paste this on any of your own sites. Everything it captures comes straight into your inbox.
              Sites you route to a client (in the inbox&rsquo;s Channels) override it.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={snippet}
            aria-label="Your master Aqua tag snippet"
            onFocus={event => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-3 py-2.5 font-mono text-[11px] text-black/65"
          />
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85"
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? "Copied" : "Copy tag"}
          </button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-black/35">key · {siteKey.slice(0, 16)}…</p>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.05] text-black/60"><Radio size={20} aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-black/85">Prove it&rsquo;s live</h2>
            <p className="mt-1 text-sm leading-6 text-black/60">
              Pasted the tag on a site? Enter its address and we&rsquo;ll fetch the page, confirm the tag is
              installed, and count the forms it will capture.
            </p>
          </div>
        </div>
        <fieldset disabled={!canUse} className="contents">
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={event => { event.preventDefault(); void detect(); }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-black/10 bg-white px-3">
            <Globe size={15} className="shrink-0 text-black/35" aria-hidden />
            <input
              value={domain}
              onChange={event => setDomain(event.target.value)}
              placeholder="your-site.com"
              aria-label="Website address to check"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-black/80 outline-none placeholder:text-black/30"
            />
          </div>
          <button
            type="submit"
            disabled={!domain.trim() || checking}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ScanLine size={14} aria-hidden />}
            {checking ? "Checking…" : "Check domain"}
          </button>
        </form>
        </fieldset>

        {!canUse ? <p className="mt-3 text-xs text-black/45">View-only access. Use access is required to run a live domain check.</p> : null}

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        {result && <DetectionResult result={result} />}
      </section>

      <fieldset disabled={!canManage} className="contents">
        <CompanyRouting />

        <ToolInjections />
      </fieldset>
      {!canManage ? <p className="text-xs text-black/45">Manage access is required to change company routing or tool injections.</p> : null}

      <section>
        <div className="flex items-center gap-2 border-b border-black/10 pb-3">
          <FileSearch size={17} className="text-brand" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">The setup flow</h2>
        </div>
        <ol className="mt-4 grid gap-2.5">
          {steps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3 rounded-md border border-black/10 bg-white p-4">
              <span className={[
                "grid size-8 shrink-0 place-items-center rounded-md text-sm font-semibold",
                step.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.05] text-black/45",
              ].join(" ")}>
                {step.status === "done" ? <Check size={16} aria-hidden /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-brand">{step.icon}</span>
                  <strong className="text-sm font-semibold text-black/85">{step.title}</strong>
                  <span className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    step.status === "done" ? "bg-emerald-50 text-emerald-800" : step.status === "next" ? "bg-amber-50 text-amber-800" : "bg-black/[0.05] text-black/45",
                  ].join(" ")}>
                    {step.status === "done" ? "Ready" : step.status === "next" ? "Building next" : "Planned"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-black/55">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-5 text-black/45">
          The tag generates, detects, and scans now. The steps below reuse what we already have (the website
          editor, the repo tools, the company records), so a client&rsquo;s version is the same flow repackaged.
        </p>
      </section>
    </div>
  );
}

function DetectionResult({ result }: { result: Detection }) {
  if (!result.reachable) {
    return (
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <AlertTriangle size={15} aria-hidden /> We couldn&rsquo;t read that site
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-800">{result.error ?? "The site didn't respond."}</p>
      </div>
    );
  }

  const found = result.tagPresent && result.keyMatches;
  const wrongKey = result.tagPresent && !result.keyMatches;
  const { total, capturable } = result.forms;
  const formLine = total === 0
    ? "No forms found on this page."
    : capturable === total
      ? `${total} form${total === 1 ? "" : "s"} detected — all capturable.`
      : `${total} form${total === 1 ? "" : "s"} on the page, ${capturable} the tag will capture.`;

  return (
    <div className={[
      "mt-4 rounded-md border p-4",
      found ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
    ].join(" ")}>
      {found ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Check size={15} aria-hidden /> Aqua tag found — {capturable} form{capturable === 1 ? "" : "s"} detected
        </p>
      ) : wrongKey ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <AlertTriangle size={15} aria-hidden /> A tag is installed, but it&rsquo;s carrying a different key
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <AlertTriangle size={15} aria-hidden /> No Aqua tag found on that page yet
        </p>
      )}

      <dl className="mt-3 grid gap-1.5 text-xs leading-5">
        <div className="flex items-center gap-2">
          <dt className="text-black/45">Page read</dt>
          <dd className="min-w-0 truncate font-mono text-black/70">{result.finalUrl ?? result.url}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-black/45">Forms</dt>
          <dd className="text-black/70">{formLine}</dd>
        </div>
        {wrongKey && result.detectedSiteKey && (
          <div className="flex items-center gap-2">
            <dt className="text-black/45">Installed key</dt>
            <dd className="font-mono text-black/70">{result.detectedSiteKey.slice(0, 16)}…</dd>
          </div>
        )}
      </dl>

      {!result.tagPresent && (
        <p className="mt-3 text-xs leading-5 text-amber-800">
          Paste the master tag above into the site&rsquo;s HTML (before <code className="font-mono">&lt;/body&gt;</code>),
          deploy, then check again.
        </p>
      )}
      {wrongKey && (
        <p className="mt-3 text-xs leading-5 text-amber-800">
          That page has an Aqua tag with a different key. Swap it for your master tag above if these submissions
          should reach this inbox.
        </p>
      )}
    </div>
  );
}

interface CompanyOption { id: string; name: string; website?: string }
interface RoutedSource { id: string; host: string; label: string; destinationClientId?: string; destinationCompanyId?: string }

/**
 * Route a tagged site to one of Ed's own companies.
 *
 * The keystone made a site's destination inbox | client | company; this is the
 * surface that sets the company one. Enquiries from a company-routed site are
 * attributed to that company from the first submission instead of piling into
 * the agency inbox and hoping identity resolution guesses right.
 */
function CompanyRouting() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [sources, setSources] = useState<RoutedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [host, setHost] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/portal/website-sources");
      const data = await response.json().catch(() => null) as
        { ok?: boolean; sources?: RoutedSource[]; companies?: CompanyOption[]; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setLoadError(data?.error ?? "We couldn't load your companies. Try again in a moment.");
        return;
      }
      setCompanies(data.companies ?? []);
      setSources(data.sources ?? []);
    } catch {
      setLoadError("We couldn't load your companies. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Prefill the address from the chosen company's own website, if it has one —
  // most of the time that is exactly the site being tagged.
  function pickCompany(id: string) {
    setCompanyId(id);
    setSaveError(null);
    const chosen = companies.find(company => company.id === id);
    if (chosen?.website && !host.trim()) setHost(chosen.website);
  }

  async function link() {
    if (!companyId || !host.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", host: host.trim(), destinationCompanyId: companyId }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setSaveError(data?.error ?? "That couldn't be routed. Check the address and try again.");
        return;
      }
      setHost("");
      setCompanyId("");
      await load();
    } catch {
      setSaveError("We couldn't save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function routeToInbox(id: string) {
    setSaveError(null);
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "route-to-inbox", id }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setSaveError(data?.error ?? "That site could not be routed back to the agency inbox.");
        return;
      }
      await load();
    } catch {
      setSaveError("That site could not be routed back to the agency inbox.");
    }
  }

  const companyName = (id?: string) => companies.find(company => company.id === id)?.name ?? "a company";
  const companyRouted = sources.filter(source => source.destinationCompanyId);

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.05] text-black/60"><Building2 size={20} aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-black/85">Route a site to one of your companies</h2>
          <p className="mt-1 text-sm leading-6 text-black/60">
            Point a tagged site at one of your own companies and its enquiries are attributed to that company from
            the first submission — not left to pile up in the agency inbox.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-black/50">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading your companies…
        </p>
      ) : loadError ? (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{loadError}</span>
        </p>
      ) : companies.length === 0 ? (
        <p className="mt-4 rounded-md border border-black/10 bg-black/[0.02] p-4 text-xs leading-5 text-black/55">
          You don&rsquo;t have any companies yet.{" "}
          <Link href="/portal/agency/company" className="font-semibold text-brand hover:underline">Create one first</Link>, then route its site here.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-black/55">
              Company
              <select
                value={companyId}
                onChange={event => pickCompany(event.target.value)}
                className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-black/80 outline-none"
              >
                <option value="">Choose a company…</option>
                {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-black/55">
              Site address
              <div className="flex items-center gap-2 rounded-md border border-black/10 bg-white px-3">
                <Globe size={15} className="shrink-0 text-black/35" aria-hidden />
                <input
                  value={host}
                  onChange={event => setHost(event.target.value)}
                  placeholder="your-company.com"
                  aria-label="Company site address"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-black/80 outline-none placeholder:text-black/30"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => void link()}
              disabled={!companyId || !host.trim() || saving}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Link2 size={14} aria-hidden />}
              {saving ? "Routing…" : "Route to company"}
            </button>
          </div>

          {saveError && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{saveError}</span>
            </p>
          )}

          {companyRouted.length > 0 && (
            <ul className="mt-4 grid gap-2">
              {companyRouted.map(source => (
                <li key={source.id} className="flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.02] px-3 py-2.5">
                  <Building2 size={15} className="shrink-0 text-brand" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-black/75">{source.host}</p>
                    <p className="text-[11px] text-black/45">&rarr; {companyName(source.destinationCompanyId)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void routeToInbox(source.id)}
                    aria-label={`Route ${source.host} back to the agency inbox`}
                    title="Keep the registered site and its tools; only change where new enquiries go"
                    className="inline-flex size-8 items-center justify-center rounded-md text-black/40 hover:bg-black/[0.05] hover:text-brand"
                  >
                    <Inbox size={15} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

interface InjectionRecord { id: string; kind: string; value: string; consentCategory: string; enabled: boolean; label?: string }
interface InjectionSite { id: string; host: string; label: string; injections: InjectionRecord[] }
interface ProviderOption { kind: string; label: string; valueLabel: string; defaultConsentCategory: string }

const CONSENT_LABELS: Record<string, string> = {
  necessary: "Necessary", preferences: "Preferences", analytics: "Analytics", marketing: "Marketing",
};
const CONSENT_ORDER = ["necessary", "preferences", "analytics", "marketing"];

/**
 * Tools & injections — the consent-aware tag manager's control surface.
 *
 * Configure a known provider (GA4/GTM/PostHog/pixels/GSC) on a site by id/key;
 * the tag fetches the site's config and injects each only when its consent
 * category is granted. No raw scripts — the server validates every value.
 */
function ToolInjections() {
  const [sites, setSites] = useState<InjectionSite[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const [kind, setKind] = useState("");
  const [value, setValue] = useState("");
  const [consentCategory, setConsentCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/portal/website-injections");
      const data = await response.json().catch(() => null) as
        { ok?: boolean; sites?: InjectionSite[]; providers?: ProviderOption[]; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setLoadError(data?.error ?? "We couldn't load your tools. Try again in a moment.");
        return;
      }
      setSites(data.sites ?? []);
      setProviders(data.providers ?? []);
      setSiteId(current => current || (data.sites?.[0]?.id ?? ""));
    } catch {
      setLoadError("We couldn't load your tools. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedProvider = providers.find(provider => provider.kind === kind);
  const selectedSite = sites.find(site => site.id === siteId);
  const providerLabel = (value: string) => providers.find(provider => provider.kind === value)?.label ?? value;

  function pickKind(nextKind: string) {
    setKind(nextKind);
    setSaveError(null);
    const provider = providers.find(entry => entry.kind === nextKind);
    setConsentCategory(provider ? provider.defaultConsentCategory : "");
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/portal/website-injections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !data?.ok) throw new Error(data?.error ?? "That could not be saved.");
  }

  async function add() {
    if (!siteId || !kind || !value.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await post({ action: "add", siteId, kind, value: value.trim(), consentCategory: consentCategory || undefined });
      setValue(""); setKind(""); setConsentCategory("");
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "That could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(injection: InjectionRecord, enabled: boolean) {
    setSaveError(null);
    try {
      await post({ action: "update", siteId, injectionId: injection.id, enabled });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "That tool could not be changed.");
    }
    await load();
  }

  async function remove(injectionId: string) {
    const injection = selectedSite?.injections.find(item => item.id === injectionId);
    const label = injection ? providerLabel(injection.kind) : "this tool";
    if (!window.confirm(`Remove ${label} from new page loads? A visitor page that already loaded it may keep running it until refreshed.`)) return;
    setSaveError(null);
    try {
      await post({ action: "remove", siteId, injectionId });
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "That tool could not be removed.");
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.05] text-black/60"><Boxes size={20} aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-black/85">Tools &amp; injections</h2>
          <p className="mt-1 text-sm leading-6 text-black/60">
            Run analytics and pixels <em>through</em> the tag: configure a tool once and it&rsquo;s injected on the
            site, held until the visitor grants its consent category. One tag, one consent gate, no separate CMP.
            Known providers by id/key only — no pasted scripts.
          </p>
          <p className="mt-2 text-xs leading-5 text-amber-800">
            On/off and removal changes apply to new page loads immediately. A visitor page that already loaded a
            provider may keep it running until that page is refreshed; Aqua cannot safely unload third-party code
            after it has executed.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-black/50">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading your tools…
        </p>
      ) : loadError ? (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{loadError}</span>
        </p>
      ) : sites.length === 0 ? (
        <p className="mt-4 rounded-md border border-black/10 bg-black/[0.02] p-4 text-xs leading-5 text-black/55">
          Register a site above first (route it to your inbox, a client, or a company), then add its tools here.
        </p>
      ) : (
        <>
          <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-black/55">
            Site
            <select
              value={siteId}
              onChange={event => setSiteId(event.target.value)}
              className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-black/80 outline-none"
            >
              {sites.map(site => <option key={site.id} value={site.id}>{site.host}</option>)}
            </select>
          </label>

          {selectedSite && selectedSite.injections.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {selectedSite.injections.map(injection => (
                <li key={injection.id} className="flex flex-wrap items-center gap-3 rounded-md border border-black/10 bg-black/[0.02] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-black/80">
                      {providerLabel(injection.kind)}
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">{CONSENT_LABELS[injection.consentCategory] ?? injection.consentCategory}</span>
                      {!injection.enabled ? <span className="text-[10px] font-medium uppercase tracking-wide text-black/35">off for new loads</span> : null}
                    </p>
                    <p className="truncate font-mono text-[11px] text-black/45">{injection.value}</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-black/55">
                    <input
                      type="checkbox"
                      checked={injection.enabled}
                      onChange={event => void toggle(injection, event.target.checked)}
                      aria-label={`${injection.enabled ? "Disable" : "Enable"} ${providerLabel(injection.kind)} on new page loads`}
                    /> On for new loads
                  </label>
                  <button
                    type="button"
                    onClick={() => void remove(injection.id)}
                    aria-label={`Remove ${providerLabel(injection.kind)}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-black/40 hover:bg-black/[0.05] hover:text-rose-700"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/[0.06] pt-3">
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-black/55">
              Tool
              <select
                value={kind}
                onChange={event => pickKind(event.target.value)}
                className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-black/80 outline-none"
              >
                <option value="">Choose a tool…</option>
                {providers.map(provider => <option key={provider.kind} value={provider.kind}>{provider.label}</option>)}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-[2] flex-col gap-1 text-xs font-medium text-black/55">
              {selectedProvider ? selectedProvider.valueLabel : "ID / key"}
              <input
                value={value}
                onChange={event => setValue(event.target.value)}
                placeholder={selectedProvider ? selectedProvider.valueLabel : "Choose a tool first"}
                disabled={!kind}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-black/80 outline-none placeholder:text-black/30 disabled:bg-black/[0.03]"
              />
            </label>
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-black/55">
              Consent
              <select
                value={consentCategory || (selectedProvider ? selectedProvider.defaultConsentCategory : "necessary")}
                onChange={event => setConsentCategory(event.target.value)}
                disabled={!kind}
                className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-black/80 outline-none disabled:bg-black/[0.03]"
              >
                {CONSENT_ORDER.map(category => <option key={category} value={category}>{CONSENT_LABELS[category]}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void add()}
              disabled={!kind || !value.trim() || saving}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
              {saving ? "Adding…" : "Add tool"}
            </button>
          </div>
          {saveError && (
            <p className="mt-2 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{saveError}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
