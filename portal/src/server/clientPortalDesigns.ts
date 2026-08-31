import "server-only";

import crypto from "node:crypto";
import {
  CLIENT_PORTAL_MODES,
  CLIENT_PORTAL_TEMPLATE_ID,
  CLIENT_PORTAL_TEMPLATE_NAME,
  clonePortalDesign,
  normalisePortalDesign,
  STUNNING_STANDARD_PORTAL,
} from "@/lib/portal/clientPortalDesign";
import { PORTAL_PRODUCT_CATALOG, portalProductSelectionFromAgencyProduct } from "@/lib/portal/portalProducts";
import { portalProductLifecycle } from "@/lib/portal/portalProductModules";
import { getState, mutate } from "./storage";
import {
  applyClientPortalTemplateUpdate,
  describeTemplateUpdate,
  planClientPortalTemplateUpdate,
  type PortalTemplateUpdatePlan,
} from "@/server/clientPortalTemplateUpdate";
import type {
  AgencyProduct,
  ClientPortalDesignDocument,
  ClientPortalDesignVersion,
  ClientPortalInstanceRecord,
  ClientPortalTemplateRecord,
} from "./types";

const AUTO_VERSION_CAP = 30;
const PRODUCT_LIFECYCLE_SEED_VERSION = 3;

export type ClientPortalDesignScope = "template" | "client";
export type ClientPortalDesignRecord = ClientPortalTemplateRecord | ClientPortalInstanceRecord;

export function portalTemplateRecordId(agencyId: string, slug = CLIENT_PORTAL_TEMPLATE_ID): string {
  return `${agencyId}:${slug}`;
}

export function productPortalTemplateRecordId(agencyId: string, productId: string): string {
  return portalTemplateRecordId(agencyId, `${CLIENT_PORTAL_TEMPLATE_ID}-product-${productId}`);
}

export function portalInstanceRecordId(agencyId: string, clientId: string): string {
  return `${agencyId}:${clientId}`;
}

export function ensureStunningPortalTemplate(agencyId: string, actorUserId = "system"): ClientPortalTemplateRecord {
  const id = portalTemplateRecordId(agencyId);
  const existing = getState().clientPortalTemplates[id];
  if (existing) return existing;
  const now = Date.now();
  const document = clonePortalDesign();
  const initialVersion = makeVersion(document, actorUserId, "publish", "Stunning Standard v1", now);
  const created: ClientPortalTemplateRecord = {
    id,
    agencyId,
    name: CLIENT_PORTAL_TEMPLATE_NAME,
    slug: CLIENT_PORTAL_TEMPLATE_ID,
    draft: clonePortalDesign(document),
    published: clonePortalDesign(document),
    publishedVersionId: initialVersion.id,
    versions: [initialVersion],
    createdBy: actorUserId,
    updatedBy: actorUserId,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };
  mutate(state => { state.clientPortalTemplates[id] = created; });
  return created;
}

function productPortalTemplateName(product: AgencyProduct): string {
  return `${product.name} · ${CLIENT_PORTAL_TEMPLATE_NAME}`;
}

/** The record a first touch WOULD create — built, not stored. */
function buildProductPortalTemplate(
  agencyId: string,
  master: ClientPortalTemplateRecord,
  product: AgencyProduct,
  actorUserId: string,
  now: number,
): ClientPortalTemplateRecord {
  const id = productPortalTemplateRecordId(agencyId, product.id);
  const document = productPortalDocument(master.published, product);
  const initialVersion = makeVersion(
    document,
    actorUserId,
    "publish",
    `Created from ${CLIENT_PORTAL_TEMPLATE_NAME}`,
    now,
    productTemplateVersionId(id, "seed"),
  );
  return {
    id,
    agencyId,
    name: productPortalTemplateName(product),
    slug: `${CLIENT_PORTAL_TEMPLATE_ID}-product-${product.id}`,
    productId: product.id,
    baseTemplateId: master.id,
    baseTemplateVersionId: master.publishedVersionId,
    productLifecycleSeedVersion: PRODUCT_LIFECYCLE_SEED_VERSION,
    draftProductSourceUpdatedAt: product.updatedAt,
    productSourceUpdatedAt: product.updatedAt,
    draft: clonePortalDesign(document),
    published: clonePortalDesign(document),
    publishedVersionId: initialVersion.id,
    versions: [initialVersion],
    createdBy: actorUserId,
    updatedBy: actorUserId,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };
}

