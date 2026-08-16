import "server-only";

import crypto from "node:crypto";
import {
  CLIENT_PORTAL_MODES,
  CLIENT_PORTAL_TEMPLATE_ID,
  CLIENT_PORTAL_TEMPLATE_NAME,
  clonePortalDesign,
  normalisePortalDesign,
  STUNNING_STANDARD_PORTAL,
} from "@/lib/clientPortalDesign";
import { PORTAL_PRODUCT_CATALOG, portalProductSelectionFromAgencyProduct } from "@/lib/portalProducts";
import { portalProductLifecycle } from "@/lib/portalProductModules";
import { getState, mutate } from "./storage";
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

export function ensureProductPortalTemplate(
  agencyId: string,
  product: AgencyProduct,
  actorUserId = "system",
): ClientPortalTemplateRecord {
  if (product.agencyId !== agencyId) throw new Error("Product does not belong to this agency.");
  const id = productPortalTemplateRecordId(agencyId, product.id);
  const existing = getState().clientPortalTemplates[id];
  const name = `${product.name} · ${CLIENT_PORTAL_TEMPLATE_NAME}`;
  if (existing) {
    return upgradeProductPortalTemplate(existing, product, name, actorUserId);
  }

  const master = ensureStunningPortalTemplate(agencyId, actorUserId);
  const now = Date.now();
  const document = productPortalDocument(master.published, product);
  const initialVersion = makeVersion(document, actorUserId, "publish", `Created from ${CLIENT_PORTAL_TEMPLATE_NAME}`, now);
  const created: ClientPortalTemplateRecord = {
    id,
    agencyId,
    name,
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
  mutate(state => { state.clientPortalTemplates[id] = created; });
  return created;
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

export function listClientPortalTemplates(agencyId: string): ClientPortalTemplateRecord[] {
  const records = Object.values(getState().clientPortalTemplates)
    .filter(item => item.agencyId === agencyId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return records.some(record => record.id === portalTemplateRecordId(agencyId))
    ? records
    : [virtualStunningTemplate(agencyId), ...records];
}

export function getClientPortalTemplate(agencyId: string, templateId?: string): ClientPortalTemplateRecord | null {
  const id = templateId && templateId.includes(":") ? templateId : portalTemplateRecordId(agencyId, templateId || CLIENT_PORTAL_TEMPLATE_ID);
  const record = getState().clientPortalTemplates[id];
  if (record?.agencyId === agencyId) return record;
  return id === portalTemplateRecordId(agencyId) ? virtualStunningTemplate(agencyId) : null;
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

function findRecord(agencyId: string, scope: ClientPortalDesignScope, recordId: string): ClientPortalDesignRecord | null {
  const record = scope === "template"
    ? getState().clientPortalTemplates[recordId]
    : getState().clientPortalInstances[recordId];
  return record?.agencyId === agencyId ? record : null;
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
): ClientPortalDesignVersion {
  return {
    id: `portal_version_${crypto.randomBytes(8).toString("hex")}`,
    label,
    source,
    document: clonePortalDesign(document),
    createdBy: actor,
    createdAt,
  };
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

function upgradeProductPortalTemplate(
  existing: ClientPortalTemplateRecord,
  product: AgencyProduct,
  name: string,
  actorUserId: string,
): ClientPortalTemplateRecord {
  if (existing.productLifecycleSeedVersion === PRODUCT_LIFECYCLE_SEED_VERSION) {
    const productSourceUpdatedAt = existing.productSourceUpdatedAt
      ?? Math.min(product.updatedAt, existing.updatedAt);
    const draftProductSourceUpdatedAt = existing.draftProductSourceUpdatedAt ?? productSourceUpdatedAt;
    if (existing.name === name
      && existing.productId === product.id
      && existing.productSourceUpdatedAt === productSourceUpdatedAt
      && existing.draftProductSourceUpdatedAt === draftProductSourceUpdatedAt) return existing;
    const renamed = { ...existing, name, productId: product.id, productSourceUpdatedAt, draftProductSourceUpdatedAt };
    mutate(state => { state.clientPortalTemplates[existing.id] = renamed; });
    return renamed;
  }

  const now = Date.now();
  const pristine = existing.versions.every(version =>
    version.source === "publish"
    && (version.label === `Created from ${CLIENT_PORTAL_TEMPLATE_NAME}` || version.label === "Product lifecycle foundation")
  );
  const previousDraft = makeVersion(existing.draft, actorUserId, "checkpoint", "Before product lifecycle upgrade", now);
  const draft = applyProductLifecycle(existing.draft, product);
  const lifecycleVersion = makeVersion(draft, actorUserId, pristine ? "publish" : "checkpoint", "Product lifecycle foundation", now);
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
  mutate(state => { state.clientPortalTemplates[existing.id] = updated; });
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
