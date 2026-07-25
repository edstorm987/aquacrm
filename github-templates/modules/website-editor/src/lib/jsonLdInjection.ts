// R045 — JSON-LD injection for the page `<head>`.
//
// R037 shipped the pure generators (`buildJsonLd`, `validateJsonLd`,
// `serializeJsonLd`). R045 sources Organization data from the
// agency/site, decides what to emit per page, and exposes a
// React-friendly script-tag emitter the storefront `<head>` mounts.
//
// Coverage stays the same as R037 — Article, Product, FAQPage,
// BreadcrumbList, Organization. Recipe / Event / LocalBusiness
// (R+1) and per-locale variants (R+1, depends on R032) remain
// out of scope.

import {
  buildJsonLd,
  serializeJsonLd,
  type JsonLdObject,
  type OrganizationInput,
  type JsonLdPageInput,
} from "./structuredData";
import type { EditorPage } from "../types/editorPage";
import type { Site, SiteSocialHandles } from "../types/site";
import type { BrandKit } from "./tenancy";

// ─── Organization sourcing ───────────────────────────────────────────

export interface JsonLdOrgSource {
  // Operator-stamped agency display name. Required (Organization
  // schema's only required field).
  agencyName: string;
  // Optional — site URL for the page (`https://example.com`).
  baseUrl?: string;
  // Optional — agency brand kit + site social handles. Brand kit
  // logoUrl is preferred, falls back to site logoUrl when both
  // present? No — operators expect site overrides agency, since the
  // site is a tenant of the agency. So site.logoUrl wins.
  brandKit?: BrandKit;
  site?: Site;
}

// Build the Organization payload from the agency + site context.
// Returns `undefined` when there's no usable name (extremely
// defensive — agencies always have a name in practice).
export function deriveOrganization(src: JsonLdOrgSource): OrganizationInput | undefined {
  const name = src.agencyName?.trim();
  if (!name) return undefined;
  const logo = src.site?.logoUrl ?? src.brandKit?.logoUrl;
  const url = src.baseUrl;
  const sameAs = collectSameAs(src.site?.socialHandles);
  const out: OrganizationInput = { name };
  if (url) out.url = url;
  if (logo) out.logo = logo;
  if (sameAs.length) out.sameAs = sameAs;
  return out;
}

const SOCIAL_DOMAINS: Record<keyof SiteSocialHandles, string> = {
  instagram: "https://instagram.com/",
  twitter: "https://twitter.com/",
  tiktok: "https://tiktok.com/@",
};

function collectSameAs(handles?: SiteSocialHandles): string[] {
  if (!handles) return [];
  const out: string[] = [];
  for (const k of Object.keys(SOCIAL_DOMAINS) as Array<keyof SiteSocialHandles>) {
    const handle = handles[k];
    if (typeof handle !== "string" || handle.length === 0) continue;
    // Operator may have pasted a full URL — keep it.
    if (/^https?:\/\//i.test(handle)) {
      out.push(handle);
      continue;
    }
    out.push(SOCIAL_DOMAINS[k] + handle.replace(/^@/, ""));
  }
  return out;
}

// ─── Page emission ───────────────────────────────────────────────────

export interface BuildPageJsonLdOpts {
  agencyName: string;
  baseUrl?: string;
  brandKit?: BrandKit;
  site?: Site;
}

// Returns the JSON-LD objects that should be stamped into the page
// `<head>`. Returns an empty array when:
//   - the block tree carries no matchable schemas AND
//   - no Organization payload could be derived.
// Empty arrays signal the renderer to emit no `<script>` tags.
export function buildPageJsonLd(
  page: EditorPage,
  opts: BuildPageJsonLdOpts,
): JsonLdObject[] {
  const org = deriveOrganization(opts);
  // R037's buildJsonLd insists on org. When we have none, we still
  // run a probe to see if any block-derived schemas exist; if so,
  // emit those alone; if not, emit nothing.
  const blocksInput: JsonLdPageInput = {
    title: page.title,
    blocks: page.blocks ?? [],
  };
  if (org) {
    return buildJsonLd(blocksInput, { org });
  }
  // No org — re-run with a sentinel and strip the Organization entry.
  const probe = buildJsonLd(blocksInput, {
    org: { name: "__probe__" },
  });
  const filtered = probe.filter((o) => o["@type"] !== "Organization");
  return filtered;
}

// Serialize the array into individual `<script type="application/ld+json">`
// payloads. Returns one string per object — callers map to <script>
// elements. Each string is already escape-safe (R037 contract).
export function buildJsonLdScriptBodies(arr: readonly JsonLdObject[]): string[] {
  return arr.map((obj) => serializeJsonLd([obj]).slice(1, -1));
  // ^ wrap+slice removes the outer array brackets so each script
  // emits a single JSON object, not a one-element array. The slicing
  // is safe because serializeJsonLd's escape never produces a leading
  // / trailing `[` / `]` outside the array wrapper.
}

// ─── Diagnostics ─────────────────────────────────────────────────────

export interface JsonLdEmissionDescriptor {
  type: string;          // schema.org @type
  // First-line summary so the diagnostics drawer can render a list:
  //   "Article — How Aqua works"
  //   "Product — Wave Bottle"
  //   "FAQPage — 3 questions"
  //   "BreadcrumbList — 2 items"
  //   "Organization — Milesy Media"
  summary: string;
}

export function describeJsonLdEmission(arr: readonly JsonLdObject[]): JsonLdEmissionDescriptor[] {
  return arr.map((obj) => {
    const type = String(obj["@type"] ?? "?");
    let summary = type;
    switch (type) {
      case "Article": {
        const headline = obj.headline;
        summary = `Article — ${typeof headline === "string" ? headline : "(no headline)"}`;
        break;
      }
      case "Product": {
        const name = obj.name;
        summary = `Product — ${typeof name === "string" ? name : "(no name)"}`;
        break;
      }
      case "FAQPage": {
        const arr = obj.mainEntity;
        const n = Array.isArray(arr) ? arr.length : 0;
        summary = `FAQPage — ${n} question${n === 1 ? "" : "s"}`;
        break;
      }
      case "BreadcrumbList": {
        const arr = obj.itemListElement;
        const n = Array.isArray(arr) ? arr.length : 0;
        summary = `BreadcrumbList — ${n} item${n === 1 ? "" : "s"}`;
        break;
      }
      case "Organization": {
        const name = obj.name;
        summary = `Organization — ${typeof name === "string" ? name : "(no name)"}`;
        break;
      }
      default:
        summary = type;
    }
    return { type, summary };
  });
}
