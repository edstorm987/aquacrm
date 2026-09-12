import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { CapturedField } from "@/lib/enquiries/formCapture";
import {
  isAllowedPublicSiteOrigin,
  publicAquaPropertyId,
  publicAquaSite,
} from "@/lib/public/publicSites";
import { FOUNDER_AGENCY_SLUG } from "@/lib/server/seeds/founderSeed";
import { getState } from "@/server/storage";
import { getAgencyBySlug } from "@/server/tenants";
import {
  listWebsiteSources,
  resolveAgencyByMasterSiteKey,
} from "@/server/websiteSources";

const VERSION = 1;
export const AQUA_TAG_FORM_CAPTURE_ACTION = "aqua-tag-form-capture";
const ACTION = "form-capture";
const MAX_AGE_MS = 2 * 60_000;
const MAX_CLOCK_SKEW_MS = 30_000;

export interface AquaTagAdmissionScope {
  agencyId: string;
  siteKey: string;
  host: string;
  keyClass: "public" | "agency-master" | "client-telemetry" | "agency-website";
  siteId: string;
  clientId?: string;
  propertyId?: string;
}

export interface AquaTagFormFacts {
  submissionId: string;
  formName?: string;
  formId?: string;
  purpose?: string;
  pageUrl?: string;
  pagePath: string;
  propertyId?: string;
  fields: CapturedField[];
}

interface AquaTagFormAdmissionClaims {
  v: 1;
  action: typeof ACTION;
  agencyId: string;
  siteKey: string;
  host: string;
  keyClass: AquaTagAdmissionScope["keyClass"];
  siteId: string;
  clientId?: string;
  propertyId?: string;
  submissionId: string;
  formName?: string;
  formId?: string;
  purpose?: string;
  pageUrl?: string;
  pagePath: string;
  captureDigest: string;
  nonce: string;
  iat: number;
  exp: number;
}

export type AquaTagAdmissionVerification =
  | { ok: true; claims: AquaTagFormAdmissionClaims }
  | { ok: false; reason: "unconfigured" | "malformed" | "invalid" | "expired" | "scope-mismatch" | "capture-mismatch" };

function secret(): string | null {
  const value = (
    process.env.AQUA_TAG_ADMISSION_SECRET
    ?? process.env.PORTAL_SESSION_SECRET
    ?? ""
  ).trim();
  return value || null;
}

function signingKey(): string | null {
  const value = secret();
  return value ? `aqua-tag-form-admission:v1\u0000${value}` : null;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): string | null {
  try { return Buffer.from(value, "base64url").toString("utf8"); }
  catch { return null; }
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function equalSignature(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeHost(value: string): string {
  let host = clean(value, 255).toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, "").split("/")[0] ?? host;
  host = (host.split("@").pop() ?? host).split(":")[0] ?? host;
  return host.replace(/^www\./, "").trim();
}

function canonicalFacts(facts: AquaTagFormFacts) {
  return {
    submissionId: facts.submissionId,
    formName: facts.formName ?? "",
    formId: facts.formId ?? "",
    purpose: facts.purpose ?? "",
    pageUrl: facts.pageUrl ?? "",
    pagePath: facts.pagePath,
    propertyId: facts.propertyId ?? "",
    fields: facts.fields.map(field => ({
      key: field.key,
      label: field.label ?? "",
      value: field.value,
      type: field.type ?? "",
    })),
  };
}

export function aquaTagCaptureDigest(facts: AquaTagFormFacts): string {
  return createHash("sha256").update(JSON.stringify(canonicalFacts(facts))).digest("hex");
}

function safeOrigin(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:"))
      ? url
      : null;
  } catch { return null; }
}

/**
 * Resolve the public tag's immutable tenant/site/host scope. A master tag is
 * accepted only on a host explicitly registered to that agency; the public
 * first-party keys retain their exact hardcoded origin allowlists.
 */