export function ensureProductPortalTemplate(
  agencyId: string,
  product: AgencyProduct,
  actorUserId = "system",
): ClientPortalTemplateRecord {
  if (product.agencyId !== agencyId) throw new Error("Product does not belong to this agency.");
  const id = productPortalTemplateRecordId(agencyId, product.id);
  const existing = getState().clientPortalTemplates[id];
  if (existing) {
    const upgraded = upgradedProductPortalTemplate(existing, product, actorUserId, Date.now());
    if (upgraded !== existing) mutate(state => { state.clientPortalTemplates[id] = upgraded; });
    return upgraded;
  }

  const master = ensureStunningPortalTemplate(agencyId, actorUserId);
  const created = buildProductPortalTemplate(agencyId, master, product, actorUserId, Date.now());
  mutate(state => { state.clientPortalTemplates[id] = created; });
  return created;
}

/**
 * A product's portal template as a READ sees it — repaired in memory, nothing
 * stored (issue #21).
 *
 * `ensureProductPortalTemplate` is the WRITE, and it belongs to the surfaces
 * that provision a product: creating or editing one (`/api/portal/products`),
 * rolling one out (`/api/portal/products/rollout`), building a client's portal
 * (`clientPortalSetup`) and the customer-portal control route. Rendering a
 * screen is none of those, so every render now asks this instead — exactly the
 * split `agencyProductsForRead` / `ensureDefaultAgencyProducts` already draws
 * for the catalogue.
 *
 * Because the ids are deterministic, an unsaved template is not a *different*
 * template: the first real write persists it under the same record id and the
 * same seed-version id the read handed out.
 */
export function productPortalTemplateForRead(
  agencyId: string,
  product: AgencyProduct,
): ClientPortalTemplateRecord {
  if (product.agencyId !== agencyId) throw new Error("Product does not belong to this agency.");
  const id = productPortalTemplateRecordId(agencyId, product.id);
  const existing = getState().clientPortalTemplates[id];
  // A read must be stable: the same product read twice must give the same
  // record, so the upgrade is stamped with the record's OWN updatedAt rather
  // than "now".
  if (existing) return upgradedProductPortalTemplate(existing, product, existing.updatedBy || "system", existing.updatedAt);
  // `getClientPortalTemplate` already answers with an unsaved Stunning Standard
  // when the agency has never saved one, so the master is read-only too.
  const master = getClientPortalTemplate(agencyId) ?? virtualStunningTemplate(agencyId);
  return buildProductPortalTemplate(agencyId, master, product, "system", product.updatedAt);
}

export function ensureProductPortalTemplates(
  agencyId: string,
  products: AgencyProduct[],
  actorUserId = "system",
): ClientPortalTemplateRecord[] {
  return products
    .filter(product => product.portalRequirement !== "none")
    .map(product => ensureProductPortalTemplate(agencyId, product, actorUserId));
}

/** `ensureProductPortalTemplates` for a read: same list, no writes. */
export function productPortalTemplatesForRead(
  agencyId: string,
  products: AgencyProduct[],
): ClientPortalTemplateRecord[] {
  return products
    .filter(product => product.portalRequirement !== "none")
    .map(product => productPortalTemplateForRead(agencyId, product));
}

