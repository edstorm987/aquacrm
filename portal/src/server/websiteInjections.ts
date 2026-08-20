import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import { getWebsiteSource, listWebsiteSources, normalizeHost } from "./websiteSources";
import type { AquaConsentCategory, AquaInjection, AquaInjectionKind, WebsiteSiteConfig } from "./types";

/**
 * The Aqua Tag as a consent-aware tag manager — the config side.
 *
 * A site (a `websiteSource`) can be told to inject third-party tools *through*
 * the tag, each held until its consent category is granted. v1 is a curated
 * allow-list configured **by id/key only, never a raw `<script>`** (Ed's
 * resolved security decision) — so there is no XSS surface, and the ~90% of
 * tools people paste in by hand (GA4, GTM, PostHog, pixels, Search Console) are
 * covered.
 *
 * This module owns the config + validation. Delivery (a cached public endpoint
 * the tag fetches) and the injection itself (in `lib/aquaTagSource`) are the
 * next slices — `listEnabledInjectionsForHost` is what that endpoint will serve.
 */

interface InjectionProvider {
  kind: AquaInjectionKind;
  label: string;
  /** What the operator pastes — shown in the workspace. */
  valueLabel: string;
  /** Strict on purpose: the value becomes part of the markup the tag injects. */
  valuePattern: RegExp;
  /** The consent bucket this tool waits for unless the operator overrides it. */
  defaultConsentCategory: AquaConsentCategory;
}

/**
 * The allow-list. Adding a provider is one entry here — there is deliberately no
 * raw-snippet path. Patterns are the real security guard: a value that isn't a
 * clean provider id/key never reaches the injected markup.
 */
export const INJECTION_PROVIDERS: readonly InjectionProvider[] = [
  { kind: "ga4",              label: "Google Analytics 4",    valueLabel: "Measurement ID (G-…)",    valuePattern: /^G-[A-Z0-9]{4,20}$/i,     defaultConsentCategory: "analytics" },
  { kind: "gtm",              label: "Google Tag Manager",    valueLabel: "Container ID (GTM-…)",     valuePattern: /^GTM-[A-Z0-9]{4,20}$/i,    defaultConsentCategory: "analytics" },
  { kind: "posthog",          label: "PostHog",               valueLabel: "Project API key (phc_…)",  valuePattern: /^phc_[A-Za-z0-9]{16,64}$/, defaultConsentCategory: "analytics" },
  { kind: "meta-pixel",       label: "Meta Pixel",            valueLabel: "Pixel ID",                 valuePattern: /^[0-9]{6,20}$/,            defaultConsentCategory: "marketing" },
  { kind: "google-ads",       label: "Google Ads",            valueLabel: "Conversion ID (AW-…)",     valuePattern: /^AW-[0-9]{6,20}$/i,        defaultConsentCategory: "marketing" },
  { kind: "linkedin",         label: "LinkedIn Insight",      valueLabel: "Partner ID",               valuePattern: /^[0-9]{4,15}$/,            defaultConsentCategory: "marketing" },
  { kind: "gsc-verification", label: "Google Search Console", valueLabel: "Verification token",       valuePattern: /^[A-Za-z0-9_-]{10,100}$/,  defaultConsentCategory: "necessary" },
];

const PROVIDER_BY_KIND = new Map(INJECTION_PROVIDERS.map(provider => [provider.kind, provider]));
const CONSENT_CATEGORIES: readonly AquaConsentCategory[] = ["necessary", "preferences", "analytics", "marketing"];
const MAX_PER_SITE = 25;

export function injectionProvider(kind: string): InjectionProvider | undefined {
  return PROVIDER_BY_KIND.get(kind as AquaInjectionKind);
}

function configFor(websiteSourceId: string): WebsiteSiteConfig | undefined {
  return getState().websiteSiteConfigs?.[websiteSourceId];
}

/** The config record for a site (agency-scoped), or null if the site isn't this agency's. */
export function getSiteConfig(agencyId: string, websiteSourceId: string): WebsiteSiteConfig | null {
  if (!getWebsiteSource(agencyId, websiteSourceId)) return null;
  return configFor(websiteSourceId) ?? { websiteSourceId, agencyId, injections: [] };
}

export function listInjections(agencyId: string, websiteSourceId: string): AquaInjection[] {
  return getSiteConfig(agencyId, websiteSourceId)?.injections ?? [];
}