export function resolveAquaTagAdmissionScope(siteKeyValue: unknown, originValue: string | null): AquaTagAdmissionScope | null {
  const siteKey = clean(siteKeyValue, 80);
  const origin = safeOrigin(originValue);
  if (!siteKey || !origin) return null;
  const host = normalizeHost(origin.hostname);
  if (!host) return null;

  const publicSite = publicAquaSite(siteKey);
  if (publicSite) {
    if (!isAllowedPublicSiteOrigin(siteKey, origin.origin)) return null;
    const agencyId = getAgencyBySlug(FOUNDER_AGENCY_SLUG)?.id ?? FOUNDER_AGENCY_SLUG;
    return {
      agencyId,
      siteKey,
      host,
      keyClass: "public",
      siteId: `public:${siteKey}`,
      propertyId: publicAquaPropertyId(siteKey, publicSite.propertyId) ?? publicSite.propertyId,
    };
  }

  const candidates: AquaTagAdmissionScope[] = [];
  const masterAgencyId = resolveAgencyByMasterSiteKey(siteKey);
  if (masterAgencyId) {
    const source = listWebsiteSources(masterAgencyId).find(entry => entry.host === host);
    if (source) {
      candidates.push({
        agencyId: masterAgencyId,
        siteKey,
        host,
        keyClass: "agency-master",
        siteId: source.id,
        ...(source.destinationClientId ? { clientId: source.destinationClientId } : {}),
      });
    }
  }

  const state = getState();
  for (const client of Object.values(state.clients)) {
    if (client.metadata?.telemetrySiteKey !== siteKey) continue;
    const directHost = normalizeHost(client.websiteUrl ?? "");
    const source = listWebsiteSources(client.agencyId).find(entry =>
      entry.destinationClientId === client.id && entry.host === host
    );
    if (directHost !== host && !source) continue;
    candidates.push({
      agencyId: client.agencyId,
      clientId: client.id,
      siteKey,
      host,
      keyClass: "client-telemetry",
      siteId: source?.id ?? `client:${client.id}`,
    });
  }

  for (const website of Object.values(state.agencyWebsites)) {
    if (website.telemetrySiteKey !== siteKey) continue;
    const productionHost = normalizeHost(website.productionUrl);
    const previewHost = process.env.NODE_ENV === "production" ? "" : normalizeHost(website.previewUrl);
    if (host !== productionHost && host !== previewHost) continue;
    candidates.push({
      agencyId: website.agencyId,
      siteKey,
      host,
      keyClass: "agency-website",
      siteId: `agency-website:${website.agencyId}`,
    });
  }

  // A browser-public key is accepted only when exactly one current owner also
  // registers this exact hostname. Ambiguous/colliding registry state fails
  // closed rather than letting discovery material choose a tenant.
  return candidates.length === 1 ? candidates[0]! : null;
}

export function issueAquaTagFormAdmission(
  scope: AquaTagAdmissionScope,
  facts: AquaTagFormFacts,
  now = Date.now(),
): { token: string; expiresAt: number } | null {
  const key = signingKey();
  if (!key) return null;
  const claims: AquaTagFormAdmissionClaims = {
    v: VERSION,
    action: ACTION,
    agencyId: scope.agencyId,
    siteKey: scope.siteKey,
    host: scope.host,
    keyClass: scope.keyClass,
    siteId: scope.siteId,
    ...(scope.clientId ? { clientId: scope.clientId } : {}),
    ...(facts.propertyId ? { propertyId: facts.propertyId } : {}),
    submissionId: facts.submissionId,
    ...(facts.formName ? { formName: facts.formName } : {}),
    ...(facts.formId ? { formId: facts.formId } : {}),
    ...(facts.purpose ? { purpose: facts.purpose } : {}),
    ...(facts.pageUrl ? { pageUrl: facts.pageUrl } : {}),
    pagePath: facts.pagePath,
    captureDigest: aquaTagCaptureDigest(facts),
    nonce: randomBytes(16).toString("hex"),
    iat: now,
    exp: now + MAX_AGE_MS,
  };
  const payload = encode(JSON.stringify(claims));
  return { token: `${payload}.${sign(payload, key)}`, expiresAt: claims.exp };
}

