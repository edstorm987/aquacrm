// Portal-variant operations.
//
// `applyStarterVariant` is the public contract T2's fulfillment plugin
// calls during phase transitions. It loads a JSON starter tree from
// `src/starters/<variantId>.json`, creates a new EditorPage scoped to
// (agencyId, clientId, siteId, role), flags it as the active variant for
// that role, and returns the new ID triple.
//
// The function is fail-safe: catches and returns `{ ok: false, error }`
// rather than throwing, so a failed variant apply doesn't break a phase
// transition.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type { PortalRole } from "../lib/portalRole";
import type { EditorPage } from "../types/editorPage";
import type { Block } from "../types/block";
import { portalRoleLabel } from "../lib/portalRole";
import { variantId as makeVariantRunId } from "../lib/ids";
import { createPage, listVariantsForPortal, getActivePortalVariant, setActivePortalVariant } from "./pages";
import { getOrCreateDefaultSite } from "./sites";
import { loadStarterTree, type StarterTreeFile } from "./starterLoader";

export interface ApplyStarterVariantInput {
  agencyId: AgencyId;
  clientId: ClientId;
  role: PortalRole;
  variantId: string;
  actor?: UserId;
}

export type ApplyStarterVariantResult =
  | { ok: true; variantId: string; pageId: string; siteId: string }
  | { ok: false; error: string };

export async function applyStarterVariant(
  input: ApplyStarterVariantInput,
  storage: PluginStorage,
): Promise<ApplyStarterVariantResult> {
  try {
    const starter: StarterTreeFile | null = await loadStarterTree(input.variantId);
    if (!starter) {
      return { ok: false, error: `unknown variantId: ${input.variantId}` };
    }
    if (starter.role && starter.role !== input.role) {
      return {
        ok: false,
        error: `variantId ${input.variantId} is for role ${starter.role}, called with ${input.role}`,
      };
    }

    const site = await getOrCreateDefaultSite(
      storage,
      input.agencyId,
      input.clientId,
      input.clientId,
    );

    const blocks: Block[] = starter.blocks ?? [];
    const title = starter.title ?? `${portalRoleLabel(input.role)} portal`;
    const slug = `_portal-${input.role}-${makeVariantRunId().slice(0, 6)}`;

    const page = await createPage(storage, {
      siteId: site.id,
      agencyId: input.agencyId,
      clientId: input.clientId,
      title,
      slug,
      blocks,
      portalRole: input.role,
      isActivePortal: false, // setActivePortalVariant flips this atomically
      variantId: input.variantId,
    });

    const flipped = await setActivePortalVariant(
      storage,
      input.agencyId,
      input.clientId,
      site.id,
      input.role,
      page.id,
    );
    if (!flipped) {
      return { ok: false, error: `failed to set active variant for ${input.role}` };
    }

    // Aqua Incubator template (chapter §15e) seeds 4 sibling sub-pages
    // alongside the root so cardGrid relative hrefs resolve. Done here
    // (rather than in the caller) so any future `siblingPages` starter
    // shape can plug in the same place.
    if (input.variantId === "aqua-incubator") {
      const { AQUA_INCUBATOR_TEMPLATE_IDS, getTemplate } = await import("../components/pageTemplates");
      for (const id of AQUA_INCUBATOR_TEMPLATE_IDS) {
        if (id === "aqua-incubator") continue;
        const tpl = getTemplate(id);
        if (!tpl) continue;
        await createPage(storage, {
          siteId: site.id,
          agencyId: input.agencyId,
          clientId: input.clientId,
          title: tpl.defaultTitle,
          slug: tpl.defaultSlug,
          blocks: tpl.build(),
          portalRole: input.role,
          isActivePortal: false,
          variantId: id,
        });
      }
    }

    // Brand-page pack (R004) — root page is About; seed the other 6
    // brand-page presets as siblings on the same site so the operator
    // gets a complete therapist storefront in one click.
    if (input.variantId === "brand-page-pack") {
      const { BRAND_PAGE_TEMPLATE_IDS, getTemplate } = await import("../components/pageTemplates");
      for (const id of BRAND_PAGE_TEMPLATE_IDS) {
        if (id === "brand-about") continue;
        const tpl = getTemplate(id);
        if (!tpl) continue;
        await createPage(storage, {
          siteId: site.id,
          agencyId: input.agencyId,
          clientId: input.clientId,
          title: tpl.defaultTitle,
          slug: tpl.defaultSlug,
          blocks: tpl.build(),
          portalRole: input.role,
          isActivePortal: false,
          variantId: id,
        });
      }
    }

    return { ok: true, variantId: input.variantId, pageId: page.id, siteId: site.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

// Re-export the helpers from `pages.ts` so consumers can import the full
// portal-variant surface from a single module.
export {
  listVariantsForPortal,
  getActivePortalVariant,
  setActivePortalVariant,
};

// R012 — Editor variant gallery summary across all roles.
//
// Returns a flat list of `{ role, pageId, variantId, title, slug,
// isActive, status, updatedAt }` records — one per `EditorPage` in
// the site that has a `portalRole`. Sorted active-first within each
// role group, then by `updatedAt` desc.

import { PORTAL_ROLES } from "../lib/portalRole";

export interface PortalVariantSummary {
  role: PortalRole;
  pageId: string;
  variantId?: string;
  title: string;
  slug: string;
  isActive: boolean;
  status: "draft" | "live";
  updatedAt: number;
}

export async function listAllPortalVariants(
  storage: PluginStorage,
  agencyId: AgencyId,
  clientId: ClientId,
  siteId: string,
): Promise<PortalVariantSummary[]> {
  const out: PortalVariantSummary[] = [];
  for (const role of PORTAL_ROLES) {
    const variants = await listVariantsForPortal(storage, agencyId, clientId, siteId, role);
    for (const v of variants) {
      out.push({
        role,
        pageId: v.id,
        ...(v.variantId ? { variantId: v.variantId } : {}),
        title: v.title,
        slug: v.slug,
        isActive: Boolean(v.isActivePortal),
        status: v.isActivePortal ? "live" : "draft",
        updatedAt: v.updatedAt,
      });
    }
  }
  return out.sort((a, b) => {
    if (a.role !== b.role) {
      return PORTAL_ROLES.indexOf(a.role) - PORTAL_ROLES.indexOf(b.role);
    }
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}
