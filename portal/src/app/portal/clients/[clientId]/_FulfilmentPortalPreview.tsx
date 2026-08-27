"use client";

import {
  ArrowUpRight,
  Check,
  CircleCheck,
  Copy,
  Eye,
  FileText,
  Mail,
  Monitor,
  PackagePlus,
  Save,
  Send,
  Smartphone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ClientApproval, ClientApprovalType } from "@/app/api/tenants/client-approvals/route";
import type { PortalProductSelection } from "@/lib/portal/portalProducts";
import { PORTAL_PHASE_LABELS } from "@/lib/portal/portalProducts";

export type CustomerPortalMode = "onboarding" | "designing" | "developed-launch" | "maintenance";

export interface CustomerPortalPreviewInitial {
  mode?: CustomerPortalMode;
  loginEmail?: string;
  contactName?: string;
  servicePlan?: string;
  planSummary?: string;
  planIncludes?: string[];
  products?: PortalProductSelection[];
  experienceHeadline?: string;
  billingCadence?: string;
  welcomeNote?: string;
  welcomeVideoUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportWhatsappUrl?: string;
  logoUrl?: string;
  accentColor?: string;
  billingUrl?: string;
  websiteUrl?: string;
  stageLabel: string;
  portalBuiltAt?: number;
  accessSentAt?: number;
  accessPreparedAt?: number;
  fileCount?: number;
  invoiceCount?: number;
  outstandingInvoiceCount?: number;
  contractCount?: number;
  propertyCount?: number;
  tagInstalledCount?: number;
  approvals?: ClientApproval[];
}

const MODES: Array<{
  id: CustomerPortalMode;
  label: string;
  description: string;
}> = [
  { id: "onboarding", label: PORTAL_PHASE_LABELS.onboarding, description: "Collect details and inspiration" },
  { id: "designing", label: PORTAL_PHASE_LABELS.designing, description: "Share the work and gather feedback" },
  { id: "developed-launch", label: PORTAL_PHASE_LABELS["developed-launch"], description: "Build, test and prepare to launch" },
  { id: "maintenance", label: PORTAL_PHASE_LABELS.maintenance, description: "Live, supported and monitored" },
];

const CONTROL = "min-h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm text-[#282521] outline-none transition placeholder:text-black/30 focus:border-[#91713a] focus:ring-2 focus:ring-[#91713a]/10";