function parseClaims(value: unknown): AquaTagFormAdmissionClaims | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = new Set([
    "v", "action", "agencyId", "siteKey", "host", "keyClass", "siteId", "clientId", "propertyId", "submissionId",
    "formName", "formId", "purpose", "pageUrl", "pagePath", "captureDigest",
    "nonce", "iat", "exp",
  ]);
  if (Object.keys(row).some(key => !keys.has(key))) return null;
  if (row.v !== VERSION || row.action !== ACTION) return null;
  const agencyId = clean(row.agencyId, 120);
  const siteKey = clean(row.siteKey, 80);
  const host = normalizeHost(clean(row.host, 255));
  const keyClass = clean(row.keyClass, 30) as AquaTagAdmissionScope["keyClass"];
  const siteId = clean(row.siteId, 160);
  const submissionId = clean(row.submissionId, 120);
  const pagePath = clean(row.pagePath, 300) || "/";
  const captureDigest = clean(row.captureDigest, 64);
  const nonce = clean(row.nonce, 32);
  const iat = Number(row.iat);
  const exp = Number(row.exp);
  if (
    !agencyId || !siteKey || !host || !siteId
    || !["public", "agency-master", "client-telemetry", "agency-website"].includes(keyClass)
    || !/^aqua_sub_[a-z0-9]{12,100}$/.test(submissionId)
    || !/^[a-f0-9]{64}$/.test(captureDigest)
    || !/^[a-f0-9]{32}$/.test(nonce)
    || !Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)
  ) return null;
  return {
    v: 1,
    action: ACTION,
    agencyId,
    siteKey,
    host,
    keyClass,
    siteId,
    ...(clean(row.clientId, 120) ? { clientId: clean(row.clientId, 120) } : {}),
    ...(clean(row.propertyId, 120) ? { propertyId: clean(row.propertyId, 120) } : {}),
    submissionId,
    ...(clean(row.formName, 160) ? { formName: clean(row.formName, 160) } : {}),
    ...(clean(row.formId, 120) ? { formId: clean(row.formId, 120) } : {}),
    ...(clean(row.purpose, 40) ? { purpose: clean(row.purpose, 40) } : {}),
    ...(clean(row.pageUrl, 500) ? { pageUrl: clean(row.pageUrl, 500) } : {}),
    pagePath,
    captureDigest,
    nonce,
    iat,
    exp,
  };
}

export function verifyAquaTagFormAdmission(input: {
  token: unknown;
  scope: AquaTagAdmissionScope;
  facts: AquaTagFormFacts;
  now?: number;
}): AquaTagAdmissionVerification {
  const key = signingKey();
  if (!key) return { ok: false, reason: "unconfigured" };
  const token = clean(input.token, 8_192);
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const expected = sign(parts[0], key);
  if (!equalSignature(parts[1], expected)) return { ok: false, reason: "invalid" };
  const decoded = decode(parts[0]);
  if (!decoded) return { ok: false, reason: "malformed" };
  let parsed: unknown;
  try { parsed = JSON.parse(decoded); }
  catch { return { ok: false, reason: "malformed" }; }
  const claims = parseClaims(parsed);
  if (!claims) return { ok: false, reason: "malformed" };
  const now = input.now ?? Date.now();
  if (claims.iat > now + MAX_CLOCK_SKEW_MS || claims.exp <= now || claims.exp - claims.iat > MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }
  if (
    claims.action !== ACTION
    || claims.agencyId !== input.scope.agencyId
    || claims.siteKey !== input.scope.siteKey
    || claims.host !== input.scope.host
    || claims.keyClass !== input.scope.keyClass
    || claims.siteId !== input.scope.siteId
    || (claims.clientId ?? "") !== (input.scope.clientId ?? "")
    || (claims.propertyId ?? "") !== (input.facts.propertyId ?? "")
    || claims.submissionId !== input.facts.submissionId
    || (claims.formName ?? "") !== (input.facts.formName ?? "")
    || (claims.formId ?? "") !== (input.facts.formId ?? "")
    || (claims.purpose ?? "") !== (input.facts.purpose ?? "")
    || (claims.pageUrl ?? "") !== (input.facts.pageUrl ?? "")
    || claims.pagePath !== input.facts.pagePath
  ) return { ok: false, reason: "scope-mismatch" };
  if (claims.captureDigest !== aquaTagCaptureDigest(input.facts)) {
    return { ok: false, reason: "capture-mismatch" };
  }
  return { ok: true, claims };
}