export function addInjection(input: {
  agencyId: string;
  websiteSourceId: string;
  kind: string;
  value: string;
  consentCategory?: string;
  label?: string;
}): AquaInjection {
  // Everything is validated before we mutate, so a bad request never half-lands.
  if (!getWebsiteSource(input.agencyId, input.websiteSourceId)) throw new Error("That website was not found.");
  const provider = injectionProvider(input.kind);
  if (!provider) throw new Error("That tool is not on the supported list.");
  const value = (input.value ?? "").trim();
  if (!provider.valuePattern.test(value)) throw new Error(`Enter a valid ${provider.label} ${provider.valueLabel}.`);
  // Omitted → the provider's default; provided-but-unknown is an error, never
  // silently defaulted.
  let consentCategory = provider.defaultConsentCategory;
  if (input.consentCategory !== undefined) {
    const normalized = normalizeConsent(input.consentCategory);
    if (!normalized) throw new Error("Unknown consent category.");
    consentCategory = normalized;
  }
  const existing = configFor(input.websiteSourceId)?.injections ?? [];
  if (existing.length >= MAX_PER_SITE) throw new Error("This site already has the maximum number of tools.");
  if (existing.some(injection => injection.kind === provider.kind && injection.value.toLowerCase() === value.toLowerCase())) {
    throw new Error(`${provider.label} ${value} is already on this site.`);
  }
  const injection: AquaInjection = {
    id: `inj_${crypto.randomBytes(8).toString("hex")}`,
    kind: provider.kind,
    value,
    consentCategory,
    enabled: true,
    label: (input.label ?? "").trim().slice(0, 80) || undefined,
    createdAt: Date.now(),
  };
  mutate(state => {
    state.websiteSiteConfigs ??= {};
    const config = (state.websiteSiteConfigs[input.websiteSourceId] ??= {
      websiteSourceId: input.websiteSourceId,
      agencyId: input.agencyId,
      injections: [],
    });
    config.injections.push(injection);
  });
  return injection;
}

export function updateInjection(input: {
  agencyId: string;
  websiteSourceId: string;
  injectionId: string;
  enabled?: boolean;
  consentCategory?: string;
  value?: string;
  label?: string;
}): AquaInjection | null {
  if (!getWebsiteSource(input.agencyId, input.websiteSourceId)) return null;
  const current = configFor(input.websiteSourceId)?.injections.find(injection => injection.id === input.injectionId);
  if (!current) return null;
  // Validate up front — never throw mid-mutation.
  let category: AquaConsentCategory | undefined;
  if (input.consentCategory !== undefined) {
    category = normalizeConsent(input.consentCategory);
    if (!category) throw new Error("Unknown consent category.");
  }
  let value: string | undefined;
  if (input.value !== undefined) {
    const provider = injectionProvider(current.kind)!;
    value = input.value.trim();
    if (!provider.valuePattern.test(value)) throw new Error(`Enter a valid ${provider.label} ${provider.valueLabel}.`);
  }
  let saved: AquaInjection | null = null;
  mutate(state => {
    const injection = state.websiteSiteConfigs?.[input.websiteSourceId]?.injections.find(entry => entry.id === input.injectionId);
    if (!injection) return;
    if (typeof input.enabled === "boolean") injection.enabled = input.enabled;
    if (category) injection.consentCategory = category;
    if (value !== undefined) injection.value = value;
    if (typeof input.label === "string") injection.label = input.label.trim().slice(0, 80) || undefined;
    saved = injection;
  });
  return saved;
}

export function removeInjection(agencyId: string, websiteSourceId: string, injectionId: string): boolean {
  if (!getWebsiteSource(agencyId, websiteSourceId)) return false;
  let removed = false;
  mutate(state => {
    const config = state.websiteSiteConfigs?.[websiteSourceId];
    if (!config) return;
    const before = config.injections.length;
    config.injections = config.injections.filter(injection => injection.id !== injectionId);
    removed = config.injections.length < before;
  });
  return removed;
}

/**
 * The enabled injections for a host — what the delivery endpoint will serve to
 * the tag. Resolves the host to this agency's registered site; an unregistered
 * or unconfigured host yields none, and disabled injections are withheld.
 */
export function listEnabledInjectionsForHost(agencyId: string, host: string | undefined): AquaInjection[] {
  const normalized = normalizeHost(host ?? "");
  if (!normalized) return [];
  const site = listWebsiteSources(agencyId).find(source => source.host === normalized);
  if (!site) return [];
  return (configFor(site.id)?.injections ?? []).filter(injection => injection.enabled);
}

function normalizeConsent(value: string | undefined): AquaConsentCategory | undefined {
  return CONSENT_CATEGORIES.find(category => category === value);
}
