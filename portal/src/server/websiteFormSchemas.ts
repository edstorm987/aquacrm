import "server-only";

import { getState, mutate } from "./storage";
import { getWebsiteSource, listWebsiteSources, normalizeHost } from "./websiteSources";
import { fetchPublicSiteHtml, SafeFetchError } from "@/lib/server/safeSiteFetch";
import { scanFormSchemasInHtml } from "@/lib/server/integrations/aquaTagDetection";
import type { AquaFormSchema } from "./types";

/**
 * Import forms (plan Phase 2) — read a tagged site's real forms so the enquiry
 * detail card can mirror each form field-for-field, even before a submission
 * arrives. The schemas live on the site's one config record
 * (`websiteSiteConfigs[id].formSchemas`) — the home `WebsiteSiteConfig`'s own
 * comment reserves for them — so a removed site takes them with it (the cleanup
 * in `server/websiteSources` already deletes the whole config record).
 *
 * This module only reads/writes the `formSchemas` fields; a site's injections are
 * left untouched.
 */

export interface FormSchemaImportResult {
  ok: boolean;
  schemas: AquaFormSchema[];
  /** The page actually read (after redirects), for display + provenance. */
  importedFrom?: string;
  /** A plain-English reason the import could not complete, if any. */
  error?: string;
}

/** The imported form schemas for a site, agency-scoped ([] if none / not this agency's). */
export function listSiteFormSchemas(agencyId: string, websiteSourceId: string): AquaFormSchema[] {
  if (!getWebsiteSource(agencyId, websiteSourceId)) return [];
  return getState().websiteSiteConfigs?.[websiteSourceId]?.formSchemas ?? [];
}

/**
 * Fetch a registered site and store its forms' field schemas.
 *
 * SSRF-safe: the fetch goes through `fetchPublicSiteHtml`, the same guarded path
 * the tag-detect step uses (private ranges blocked, redirects re-validated). An
 * unreachable site is a normal result (`ok:false` + reason), never a throw — the
 * caller shows it, it isn't an exception. Existing injections are preserved.
 */
export async function importFormSchemasForSite(
  input: { agencyId: string; websiteSourceId: string },
  // Injected so the store path is testable without a live fetch; production
  // always uses the SSRF-guarded default.
  fetchHtml: typeof fetchPublicSiteHtml = fetchPublicSiteHtml,
): Promise<FormSchemaImportResult> {
  const source = getWebsiteSource(input.agencyId, input.websiteSourceId);
  if (!source) return { ok: false, schemas: [], error: "That website was not found." };

  let page;
  try {
    page = await fetchHtml(`https://${source.host}`);
  } catch (error) {
    if (error instanceof SafeFetchError) return { ok: false, schemas: [], error: error.message };
    throw error;
  }

  const ok = page.statusCode >= 200 && page.statusCode < 400;
  if (!ok) {
    return { ok: false, schemas: [], importedFrom: page.finalUrl, error: `The site answered with HTTP ${page.statusCode}.` };
  }

  const schemas = scanFormSchemasInHtml(page.html);
  mutate(state => {
    state.websiteSiteConfigs ??= {};
    const config = (state.websiteSiteConfigs[input.websiteSourceId] ??= {
      websiteSourceId: input.websiteSourceId,
      agencyId: input.agencyId,
      injections: [],
    });
    config.formSchemas = schemas;
    config.formSchemasImportedAt = Date.now();
    config.formSchemasImportedFrom = page.finalUrl;
  });

  return { ok: true, schemas, importedFrom: page.finalUrl };
}

/**
 * Pick the imported form that best matches an enquiry's form (plan Phase 3).
 *
 * An exact id/label match wins. Failing that, a site with exactly one capturable
 * form has an obvious template; otherwise there is no confident match and the
 * card falls back to the raw submission rather than mirroring the wrong form.
 */
export function matchFormSchema(schemas: AquaFormSchema[], formHint: string | undefined): AquaFormSchema | null {
  const hint = (formHint ?? "").trim().toLowerCase();
  if (hint) {
    const byId = schemas.find(schema => (schema.formId ?? "").toLowerCase() === hint);
    if (byId) return byId;
    const byLabel = schemas.find(schema => schema.label.toLowerCase() === hint);
    if (byLabel) return byLabel;
  }
  const capturable = schemas.filter(schema => schema.capturable);
  return capturable.length === 1 ? capturable[0] : null;
}

/** The imported form template for an enquiry, by its host + form hint, or null. */
export function resolveFormSchemaForEnquiry(agencyId: string, host: string | undefined, formHint: string | undefined): AquaFormSchema | null {
  const normalized = normalizeHost(host ?? "");
  if (!normalized) return null;
  const source = listWebsiteSources(agencyId).find(entry => entry.host === normalized);
  if (!source) return null;
  return matchFormSchema(listSiteFormSchemas(agencyId, source.id), formHint);
}