export function FulfilmentPortalPreview({
  clientId,
  clientName,
  providerName,
  initial,
  canManage = true,
}: {
  clientId: string;
  clientName: string;
  providerName: string;
  initial: CustomerPortalPreviewInitial;
  canManage?: boolean;
}) {
  const [mode, setMode] = useState<CustomerPortalMode>(initial.mode ?? "onboarding");
  const [loginEmail, setLoginEmail] = useState(initial.loginEmail ?? "");
  const [contactName, setContactName] = useState(initial.contactName ?? "");
  const [servicePlan, setServicePlan] = useState(initial.servicePlan ?? "");
  const [planSummary, setPlanSummary] = useState(initial.planSummary ?? "");
  const [planIncludes, setPlanIncludes] = useState((initial.planIncludes ?? []).join("\n"));
  const products = initial.products ?? [];
  const [experienceHeadline, setExperienceHeadline] = useState(initial.experienceHeadline ?? "");
  const [billingCadence, setBillingCadence] = useState(initial.billingCadence ?? "As agreed");
  const [welcomeNote, setWelcomeNote] = useState(initial.welcomeNote ?? "");
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState(initial.welcomeVideoUrl ?? "");
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail ?? "");
  const [supportPhone, setSupportPhone] = useState(initial.supportPhone ?? "");
  const [supportWhatsappUrl, setSupportWhatsappUrl] = useState(initial.supportWhatsappUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(initial.accentColor ?? "#8b6c33");
  const [billingUrl, setBillingUrl] = useState(initial.billingUrl ?? "");
  const [portalBuiltAt, setPortalBuiltAt] = useState(initial.portalBuiltAt ?? 0);
  const [busy, setBusy] = useState<"build" | "save" | "send" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [devAccessUrl, setDevAccessUrl] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<"sent" | "prepared" | null>(
    initial.accessSentAt ? "sent" : initial.accessPreparedAt ? "prepared" : null,
  );
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [approvals, setApprovals] = useState(initial.approvals ?? []);
  const [approvalBusy, setApprovalBusy] = useState<ClientApprovalType | null>(null);
  const [desktopScale, setDesktopScale] = useState(0.6);
  const desktopHostRef = useRef<HTMLDivElement | null>(null);

  const previewHref = `/client-preview/${clientId}${canManage ? "?manage=1" : ""}`;
  const embeddedPreviewHref = `/client-preview/${clientId}?embedded=1${canManage ? "&manage=1" : ""}`;
  const activeMode = useMemo(() => MODES.find(item => item.id === mode) ?? MODES[0], [mode]);
  const readiness = [
    { label: "Portal", ready: Boolean(portalBuiltAt), value: portalBuiltAt ? "Ready" : "Create it" },
    { label: "Customer email", ready: Boolean(loginEmail.trim()), value: loginEmail.trim() ? "Ready" : "Missing" },
    { label: "Products", ready: products.length > 0, value: products.length ? `${products.length} selected` : "Choose products" },
    {
      label: "Billing",
      ready: (initial.outstandingInvoiceCount ?? 0) === 0 || Boolean(billingUrl.trim()),
      value: (initial.outstandingInvoiceCount ?? 0) === 0
        ? "Nothing due"
        : billingUrl.trim()
          ? "Payment ready"
          : `${initial.outstandingInvoiceCount} unpaid`,
    },
    {
      label: "Project data",
      ready: (initial.fileCount ?? 0) + (initial.invoiceCount ?? 0) + (initial.contractCount ?? 0) + (initial.propertyCount ?? 0) > 0,
      value: `${(initial.fileCount ?? 0) + (initial.invoiceCount ?? 0) + (initial.contractCount ?? 0) + (initial.propertyCount ?? 0)} linked`,
    },
  ];

  useEffect(() => {
    const host = desktopHostRef.current;
    if (!host) return;
    const update = () => setDesktopScale(Math.min(host.clientWidth / 1280, 1));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  function edit<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDirty(true);
    setMessage(null);
  }

  async function submit(action: "build-portal" | "save" | "send-access") {
    setBusy(action === "build-portal" ? "build" : action === "save" ? "save" : "send");
    setMessage(null);
    setDevAccessUrl(null);
    try {
      const response = await fetch("/api/tenants/customer-portal-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          action,
          mode,
          loginEmail,
          contactName,
          servicePlan,
          planSummary,
          planIncludes,
          products,
          experienceHeadline,
          billingCadence,
          welcomeNote,
          welcomeVideoUrl,
          supportEmail,
          supportPhone,
          supportWhatsappUrl,
          logoUrl,
          accentColor,
          billingUrl,
        }),
      });
      const payload = await response.json() as {
        ok: boolean;
        error?: string;
        client?: { metadata?: { portalBuiltAt?: number } };
        sent?: boolean;
        username?: string;
        devAccessUrl?: string;
      };
      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "Something went wrong.");
        return;
      }

      const nextBuiltAt = payload.client?.metadata?.portalBuiltAt;
      if (nextBuiltAt) setPortalBuiltAt(nextBuiltAt);
      setDirty(false);
      setPreviewVersion(Date.now());

      if (action === "send-access") {
        setAccessStatus(payload.sent ? "sent" : payload.devAccessUrl ? "prepared" : null);
        setMessage(payload.sent
          ? `Access sent to ${payload.username}.`
          : `Access is ready for ${payload.username}. Email delivery is not connected in this local workspace, so use the private one-time sign-in link below.`);
        setDevAccessUrl(payload.devAccessUrl ?? null);
      } else if (action === "build-portal") {
        setMessage("Portal created. Review the live preview, then send access when you are happy.");
      } else {
        setMessage("Changes saved. The live preview is up to date.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the portal.");
    } finally {
      setBusy(null);
    }
  }

  async function copyAccessLink() {
    if (!devAccessUrl) return;
    await navigator.clipboard.writeText(devAccessUrl);
    setMessage("Private one-time sign-in link copied.");
  }

  async function requestApproval(type: ClientApprovalType) {
    setApprovalBusy(type);
    setMessage(null);
    try {
      const response = await fetch("/api/tenants/client-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          action: "request",
          type,
          detail: type === "design"
            ? "Please review the latest direction and confirm that the work can move forward."
            : "Please review the latest work and confirm that it is ready for final delivery.",
        }),
      });
      const payload = await response.json() as {
        ok: boolean;
        error?: string;
        approvals?: ClientApproval[];
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not request approval.");
      setApprovals(payload.approvals ?? approvals);
      setPreviewVersion(Date.now());
      setMessage(`${type === "design" ? "Direction" : "Delivery"} approval is now waiting in the client portal.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request approval.");
    } finally {
      setApprovalBusy(null);
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-col justify-between gap-5 border-b border-black/10 pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#87682f]">Fulfilment · Client portal</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">{clientName}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/52">
            Create the client&apos;s {providerName} home, check the exact experience, and send access when it is ready.
          </p>
        </div>
        {canManage ? <div className="flex flex-wrap gap-2">
          {portalBuiltAt ? (
            <a
              href={`/portal/agency/portals/editor?scope=client&clientId=${encodeURIComponent(clientId)}&mode=${encodeURIComponent(mode)}&section=home&context=client-workspace`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-white"
            >
              <Sparkles size={15} aria-hidden="true" />
              Open portal studio
            </a>
          ) : null}
          {portalBuiltAt ? (
            <a
              href={previewHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-4 text-sm font-medium text-black/70"
            >
              <Eye size={15} aria-hidden="true" />
              Manage client portal
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          ) : null}
        </div> : <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">Read-only portal preview</span>}
      </header>

      <div className="grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 sm:grid-cols-3">
        <WorkflowStep number="01" label="Create" detail={portalBuiltAt ? "Portal ready" : "Create the portal"} done={Boolean(portalBuiltAt)} />
        <WorkflowStep number="02" label="Review" detail={dirty ? "Unsaved changes" : "Preview is current"} done={Boolean(portalBuiltAt) && !dirty} />
        <WorkflowStep
          number="03"
          label="Invite"
          detail={accessStatus === "sent"
            ? "Access sent"
            : accessStatus === "prepared"
              ? "Sign-in link prepared"
              : loginEmail
                ? "Access can be sent"
                : "Add customer email"}
          done={accessStatus !== null}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-md border border-black/10 bg-[#ece9e3]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="text-xs font-medium text-black/65">Live portal preview</p>
                {dirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">Save to refresh</span>}
              </div>
              <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-0.5">
                <PreviewButton active={previewWidth === "desktop"} label="Desktop" icon={<Monitor size={14} />} onClick={() => setPreviewWidth("desktop")} />
                <PreviewButton active={previewWidth === "mobile"} label="Mobile" icon={<Smartphone size={14} />} onClick={() => setPreviewWidth("mobile")} />
              </div>
            </div>
            <div ref={desktopHostRef} className="flex min-h-[560px] w-full justify-center overflow-hidden p-3 sm:p-5">
              {!portalBuiltAt ? (
                <div className="flex w-full max-w-xl flex-col items-center justify-center px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#9b7a3e]/25 bg-[#f8f4ec] text-[#725724]">
                    <PackagePlus size={20} aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-black/85">
                    No client portal yet
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-black/50">
                    This client can stay as a simple record. When they need a private home for updates, files, billing, or support, create it here.
                  </p>
                  {canManage ? <button
                    type="button"
                    onClick={() => void submit("build-portal")}
                    disabled={busy !== null}
                    className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1b1a18] px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Sparkles size={15} aria-hidden="true" />
                    {busy === "build" ? "Creating..." : "Create client portal"}
                  </button> : <p className="mt-5 rounded-md bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">Portal creation is disabled in this showcase.</p>}
                </div>
              ) : previewWidth === "desktop" ? (
                <div
                  className="relative w-full overflow-hidden rounded-md border border-black/10 bg-white shadow-[0_18px_55px_rgba(25,22,17,0.14)]"
                  style={{ height: `${820 * desktopScale}px` }}
                >
                  <iframe
                    key={`desktop-${previewVersion}`}
                    src={embeddedPreviewHref}
                    title={`${clientName} customer portal desktop preview`}
                    className="absolute left-0 top-0 h-[820px] w-[1280px] origin-top-left bg-white"
                    style={{ transform: `scale(${desktopScale})` }}
                  />
                </div>
              ) : (
                <div className="h-[730px] w-[390px] max-w-full overflow-hidden rounded-[24px] border-[5px] border-[#24211d] bg-white shadow-[0_18px_55px_rgba(25,22,17,0.14)]">
                  <iframe
                    key={`mobile-${previewVersion}`}
                    src={embeddedPreviewHref}
                    title={`${clientName} customer portal mobile preview`}
                    className="h-full w-full bg-white"
                  />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-md border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-black/38">Readiness</p>
                <h3 className="mt-1 text-lg font-semibold text-black/85">Before you send access</h3>
              </div>
              <span className="text-xs text-black/40">{readiness.filter(item => item.ready).length}/{readiness.length} ready</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {readiness.map(item => (
                <div key={item.label} className="rounded-md border border-black/8 bg-black/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-black/38">{item.label}</p>
                    {item.ready ? <CircleCheck size={14} className="text-emerald-600" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-amber-400" />}
                  </div>
                  <p className="mt-2 text-xs font-medium text-black/68">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/45">
              <span className="inline-flex items-center gap-1.5"><FileText size={13} /> {initial.fileCount ?? 0} files</span>
              <span>·</span>
              <span>{initial.contractCount ?? 0} accepted agreements</span>
              <span>·</span>
              <span>{initial.invoiceCount ?? 0} invoices</span>
              <span>·</span>
              <span>{initial.propertyCount ?? 0} connected properties</span>
              <span>·</span>
              <span>{initial.tagInstalledCount ?? 0} monitoring tags</span>
            </div>
          </section>
        </div>

        <fieldset disabled={!canManage} className="h-fit rounded-md border border-black/10 bg-white disabled:opacity-80 xl:sticky xl:top-20">
          <div className="border-b border-black/10 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.15em] text-black/38">Dev Editor Engine</p>
            <h3 className="mt-1 text-lg font-semibold text-black/85">Client experience</h3>
          </div>

          <div className="p-5">
            <Field label="Lifecycle view">
              <div className="grid gap-2">
                {MODES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => edit(setMode, item.id)}
                    className={[
                      "flex items-center gap-3 rounded-md border p-3 text-left transition",
                      item.id === mode
                        ? "border-[#9b7a3e]/45 bg-[#f7f1e6]"
                        : "border-black/10 bg-white hover:bg-black/[0.025]",
                    ].join(" ")}
                  >
                    <span className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      item.id === mode ? "border-[#9b7a3e] bg-[#9b7a3e] text-white" : "border-black/15 text-transparent",
                    ].join(" ")}>
                      <Check size={12} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-black/75">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] text-black/42">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <div className="mt-5 grid gap-4 border-t border-black/10 pt-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-black/38">Products & services</p>
                <p className="mt-1 text-xs leading-5 text-black/48">
                  This portal follows the canonical service assignment. Change services once and the internal workspace, delivery tools, portal modules, and reporting adapt together.
                </p>
              </div>
              {products.length ? (
                <div className="grid gap-2">
                  {products.map(product => (
                    <div key={product.id} className="flex items-start gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><PackagePlus size={13} aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <strong className="block text-sm text-black/75">{product.name}</strong>
                        <span className="mt-0.5 block text-[11px] leading-4 text-black/42">{product.description || "Configured delivery service."}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Assign at least one service before creating this portal.</p>
              )}
              {canManage ? <Link href={`/portal/clients/${encodeURIComponent(clientId)}?tab=delivery#service-assignment`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">
                <PackagePlus size={14} aria-hidden="true" /> Manage canonical services
              </Link> : null}
              <Field label="Customer portal headline" htmlFor="portal-experience-headline">
                <input
                  id="portal-experience-headline"
                  value={experienceHeadline}
                  onChange={event => edit(setExperienceHeadline, event.target.value)}
                  className={CONTROL}
                  placeholder="Leave blank to adapt automatically"
                />
                <p className="mt-1 text-[11px] leading-5 text-black/38">Optional. The selected products create this automatically unless you override it.</p>
              </Field>
            </div>

            <div className="mt-5 grid gap-4 border-t border-black/10 pt-5">
              <Field label="Customer email" htmlFor="portal-login-email">
                <input id="portal-login-email" type="email" value={loginEmail} onChange={event => edit(setLoginEmail, event.target.value)} className={CONTROL} placeholder="customer@example.com" />
              </Field>
              <Field label="Contact name" htmlFor="portal-contact-name">
                <input id="portal-contact-name" value={contactName} onChange={event => edit(setContactName, event.target.value)} className={CONTROL} placeholder="Name shown in their portal" />
              </Field>
              <Field label="Service plan" htmlFor="portal-service-plan">
                <input id="portal-service-plan" value={servicePlan} onChange={event => edit(setServicePlan, event.target.value)} className={CONTROL} placeholder="Website build & launch" />
              </Field>
              <Field label="Plan summary" htmlFor="portal-plan-summary">
                <textarea
                  id="portal-plan-summary"
                  value={planSummary}
                  onChange={event => edit(setPlanSummary, event.target.value)}
                  className={`${CONTROL} min-h-24 resize-y py-3`}
                  placeholder="A plain-English description of what this plan does for the client."
                />
              </Field>
              <Field label="What is included" htmlFor="portal-plan-includes">
                <textarea
                  id="portal-plan-includes"
                  value={planIncludes}
                  onChange={event => edit(setPlanIncludes, event.target.value)}
                  className={`${CONTROL} min-h-28 resize-y py-3`}
                  placeholder={"Website design and build\nLaunch support\nOngoing monitoring"}
                />
                <p className="mt-1 text-[11px] leading-5 text-black/38">One clear item per line.</p>
              </Field>
              <Field label="Payment schedule" htmlFor="portal-billing-cadence">
                <select id="portal-billing-cadence" value={billingCadence} onChange={event => edit(setBillingCadence, event.target.value)} className={CONTROL}>
                  <option>Project</option>
                  <option>Project + ongoing care</option>
                  <option>One-off</option>
                  <option>Monthly</option>
                  <option>Quarterly</option>
                  <option>Annually</option>
                  <option>As agreed</option>
                </select>
              </Field>
              <Field label="Secure payment link" htmlFor="portal-billing-url">
                <input id="portal-billing-url" type="url" value={billingUrl} onChange={event => edit(setBillingUrl, event.target.value)} className={CONTROL} placeholder="https://buy.stripe.com/..." />
              </Field>
              <Field label="Welcome note" htmlFor="portal-welcome-note">
                <textarea id="portal-welcome-note" value={welcomeNote} onChange={event => edit(setWelcomeNote, event.target.value)} className={`${CONTROL} min-h-28 resize-y py-3`} placeholder="A short, personal welcome." />
              </Field>
              <Field label="Welcome video (setup screen)" htmlFor="portal-welcome-video">
                <input id="portal-welcome-video" type="url" value={welcomeVideoUrl} onChange={event => edit(setWelcomeVideoUrl, event.target.value)} className={CONTROL} placeholder="Embed URL — YouTube, Vimeo or Loom" />
                {/* Shown once, on the customer's first-run setup screen. An
                    embed URL, not a watch/share link, so it plays in place. */}
                <p className="mt-1 text-[11px] leading-4 text-black/45">Plays on the customer&rsquo;s first sign-in. Use the embed link.</p>
              </Field>
            </div>

            <div className="mt-5 grid gap-4 border-t border-black/10 pt-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-black/38">Portal identity</p>
                <p className="mt-1 text-xs leading-5 text-black/48">
                  Add the client&apos;s logo and one restrained accent. {providerName} remains the delivering identity while the experience feels specific to this client.
                </p>
              </div>
              <Field label="Client logo" htmlFor="portal-logo-url">
                <input id="portal-logo-url" type="url" value={logoUrl} onChange={event => edit(setLogoUrl, event.target.value)} className={CONTROL} placeholder="https://example.com/logo.png" />
              </Field>
              <Field label="Portal accent" htmlFor="portal-accent-color">
                <div className="grid grid-cols-[44px_1fr] gap-2">
                  <input
                    id="portal-accent-color"
                    type="color"
                    value={accentColor}
                    onChange={event => edit(setAccentColor, event.target.value)}
                    className="h-11 w-11 cursor-pointer rounded-md border border-black/12 bg-white p-1"
                    aria-label="Portal accent colour"
                  />
                  <input
                    value={accentColor}
                    onChange={event => edit(setAccentColor, event.target.value)}
                    className={CONTROL}
                    aria-label="Portal accent hex value"
                    placeholder="#8b6c33"
                  />
                </div>
              </Field>
            </div>

            <div className="mt-5 grid gap-4 border-t border-black/10 pt-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-black/38">Client support</p>
                <p className="mt-1 text-xs leading-5 text-black/48">
                  Optional direct contacts shown beside the portal request form.
                </p>
              </div>
              <Field label="Support email" htmlFor="portal-support-email">
                <input id="portal-support-email" type="email" value={supportEmail} onChange={event => edit(setSupportEmail, event.target.value)} className={CONTROL} placeholder="support@example.com" />
              </Field>
              <Field label="Support phone" htmlFor="portal-support-phone">
                <input id="portal-support-phone" type="tel" value={supportPhone} onChange={event => edit(setSupportPhone, event.target.value)} className={CONTROL} placeholder="+44 0000 000000" />
              </Field>
              <Field label="Support WhatsApp" htmlFor="portal-support-whatsapp">
                <input id="portal-support-whatsapp" type="url" value={supportWhatsappUrl} onChange={event => edit(setSupportWhatsappUrl, event.target.value)} className={CONTROL} placeholder="https://wa.me/44..." />
              </Field>
            </div>

            <div className="mt-5 grid gap-2 border-t border-black/10 pt-5">
              <button
                type="button"
                onClick={() => void submit(portalBuiltAt ? "save" : "build-portal")}
                disabled={busy !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#1b1a18] px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save size={15} aria-hidden="true" />
                {busy === "save" || busy === "build" ? "Saving..." : portalBuiltAt ? "Save & refresh preview" : "Create & preview portal"}
              </button>
              <button
                type="button"
                onClick={() => void submit("send-access")}
                disabled={busy !== null || !portalBuiltAt || !loginEmail.trim() || dirty}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#91713a]/35 bg-[#f7f1e6] px-4 text-sm font-medium text-[#725724] transition hover:bg-[#f1e7d4] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send size={15} aria-hidden="true" />
                {busy === "send"
                  ? "Preparing access..."
                  : accessStatus === "sent"
                    ? "Resend customer access"
                    : accessStatus === "prepared"
                      ? "Create new one-time link"
                      : "Send customer access"}
              </button>
              {dirty && <p className="text-center text-[11px] text-amber-700">Save changes before sending access.</p>}
            </div>

            <div className="mt-5 border-t border-black/10 pt-5">
              <p className="text-[10px] uppercase tracking-[0.15em] text-black/38">Client decisions</p>
              <p className="mt-2 text-xs leading-5 text-black/48">Send a clear approval request when the work is ready.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["design", "launch"] as const).map(type => {
                  const latest = approvals.find(item => item.type === type);
                  const pending = latest?.status === "pending";
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => void requestApproval(type)}
                      disabled={approvalBusy !== null || pending}
                      className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 disabled:opacity-45"
                    >
                      {pending
                        ? `${type === "design" ? "Direction" : "Delivery"} pending`
                        : `Request ${type === "design" ? "direction" : "delivery"} approval`}
                    </button>
                  );
                })}
              </div>
              {approvals.length > 0 && (
                <ul className="mt-3 grid gap-1.5">
                  {approvals.slice(0, 3).map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-[11px] text-black/48">
                      <span>{item.title}</span>
                      <span className="capitalize">{item.status.replaceAll("-", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {message && (
              <p role="status" className="mt-4 rounded-md border border-black/8 bg-black/[0.025] p-3 text-xs leading-5 text-black/60">
                {message}
              </p>
            )}

            {devAccessUrl && (
              <div className="mt-4 rounded-md border border-[#9b7a3e]/25 bg-[#faf6ee] p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#725724]">
                  <Mail size={14} aria-hidden="true" />
                  Private local test access
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a href={devAccessUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md bg-[#1b1a18] px-3 text-xs font-medium text-white">
                    Open link <ArrowUpRight size={12} />
                  </a>
                  <button type="button" onClick={() => void copyAccessLink()} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-black/10 bg-white px-3 text-xs font-medium">
                    <Copy size={12} /> Copy link
                  </button>
                </div>
              </div>
            )}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function WorkflowStep({
  number,
  label,
  detail,
  done,
}: {
  number: string;
  label: string;
  detail: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3">
      <span className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        done ? "bg-[#1b1a18] text-white" : "bg-black/[0.045] text-black/42",
      ].join(" ")}>
        {done ? <Check size={13} aria-hidden="true" /> : number}
      </span>
      <div>
        <p className="text-xs font-semibold text-black/70">{label}</p>
        <p className="mt-0.5 text-[11px] text-black/40">{detail}</p>
      </div>
    </div>
  );
}

function PreviewButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} preview`}
      className={[
        "inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs transition",
        active ? "bg-white text-black shadow-sm" : "text-black/45 hover:text-black/70",
      ].join(" ")}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      {htmlFor
        ? <label htmlFor={htmlFor} className="text-xs font-medium text-black/55">{label}</label>
        : <p className="text-xs font-medium text-black/55">{label}</p>}
      {children}
    </div>
  );
}
