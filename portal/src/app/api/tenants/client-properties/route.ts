import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { isLocalDevelopmentUrl, normalizeWebsiteUrl } from "@/lib/public/publicUrl";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export type ClientPropertyKind = "website" | "client-portal" | "dev-portal" | "software" | "lead-magnet" | "repo" | "template" | "tag";
export type ClientPropertyStatus = "planning" | "building" | "review" | "live" | "redirected" | "archived";
export type ClientPropertyTagStatus = "planned" | "installed" | "missing" | "broken" | "not-needed";

export interface ClientProperty {
  id: string;
  label: string;
  kind: ClientPropertyKind;
  status: ClientPropertyStatus;
  localPath?: string;
  repoUrl?: string;
  liveUrl?: string;
  previewUrl?: string;
  vercelProject?: string;
  redirectTarget?: string;
  tagStatus?: ClientPropertyTagStatus;
  notes?: string;
  projectSlug?: string;
  starterId?: string;
  repositoryStatus?: "not-created" | "local" | "connected";
  deploymentStatus?: "not-deployed" | "preview" | "production";
  initialCommit?: string;
  provisionedAt?: number;
  vercelDeploymentId?: string;
  deploymentReadyState?: string;
  lastDeployedAt?: number;
  updatedAt: number;
}

type PropertyInput = Partial<Omit<ClientProperty, "id" | "updatedAt">> & { id?: string };

interface Body {
  clientId?: string;
  action?: "add" | "update" | "delete";
  property?: PropertyInput;
  propertyId?: string;
}

const KINDS: readonly ClientPropertyKind[] = ["website", "client-portal", "dev-portal", "software", "lead-magnet", "repo", "template", "tag"];
const STATUSES: readonly ClientPropertyStatus[] = ["planning", "building", "review", "live", "redirected", "archived"];
const TAG_STATUSES: readonly ClientPropertyTagStatus[] = ["planned", "installed", "missing", "broken", "not-needed"];