export function listClientPortalTemplates(agencyId: string): ClientPortalTemplateRecord[] {
  const records = Object.values(getState().clientPortalTemplates)
    .filter(item => item.agencyId === agencyId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return records.some(record => record.id === portalTemplateRecordId(agencyId))
    ? records
    : [virtualStunningTemplate(agencyId), ...records];
}

/**
 * The product a product-template id belongs to, or null.
 *
 * The id is `<agencyId>:<CLIENT_PORTAL_TEMPLATE_ID>-product-<productId>` — see
 * `productPortalTemplateRecordId`, which is the only thing that mints one.
 */
function productForProductTemplateId(agencyId: string, recordId: string): AgencyProduct | null {
  const prefix = `${portalTemplateRecordId(agencyId, CLIENT_PORTAL_TEMPLATE_ID)}-product-`;
  if (!recordId.startsWith(prefix)) return null;
  const productId = recordId.slice(prefix.length);
  if (!productId) return null;
  const product = getState().agencyProducts[productId];
  if (!product || product.agencyId !== agencyId || product.portalRequirement === "none") return null;
  return product;
}

export function getClientPortalTemplate(agencyId: string, templateId?: string): ClientPortalTemplateRecord | null {
  const id = templateId && templateId.includes(":") ? templateId : portalTemplateRecordId(agencyId, templateId || CLIENT_PORTAL_TEMPLATE_ID);
  const record = getState().clientPortalTemplates[id];
  if (record?.agencyId === agencyId) return record;
  if (id === portalTemplateRecordId(agencyId)) return virtualStunningTemplate(agencyId);
  // A product's template is unsaved until something WRITES it (issue #21,
  // 2026-08-31) — the renders that used to seed it now only read. Answer with
  // the same unsaved record those renders show, or a caller asking for a
  // product template by id silently falls back to the agency MASTER and edits
  // the wrong record.
  const product = productForProductTemplateId(agencyId, id);
  return product ? productPortalTemplateForRead(agencyId, product) : null;
}

export function ensureClientPortalInstance(input: {
  agencyId: string;
  clientId: string;
  actorUserId?: string;
  accentColor?: string;
  templateId?: string;
}): ClientPortalInstanceRecord {
  const id = portalInstanceRecordId(input.agencyId, input.clientId);
  const existing = getState().clientPortalInstances[id];
  if (existing) return existing;
  const actor = input.actorUserId || "system";
  const master = ensureStunningPortalTemplate(input.agencyId, actor);
  const template = input.templateId
    ? getClientPortalTemplate(input.agencyId, input.templateId) ?? master
    : master;
  const base = clonePortalDesign(template.published);
  if (input.accentColor && /^#[0-9a-f]{6}$/i.test(input.accentColor)) base.theme.accentColor = input.accentColor.toLowerCase();
  const now = Date.now();
  const version = makeVersion(base, actor, "publish", `Created from ${template.name}`, now);
  const created: ClientPortalInstanceRecord = {
    id,
    agencyId: input.agencyId,
    clientId: input.clientId,
    templateId: template.id,
    templateVersionId: template.publishedVersionId,
    draft: clonePortalDesign(base),
    published: clonePortalDesign(base),
    publishedVersionId: version.id,
    versions: [version],
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };
  mutate(state => { state.clientPortalInstances[id] = created; });
  return created;
}

export function getClientPortalInstance(agencyId: string, clientId: string): ClientPortalInstanceRecord | null {
  const record = getState().clientPortalInstances[portalInstanceRecordId(agencyId, clientId)];
  return record?.agencyId === agencyId && record.clientId === clientId ? record : null;
}

export function resolveClientPortalDesign(input: {
  agencyId: string;
  clientId: string;
  scope?: ClientPortalDesignScope;
  templateId?: string;
  draft?: boolean;
  fallbackAccentColor?: string;
}): ClientPortalDesignDocument {
  if (input.scope === "template") {
    const template = getClientPortalTemplate(input.agencyId, input.templateId);
    return clonePortalDesign(input.draft ? template?.draft : template?.published);
  }
  const instance = getClientPortalInstance(input.agencyId, input.clientId);
  if (instance) return clonePortalDesign(input.draft ? instance.draft : instance.published);
  const template = getClientPortalTemplate(input.agencyId, input.templateId);
  const document = clonePortalDesign(input.draft ? template?.draft : template?.published);
  if (input.fallbackAccentColor && /^#[0-9a-f]{6}$/i.test(input.fallbackAccentColor)) {
    document.theme.accentColor = input.fallbackAccentColor.toLowerCase();
  }
  return document;
}

export function getPortalDesignRecord(input: {
  agencyId: string;
  scope: ClientPortalDesignScope;
  recordId?: string;
  clientId?: string;
  actorUserId?: string;
  accentColor?: string;
  templateId?: string;
}): ClientPortalDesignRecord | null {
  if (input.scope === "template") {
    const master = ensureStunningPortalTemplate(input.agencyId, input.actorUserId);
    return input.templateId ? getClientPortalTemplate(input.agencyId, input.templateId) ?? master : master;
  }
  if (!input.clientId) return null;
  return ensureClientPortalInstance({
    agencyId: input.agencyId,
    clientId: input.clientId,
    actorUserId: input.actorUserId,
    accentColor: input.accentColor,
    templateId: input.templateId,
  });
}

export function savePortalDesignDraft(input: {
  agencyId: string;
  scope: ClientPortalDesignScope;
  recordId: string;
  document: unknown;
  actorUserId: string;
}): ClientPortalDesignRecord | null {
  const existing = findRecord(input.agencyId, input.scope, input.recordId);
  if (!existing) return null;
  const now = Date.now();
  const document = normalisePortalDesign(input.document, existing.draft);
  const version = makeVersion(document, input.actorUserId, "autosave", undefined, now);
  const updated = {
    ...existing,
    draft: document,
    versions: pruneVersions([version, ...existing.versions]),
    updatedBy: input.actorUserId,
    updatedAt: now,
  };
  writeRecord(input.scope, updated);
  return updated;
}

export function publishPortalDesign(input: {
  agencyId: string;
  scope: ClientPortalDesignScope;
  recordId: string;
  actorUserId: string;
  label?: string;
}): ClientPortalDesignRecord | null {
  const existing = findRecord(input.agencyId, input.scope, input.recordId);
  if (!existing) return null;
  const now = Date.now();
  const document = clonePortalDesign(existing.draft);
  const version = makeVersion(document, input.actorUserId, "publish", input.label || `Published ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(now)}`, now);
  const updated = {
    ...existing,
    published: document,
    publishedVersionId: version.id,
    versions: pruneVersions([version, ...existing.versions]),
    updatedBy: input.actorUserId,
    updatedAt: now,
    publishedAt: now,
    ...(input.scope === "template" && "productId" in existing && existing.productId
      ? { productSourceUpdatedAt: existing.draftProductSourceUpdatedAt ?? existing.productSourceUpdatedAt }
      : {}),
  };
  writeRecord(input.scope, updated);
  return updated;
}

export function checkpointPortalDesign(input: {
  agencyId: string;
  scope: ClientPortalDesignScope;
  recordId: string;
  actorUserId: string;
  label: string;
}): ClientPortalDesignRecord | null {
  const existing = findRecord(input.agencyId, input.scope, input.recordId);
  const label = input.label.trim().slice(0, 100);
  if (!existing || !label) return null;
  const now = Date.now();
  const version = makeVersion(existing.draft, input.actorUserId, "checkpoint", label, now);
  const updated = {
    ...existing,
    versions: pruneVersions([version, ...existing.versions]),
    updatedBy: input.actorUserId,
    updatedAt: now,
  };
  writeRecord(input.scope, updated);
  return updated;
}

export function restorePortalDesignVersion(input: {
  agencyId: string;
  scope: ClientPortalDesignScope;
  recordId: string;
  versionId: string;
  actorUserId: string;
}): ClientPortalDesignRecord | null {
  const existing = findRecord(input.agencyId, input.scope, input.recordId);
  const chosen = existing?.versions.find(item => item.id === input.versionId);
  if (!existing || !chosen) return null;
  const now = Date.now();
  const document = clonePortalDesign(chosen.document);
  const version = makeVersion(document, input.actorUserId, "restore", `Restored ${chosen.label || "saved version"}`, now);
  const updated = {
    ...existing,
    draft: document,
    versions: pruneVersions([version, ...existing.versions]),
    updatedBy: input.actorUserId,
    updatedAt: now,
  };
  writeRecord(input.scope, updated);
  return updated;
}

export function refreshProductPortalTemplateFromMaster(input: {
  agencyId: string;
  templateId: string;
  actorUserId: string;
}): ClientPortalTemplateRecord | null {
  const template = getClientPortalTemplate(input.agencyId, input.templateId);
  const product = template?.productId ? getState().agencyProducts[template.productId] : null;
  if (!template?.productId || !product || product.agencyId !== input.agencyId) return null;

  const master = ensureStunningPortalTemplate(input.agencyId, input.actorUserId);
  const now = Date.now();
  const previousDraft = makeVersion(
    template.draft,
    input.actorUserId,
    "checkpoint",
    "Before master refresh",
    now,
  );
  const updated: ClientPortalTemplateRecord = {
    ...template,
    baseTemplateId: master.id,
    baseTemplateVersionId: master.publishedVersionId,
    draftProductSourceUpdatedAt: product.updatedAt,
    draft: productPortalDocument(master.published, product),
    versions: pruneVersions([previousDraft, ...template.versions]),
    updatedBy: input.actorUserId,
    updatedAt: now,
  };
  mutate(state => { state.clientPortalTemplates[updated.id] = updated; });
  return updated;
}

export function resetClientPortalFromTemplate(input: {
  agencyId: string;
  clientId: string;
  actorUserId: string;
}): ClientPortalInstanceRecord | null {
  const instance = getClientPortalInstance(input.agencyId, input.clientId);
  const template = getClientPortalTemplate(input.agencyId, instance?.templateId);
  if (!instance || !template) return null;
  const now = Date.now();
  const document = clonePortalDesign(template.published);
  const version = makeVersion(document, input.actorUserId, "restore", `Reset from ${template.name}`, now);
  const updated: ClientPortalInstanceRecord = {
    ...instance,
    templateVersionId: template.publishedVersionId,
    draft: document,
    versions: pruneVersions([version, ...instance.versions]),
    updatedBy: input.actorUserId,
    updatedAt: now,
  };
  mutate(state => { state.clientPortalInstances[updated.id] = updated; });
  return updated;
}

/**
 * Offer this client its template's changes — the read half of the Update button.
 *
 * Returns null when there is no instance or template to compare, so a caller can
 * say "nothing to offer" rather than inventing an empty plan.
 */
export function planClientPortalUpdate(input: {
  agencyId: string;
  clientId: string;
}): PortalTemplateUpdatePlan | null {
  const instance = getClientPortalInstance(input.agencyId, input.clientId);
  const template = getClientPortalTemplate(input.agencyId, instance?.templateId);
  if (!instance || !template) return null;
  return planClientPortalTemplateUpdate({ template, instance });
}

export interface ClientPortalUpdateOffer {
  clientId: string;
  templateId: string;
  templateName: string;
  /** The version this client's portal is based on. */
  versionId: string;
  onCurrentVersion: boolean;
  changeCount: number;
  conflictCount: number;
  /** Whether the seeded version is still in history; false means every change needs a decision. */
  baseKnown: boolean;
  /** The one line to show beside the client's name. */
  summary: string;
}

/**
 * What every client with a portal would be offered right now.
 *
 * For the Fulfilment list: who is on which version, and what each would
 * receive. Read-only — computing an offer never changes anything, so this is
 * safe to call while rendering.
 *
 * Cost note: one document diff per client. Portal design documents are small
 * and this is an agency-sized list, but if an agency ever carries thousands of
 * clients this is the call to make lazy.
 */
export function listClientPortalUpdateOffers(agencyId: string): ClientPortalUpdateOffer[] {
  const templates = new Map(listClientPortalTemplates(agencyId).map(template => [template.id, template]));
  return Object.values(getState().clientPortalInstances)
    .filter(instance => instance.agencyId === agencyId)
    .map(instance => {
      const template = templates.get(instance.templateId);
      if (!template) return null;
      const plan = planClientPortalTemplateUpdate({ template, instance });
      return {
        clientId: instance.clientId,
        templateId: template.id,
        templateName: template.name,
        versionId: instance.templateVersionId,
        onCurrentVersion: plan.upToDate,
        changeCount: plan.changes.length,
        conflictCount: plan.conflicts.length,
        baseKnown: plan.baseKnown,
        summary: describeTemplateUpdate(plan),
      } satisfies ClientPortalUpdateOffer;
    })
    .filter((offer): offer is ClientPortalUpdateOffer => offer !== null);
}

export interface AppliedClientPortalUpdate {
  instance: ClientPortalInstanceRecord;
  plan: PortalTemplateUpdatePlan;
  accepted: string[];
  declined: string[];
  /** Whether the instance is now based on the template's current version. */
  versionPinAdvanced: boolean;
}

/**
 * Apply the accepted subset of a template update to ONE client's portal.
 *
 * Deliberately writes the DRAFT, never the live published portal: an update is
 * reviewed and then published like every other change here. The version pin
 * advances whenever anything was accepted, because a declined change is a
 * resolution — see the semantics note in `clientPortalTemplateUpdate.ts`.
 *
 * This is the safe counterpart to `resetClientPortalFromTemplate`, which
 * overwrites the whole instance and discards client edits without asking.
 */
export function applyClientPortalUpdate(input: {
  agencyId: string;
  clientId: string;
  accept: readonly string[];
  actorUserId: string;
}): AppliedClientPortalUpdate | null {
  const instance = getClientPortalInstance(input.agencyId, input.clientId);
  const template = getClientPortalTemplate(input.agencyId, instance?.templateId);
  if (!instance || !template) return null;

  const plan = planClientPortalTemplateUpdate({ template, instance });
  const merged = applyClientPortalTemplateUpdate({
    plan,
    current: instance.published,
    accept: input.accept,
  });

  const now = Date.now();
  const label = merged.fullyApplied
    ? `Updated from ${template.name}`
    : `Updated from ${template.name} (${merged.accepted.length} of ${plan.changes.length})`;
  const version = makeVersion(merged.document, input.actorUserId, "restore", label, now);
  const updated: ClientPortalInstanceRecord = {
    ...instance,
    // Only move the pin when a decision was actually made. Declining everything
    // leaves this client legacy on purpose, and the offer stands next time.
    templateVersionId: merged.advanceVersionPin ? plan.toVersionId : instance.templateVersionId,
    draft: merged.document,
    versions: pruneVersions([version, ...instance.versions]),
    updatedBy: input.actorUserId,
    updatedAt: now,
  };
  mutate(state => { state.clientPortalInstances[updated.id] = updated; });

  return {
    instance: updated,
    plan,
    accepted: merged.accepted.map(change => change.path),
    declined: merged.declined.map(change => change.path),
    versionPinAdvanced: merged.advanceVersionPin,
  };
}

function findRecord(agencyId: string, scope: ClientPortalDesignScope, recordId: string): ClientPortalDesignRecord | null {
  const record = scope === "template"
    ? getState().clientPortalTemplates[recordId]
    : getState().clientPortalInstances[recordId];
  if (record?.agencyId === agencyId) return record;
  // A never-saved product template is a real record that simply has not been
  // written yet (issue #21). The WRITE is where it gets persisted — every
  // caller of this helper follows it with `writeRecord` — so resolve it here
  // rather than refusing the first save with "portal design could not be
  // updated".
  if (scope !== "template" || !recordId) return null;
  const product = productForProductTemplateId(agencyId, recordId);
  return product ? productPortalTemplateForRead(agencyId, product) : null;
}

function writeRecord(scope: ClientPortalDesignScope, record: ClientPortalDesignRecord): void {
  mutate(state => {
    if (scope === "template") state.clientPortalTemplates[record.id] = record as ClientPortalTemplateRecord;
    else state.clientPortalInstances[record.id] = record as ClientPortalInstanceRecord;
  });
}

function makeVersion(
  document: ClientPortalDesignDocument,
  actor: string,
  source: ClientPortalDesignVersion["source"],
  label?: string,
  createdAt = Date.now(),
  id = `portal_version_${crypto.randomBytes(8).toString("hex")}`,
): ClientPortalDesignVersion {
  return {
    id,
    label,
    source,
    document: clonePortalDesign(document),
    createdBy: actor,
    createdAt,
  };
}

/**
 * A DETERMINISTIC version id for a product template's own generated versions.
 *
 * The same reasoning as the team channel's per-agency id (issue #21,
 * 2026-08-27): a read hands back an unsaved record, and the first write persists
 * it under the SAME ids, so "what the screen showed" and "what got stored" are
 * the same thing rather than two records that happen to look alike. Random ids
 * would make an unsaved template a different template on every render.
 */
function productTemplateVersionId(recordId: string, purpose: string): string {
  return `portal_version_${crypto.createHash("sha1").update(`${recordId}:${purpose}`).digest("hex").slice(0, 16)}`;
}

function pruneVersions(versions: ClientPortalDesignVersion[]): ClientPortalDesignVersion[] {
  let unnamed = 0;
  return versions.filter(version => {
    if (version.label || version.source !== "autosave") return true;
    unnamed += 1;
    return unnamed <= AUTO_VERSION_CAP;
  });
}

function productPortalDocument(master: ClientPortalDesignDocument, product: AgencyProduct): ClientPortalDesignDocument {
  const document = clonePortalDesign(master);
  const definition = PORTAL_PRODUCT_CATALOG.find(item => item.catalogKey === product.portalTemplateKey);
  const projectLabel = definition?.projectLabel || product.name;
  document.chrome.serviceLabel = `${product.name} client service`;
  document.pages.home.title = product.portalHeadline
    || product.buyerHeadline
    || definition?.homeHeading
    || `Your ${product.name}, all in one place.`;
  document.pages.project.eyebrow = `Your ${projectLabel}`;

  if (product.portalWelcomeNote) {
    document.pages.home.body = product.portalWelcomeNote;
    document.home.welcomeBody = product.portalWelcomeNote;
  }
  if (product.portalSupportCta) document.home.careButtonLabel = product.portalSupportCta;
  if (product.accentColor && /^#[0-9a-f]{6}$/i.test(product.accentColor)) {
    document.theme.accentColor = product.accentColor.toLowerCase();
  }
  return applyProductLifecycle(document, product);
}

function applyProductLifecycle(base: ClientPortalDesignDocument, product: AgencyProduct): ClientPortalDesignDocument {
  const document = clonePortalDesign(base);
  const lifecycle = portalProductLifecycle(portalProductSelectionFromAgencyProduct(product));
  for (const mode of CLIENT_PORTAL_MODES) {
    const stage = lifecycle[mode];
    document.stages[mode] = {
      label: stage.label,
      eyebrow: stage.eyebrow,
      heading: stage.heading,
      body: stage.body,
      progress: stage.progress,
      focus: stage.focus,
    };
  }
  return document;
}

/**
 * The repair an existing product template needs — computed, never stored.
 *
 * PURE since 2026-08-31 (issue #21): it returns `existing` unchanged when there
 * is nothing to do, and a new record when there is. `ensureProductPortalTemplate`
 * decides whether to persist that record; `productPortalTemplateForRead` does
 * not. The two used to be one function, which is why looking at a product page
 * wrote to disk.
 */
function upgradedProductPortalTemplate(
  existing: ClientPortalTemplateRecord,
  product: AgencyProduct,
  actorUserId: string,
  now: number,
): ClientPortalTemplateRecord {
  const name = productPortalTemplateName(product);
  if (existing.productLifecycleSeedVersion === PRODUCT_LIFECYCLE_SEED_VERSION) {
    const productSourceUpdatedAt = existing.productSourceUpdatedAt
      ?? Math.min(product.updatedAt, existing.updatedAt);
    const draftProductSourceUpdatedAt = existing.draftProductSourceUpdatedAt ?? productSourceUpdatedAt;
    if (existing.name === name
      && existing.productId === product.id
      && existing.productSourceUpdatedAt === productSourceUpdatedAt
      && existing.draftProductSourceUpdatedAt === draftProductSourceUpdatedAt) return existing;
    return { ...existing, name, productId: product.id, productSourceUpdatedAt, draftProductSourceUpdatedAt };
  }

  const pristine = existing.versions.every(version =>
    version.source === "publish"
    && (version.label === `Created from ${CLIENT_PORTAL_TEMPLATE_NAME}` || version.label === "Product lifecycle foundation")
  );
  const previousDraft = makeVersion(existing.draft, actorUserId, "checkpoint", "Before product lifecycle upgrade", now, productTemplateVersionId(existing.id, "pre-lifecycle"));
  const draft = applyProductLifecycle(existing.draft, product);
  const lifecycleVersion = makeVersion(draft, actorUserId, pristine ? "publish" : "checkpoint", "Product lifecycle foundation", now, productTemplateVersionId(existing.id, "lifecycle"));
  const updated: ClientPortalTemplateRecord = {
    ...existing,
    name,
    productId: product.id,
    productLifecycleSeedVersion: PRODUCT_LIFECYCLE_SEED_VERSION,
    draft,
    published: pristine ? clonePortalDesign(draft) : existing.published,
    publishedVersionId: pristine ? lifecycleVersion.id : existing.publishedVersionId,
    versions: pruneVersions(pristine
      ? [lifecycleVersion, ...existing.versions]
      : [lifecycleVersion, previousDraft, ...existing.versions]),
    updatedBy: actorUserId,
    updatedAt: now,
    publishedAt: pristine ? now : existing.publishedAt,
  };
  return updated;
}

function virtualStunningTemplate(agencyId: string): ClientPortalTemplateRecord {
  const now = 0;
  const document = clonePortalDesign(STUNNING_STANDARD_PORTAL);
  const version: ClientPortalDesignVersion = {
    id: "stunning-standard-v1",
    label: "Stunning Standard v1",
    source: "publish",
    document: clonePortalDesign(document),
    createdBy: "system",
    createdAt: now,
  };
  return {
    id: portalTemplateRecordId(agencyId),
    agencyId,
    name: CLIENT_PORTAL_TEMPLATE_NAME,
    slug: CLIENT_PORTAL_TEMPLATE_ID,
    draft: clonePortalDesign(document),
    published: clonePortalDesign(document),
    publishedVersionId: version.id,
    versions: [version],
    createdBy: "system",
    updatedBy: "system",
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };
}