function makeId(): string {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return `prop_${c.randomUUID()}`;
  return `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function mergedString(
  input: PropertyInput,
  key: keyof PropertyInput,
  existing?: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(input, key)
    ? cleanString(input[key])
    : existing;
}

function cleanProperty(input: PropertyInput, existing?: ClientProperty): ClientProperty | null {
  const label = cleanString(input.label) ?? existing?.label;
  if (!label) return null;
  const kind = KINDS.includes(input.kind as ClientPropertyKind)
    ? input.kind as ClientPropertyKind
    : existing?.kind ?? "website";
  const status = STATUSES.includes(input.status as ClientPropertyStatus)
    ? input.status as ClientPropertyStatus
    : existing?.status ?? "building";
  const tagStatus = TAG_STATUSES.includes(input.tagStatus as ClientPropertyTagStatus)
    ? input.tagStatus as ClientPropertyTagStatus
    : existing?.tagStatus;

  return {
    id: existing?.id ?? input.id ?? makeId(),
    label,
    kind,
    status,
    localPath: mergedString(input, "localPath", existing?.localPath),
    repoUrl: mergedString(input, "repoUrl", existing?.repoUrl),
    liveUrl: mergedString(input, "liveUrl", existing?.liveUrl),
    previewUrl: mergedString(input, "previewUrl", existing?.previewUrl),
    vercelProject: mergedString(input, "vercelProject", existing?.vercelProject),
    redirectTarget: mergedString(input, "redirectTarget", existing?.redirectTarget),
    tagStatus,
    notes: mergedString(input, "notes", existing?.notes),
    projectSlug: mergedString(input, "projectSlug", existing?.projectSlug),
    starterId: mergedString(input, "starterId", existing?.starterId),
    repositoryStatus: input.repositoryStatus ?? existing?.repositoryStatus,
    deploymentStatus: input.deploymentStatus ?? existing?.deploymentStatus,
    initialCommit: mergedString(input, "initialCommit", existing?.initialCommit),
    provisionedAt: typeof input.provisionedAt === "number" ? input.provisionedAt : existing?.provisionedAt,
    vercelDeploymentId: mergedString(input, "vercelDeploymentId", existing?.vercelDeploymentId),
    deploymentReadyState: mergedString(input, "deploymentReadyState", existing?.deploymentReadyState),
    lastDeployedAt: typeof input.lastDeployedAt === "number" ? input.lastDeployedAt : existing?.lastDeployedAt,
    updatedAt: Date.now(),
  };
}

function normalizePropertyUrls(input: PropertyInput): { property?: PropertyInput; error?: string } {
  const property = { ...input };

  if (Object.prototype.hasOwnProperty.call(input, "liveUrl")) {
    const raw = cleanString(input.liveUrl);
    const normalized = normalizeWebsiteUrl(raw);
    if (raw && !normalized) return { error: "Enter a valid official website URL." };
    if (normalized && isLocalDevelopmentUrl(normalized)) {
      return { error: "Live URL cannot use localhost. Put local addresses in Preview URL." };
    }
    property.liveUrl = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(input, "previewUrl")) {
    const raw = cleanString(input.previewUrl);
    const normalized = normalizeWebsiteUrl(raw);
    if (raw && !normalized) return { error: "Enter a valid preview URL." };
    property.previewUrl = normalized;
  }

  return { property };
}

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as Body | null;
    if (!body?.clientId || !body.action) {
      return NextResponse.json({ ok: false, error: "clientId + action required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    const client = getClientForAgency(session.agencyId, body.clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(body.clientId, "client.systems", "use");

    const meta = (client.metadata ?? {}) as { properties?: ClientProperty[] };
    const properties = Array.isArray(meta.properties) ? [...meta.properties] : [];
    let next = properties;
    let changed: ClientProperty | null = null;

    if (body.action === "add") {
      if (!body.property) return NextResponse.json({ ok: false, error: "property required" }, { status: 400 });
      const normalized = normalizePropertyUrls(body.property);
      if (!normalized.property) return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
      changed = cleanProperty(normalized.property);
      if (!changed) return NextResponse.json({ ok: false, error: "property label required" }, { status: 400 });
      next = [changed, ...properties];
    }

    if (body.action === "update") {
      if (!body.property?.id) return NextResponse.json({ ok: false, error: "property.id required" }, { status: 400 });
      const existing = properties.find(p => p.id === body.property?.id);
      if (!existing) return NextResponse.json({ ok: false, error: "property not found" }, { status: 404 });
      const normalized = normalizePropertyUrls(body.property);
      if (!normalized.property) return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
      changed = cleanProperty(normalized.property, existing);
      if (!changed) return NextResponse.json({ ok: false, error: "property label required" }, { status: 400 });
      next = properties.map(p => p.id === changed?.id ? changed : p);
    }

    if (body.action === "delete") {
      if (!body.propertyId) return NextResponse.json({ ok: false, error: "propertyId required" }, { status: 400 });
      const existing = properties.find(p => p.id === body.propertyId);
      if (!existing) return NextResponse.json({ ok: false, error: "property not found" }, { status: 404 });
      changed = existing;
      next = properties.filter(p => p.id !== body.propertyId);
    }

    const updated = updateClient(session.agencyId, body.clientId, { metadata: { properties: next } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });

    logActivity({
      agencyId: session.agencyId,
      clientId: body.clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: `client.property_${body.action}`,
      message: `${body.action === "delete" ? "Removed" : body.action === "add" ? "Added" : "Updated"} property "${changed?.label ?? "Unknown"}".`,
      metadata: { propertyId: changed?.id, kind: changed?.kind, status: changed?.status },
    });

    return NextResponse.json({ ok: true, property: changed, properties: next });
  } catch (err) {
    return authErrorResponse(err);
  }
}
