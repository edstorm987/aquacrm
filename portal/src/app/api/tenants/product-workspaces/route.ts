import { NextResponse } from "next/server";
import { resolveClientProductStage } from "@/lib/products/clientProductStageTruth";
import { defaultProductInternalWorkspace } from "@/lib/products/productInternalWorkspace";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import { agencyProductsForRead } from "@/server/agencyProducts";
import { clientProductWorkspaces, mutateClientProductWorkspaceVersioned } from "@/server/productWorkspaces";
import { transitionClientProductStage } from "@/server/productStageTransitions";
import { ProductWorkspaceBusyError, withProductWorkspaceTransaction } from "@/server/productWorkspaceCoordinator";
import type {
  PortalProductWorkspace,
  PortalWorkspaceAsset,
  PortalWorkspaceCollection,
  PortalWorkspaceCollectionStatus,
  PortalWorkspaceDecision,
  PortalWorkspaceOutputStatus,
} from "@/lib/portal/portalProductWorkspaces";
import type { PortalProductMode } from "@/lib/portal/portalProducts";
import type { ClientFileRef } from "../client-files/route";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export const runtime = "nodejs";

interface Body {
  clientId?: unknown;
  productId?: unknown;
  action?: unknown;
  pageId?: unknown;
  itemId?: unknown;
  complete?: unknown;
  fields?: unknown;
  message?: unknown;
  title?: unknown;
  detail?: unknown;
  status?: unknown;
  stage?: unknown;
  collectionId?: unknown;
  decisionId?: unknown;
  assetId?: unknown;
  fileId?: unknown;
  caption?: unknown;
  selected?: unknown;
  expectedRevision?: unknown;
  responseNote?: unknown;
  selectionLimit?: unknown;
  downloadsEnabled?: unknown;
  watermarkEnabled?: unknown;
  watermarkLabel?: unknown;
}

const STAGES: readonly PortalProductMode[] = ["onboarding", "designing", "developed-launch", "maintenance"];
const OUTPUT_STATUSES: readonly PortalWorkspaceOutputStatus[] = ["planned", "in-progress", "ready", "approved"];
const MANAGEMENT_COLLECTION_STATUSES: readonly PortalWorkspaceCollectionStatus[] = ["draft", "review", "changes-requested", "approved", "delivered", "archived"];
const CUSTOMER_COLLECTION_STATUSES: readonly PortalWorkspaceCollectionStatus[] = ["approved", "changes-requested"];
const ASSET_STATUSES: readonly PortalWorkspaceAsset["status"][] = ["working", "review", "approved", "delivered"];

function cleanText(value: unknown, max = 2_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function makeId(prefix: string): string {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  return c?.randomUUID
    ? `${prefix}_${c.randomUUID()}`
    : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .slice(0, 30)
    .flatMap(([key, fieldValue]) => {
      const safeKey = key.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
      const safeValue = cleanText(fieldValue, 4_000);
      return safeKey ? [[safeKey, safeValue]] : [];
    }));
}

function customerMessage(action: string, productName: string): string {
  if (action === "toggle-check") return `${productName} checklist updated.`;
  if (action === "save-fields") return `${productName} project record updated.`;
  if (action === "add-update") return `A new ${productName} update was shared.`;
  if (action === "asset-response") return `${productName} gallery feedback updated.`;
  if (action === "respond-decision") return `${productName} decision answered.`;
  if (action === "set-collection-status") return `${productName} collection status updated.`;
  if (action === "attach-file") return `A file was added to the ${productName} workspace.`;
  return `${productName} workspace updated.`;
}

export async function GET(req: Request) {
  await ensureHydrated();
  const clientId = new URL(req.url).searchParams.get("clientId")?.trim().slice(0, 120) ?? "";
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  try {
    const session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", "view");
    return NextResponse.json({ ok: true, workspaces: clientProductWorkspaces(client) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as Body | null;
    const clientId = cleanText(body?.clientId, 120);
    const productId = cleanText(body?.productId, 120);
    const action = cleanText(body?.action, 50);
    if (!clientId || !productId || !action) {
      return NextResponse.json({ ok: false, error: "clientId, productId and action are required" }, { status: 400 });
    }
    const expectedRevision = body?.expectedRevision;
    if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json({ ok: false, error: "expectedRevision is required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", "use");
    const management = session.role !== "end-customer";
    const workspaces = clientProductWorkspaces(client);
    const existing = workspaces.find(item => item.productId === productId);
    if (!existing) return NextResponse.json({ ok: false, error: "product is not part of this portal" }, { status: 404 });
    const now = Date.now();
    let workspace: PortalProductWorkspace = structuredClone(existing);
    let fileVisibility: { fileIds: string[]; visible: boolean; attachmentState?: "pending" | "attached" } | null = null;
    const pageId = cleanText(body?.pageId, 120);

    if (action === "set-stage") {
      if (!management) return NextResponse.json({ ok: false, error: "only the delivery team can move product stages" }, { status: 403 });
      if (!STAGES.includes(body?.stage as PortalProductMode)) return NextResponse.json({ ok: false, error: "valid stage required" }, { status: 400 });
      const portalMode = body?.stage as PortalProductMode;
      const product = agencyProductsForRead(session.agencyId).find(item => item.id === productId);
      if (!product) return NextResponse.json({ ok: false, error: "product is no longer available" }, { status: 404 });
      const lifecycle = (product.internalWorkspace ?? defaultProductInternalWorkspace(product)).lifecycleStages;
      const currentTruth = resolveClientProductStage(client, product);
      const currentStage = lifecycle.find(stage => stage.id === currentTruth.stageId);
      const matchingStage = currentStage?.portalMode === portalMode
        ? currentStage
        : lifecycle.find(stage => stage.portalMode === portalMode);
      if (!matchingStage) return NextResponse.json({ ok: false, error: "service stage could not be mapped" }, { status: 400 });
      const transition = await withProductWorkspaceTransaction({
        agencyId: session.agencyId,
        clientId,
        productId,
      }, () => transitionClientProductStage({
          client,
          product,
          stageId: matchingStage.id,
          actorUserId: session.userId,
          actorEmail: session.email,
          expectedRevision,
          now,
        }));
      if (!transition) return NextResponse.json({ ok: false, error: "service stage could not be synchronised" }, { status: 500 });
      if (transition.status === "conflict") {
        return NextResponse.json({
          ok: false,
          error: "This workspace changed in another session. The latest version has been loaded; review it and try again.",
          workspace: clientProductWorkspaces(transition.client).find(item => item.productId === productId),
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        workspace: clientProductWorkspaces(transition.client).find(item => item.productId === productId),
        serviceStageId: transition.stageId,
        portalMode: transition.portalMode,
        accountStage: transition.client.stage,
        changed: transition.changed,
      });
    } else if (action === "toggle-check") {
      const itemId = cleanText(body?.itemId, 120);
      const page = workspace.pages[pageId];
      if (!page || !itemId) return NextResponse.json({ ok: false, error: "valid page and checklist item required" }, { status: 400 });
      const item = page.checklist.find(check => check.id === itemId);
      if (!item) return NextResponse.json({ ok: false, error: "checklist item not found" }, { status: 404 });
      item.complete = body?.complete === true;
      item.completedAt = item.complete ? now : undefined;
      item.completedBy = item.complete ? session.email : undefined;
      item.completedByActor = item.complete ? (management ? "agency" : "customer") : undefined;
      page.updatedAt = now;
    } else if (action === "save-fields") {
      const page = workspace.pages[pageId];
      if (!page) return NextResponse.json({ ok: false, error: "valid page required" }, { status: 400 });
      page.fields = safeFields(body?.fields);
      page.updatedAt = now;
    } else if (action === "set-output-status") {
      if (!management) return NextResponse.json({ ok: false, error: "only the delivery team can update outputs" }, { status: 403 });
      const itemId = cleanText(body?.itemId, 120);
      const page = workspace.pages[pageId];
      const output = page?.outputs.find(item => item.id === itemId);
      if (!page || !output || !OUTPUT_STATUSES.includes(body?.status as PortalWorkspaceOutputStatus)) {
        return NextResponse.json({ ok: false, error: "valid page, output and status required" }, { status: 400 });
      }
      output.status = body?.status as PortalWorkspaceOutputStatus;
      output.updatedAt = now;
      output.updatedBy = session.email;
      page.updatedAt = now;
    } else if (action === "add-update") {
      const message = cleanText(body?.message, 2_000);
      if (!workspace.pages[pageId] || !message) return NextResponse.json({ ok: false, error: "page and message required" }, { status: 400 });
      workspace.updates.unshift({
        id: makeId("update"),
        pageId,
        message,
        actor: management ? "agency" : "customer",
        author: management ? "Aqua team" : "Customer",
        createdAt: now,
      });
      workspace.updates = workspace.updates.slice(0, 200);
    } else if (action === "create-collection") {
      if (!management) return NextResponse.json({ ok: false, error: "only the delivery team can create collections" }, { status: 403 });
      const title = cleanText(body?.title, 200);
      if (!workspace.pages[pageId] || !title) return NextResponse.json({ ok: false, error: "page and collection title required" }, { status: 400 });
      const selectionLimit = typeof body?.selectionLimit === "number"
        ? Math.max(0, Math.min(500, Math.round(body.selectionLimit))) || undefined
        : undefined;
      const collection: PortalWorkspaceCollection = {
        id: makeId("collection"),
        pageId,
        title,
        description: cleanText(body?.detail, 1_000) || undefined,
        status: "draft",
        downloadsEnabled: body?.downloadsEnabled === true,
        watermarkEnabled: body?.watermarkEnabled === true,
        watermarkLabel: cleanText(body?.watermarkLabel, 80) || undefined,
        selectionLimit,
        assets: [],
        createdAt: now,
        updatedAt: now,
      };
      workspace.collections.unshift(collection);
    } else if (action === "update-collection") {
      if (!management) return NextResponse.json({ ok: false, error: "only the delivery team can update collections" }, { status: 403 });
      const collectionId = cleanText(body?.collectionId, 120);
      const collection = workspace.collections.find(item => item.id === collectionId);
      if (!collection) return NextResponse.json({ ok: false, error: "collection not found" }, { status: 404 });
      const title = cleanText(body?.title, 200);
      if (title) collection.title = title;
      if (typeof body?.detail === "string") collection.description = cleanText(body.detail, 1_000) || undefined;
      if (typeof body?.selectionLimit === "number") {
        collection.selectionLimit = Math.max(0, Math.min(500, Math.round(body.selectionLimit))) || undefined;
      }
      if (typeof body?.downloadsEnabled === "boolean") collection.downloadsEnabled = body.downloadsEnabled;
      if (typeof body?.watermarkEnabled === "boolean") collection.watermarkEnabled = body.watermarkEnabled;
      if (typeof body?.watermarkLabel === "string") collection.watermarkLabel = cleanText(body.watermarkLabel, 80) || undefined;
      collection.updatedAt = now;
    } else if (action === "attach-file") {
      if (!management) return NextResponse.json({ ok: false, error: "only the delivery team can attach delivery files" }, { status: 403 });
      const collectionId = cleanText(body?.collectionId, 120);
      const fileId = cleanText(body?.fileId, 120);
      const collection = workspace.collections.find(item => item.id === collectionId);
      const files = Array.isArray(client.metadata?.files) ? client.metadata.files as ClientFileRef[] : [];
      const file = files.find(item => item.id === fileId);
      if (!collection || !file) return NextResponse.json({ ok: false, error: "collection or file not found" }, { status: 404 });
      if (!collection.assets.some(asset => asset.fileId === file.id)) {
        const asset: PortalWorkspaceAsset = {
          id: makeId("asset"),
          fileId: file.id,
          title: cleanText(body?.title, 240) || file.name,
          caption: cleanText(body?.caption, 1_000) || undefined,
          status: collection.status === "delivered" ? "delivered" : collection.status === "review" ? "review" : "working",
          selected: false,
          addedAt: now,
          addedBy: session.email,
        };
        collection.assets.push(asset);
        collection.updatedAt = now;
      }
      fileVisibility = {
        fileIds: [file.id],
        visible: collection.status !== "draft" && collection.status !== "archived",
        attachmentState: "attached",
      };
    } else if (action === "remove-asset") {
      if (!management) return NextResponse.json({ ok: false, error: "only the delivery team can remove assets" }, { status: 403 });
      const collectionId = cleanText(body?.collectionId, 120);
      const assetId = cleanText(body?.assetId, 120);
      const collection = workspace.collections.find(item => item.id === collectionId);
      const asset = collection?.assets.find(item => item.id === assetId);
      if (!collection || !asset) return NextResponse.json({ ok: false, error: "asset not found" }, { status: 404 });
      collection.assets = collection.assets.filter(item => item.id !== assetId);
      collection.updatedAt = now;
      // The file remains available in the file room, but it is no longer a
      // converged collection upload. Reset the durable marker so a reload does
      // not silently skip it when the delivery team chooses it again.
      fileVisibility = { fileIds: [asset.fileId], visible: false, attachmentState: "pending" };
    } else if (action === "asset-response") {
      const collectionId = cleanText(body?.collectionId, 120);
      const assetId = cleanText(body?.assetId, 120);
      const collection = workspace.collections.find(item => item.id === collectionId);
      const asset = collection?.assets.find(item => item.id === assetId);
      if (!collection || !asset) return NextResponse.json({ ok: false, error: "asset not found" }, { status: 404 });
      if (!management && collection.status !== "review" && collection.status !== "changes-requested") {
        return NextResponse.json({ ok: false, error: "this collection is not open for customer feedback" }, { status: 409 });
      }
      if (typeof body?.selected === "boolean") {
        const selectedWithoutAsset = collection.assets.filter(item => item.selected && item.id !== asset.id).length;
        if (body.selected && collection.selectionLimit && selectedWithoutAsset >= collection.selectionLimit) {
          return NextResponse.json({ ok: false, error: `This collection allows ${collection.selectionLimit} selections.` }, { status: 409 });
        }
        asset.selected = body.selected;
        asset.selectedAt = body.selected ? now : undefined;
        asset.selectedBy = body.selected ? session.email : undefined;
      }
      if (typeof body?.message === "string") asset.customerComment = cleanText(body.message, 1_500) || undefined;
      if (management && ASSET_STATUSES.includes(body?.status as PortalWorkspaceAsset["status"])) {
        asset.status = body?.status as PortalWorkspaceAsset["status"];
      }
      if (management && typeof body?.caption === "string") asset.caption = cleanText(body.caption, 1_000) || undefined;
      collection.updatedAt = now;
    } else if (action === "set-collection-status") {
      const collectionId = cleanText(body?.collectionId, 120);
      const collection = workspace.collections.find(item => item.id === collectionId);
      const allowed = management ? MANAGEMENT_COLLECTION_STATUSES : CUSTOMER_COLLECTION_STATUSES;
      if (!collection || !allowed.includes(body?.status as PortalWorkspaceCollectionStatus)) {
        return NextResponse.json({ ok: false, error: "collection and permitted status required" }, { status: 400 });
      }
      if (!management && collection.status !== "review" && collection.status !== "changes-requested") {
        return NextResponse.json({ ok: false, error: "this collection is not waiting for a customer decision" }, { status: 409 });
      }
      collection.status = body?.status as PortalWorkspaceCollectionStatus;
      collection.updatedAt = now;
      if (collection.status === "delivered") {
        collection.downloadsEnabled = true;
        collection.assets.forEach(asset => { asset.status = "delivered"; });
      }
      fileVisibility = {
        fileIds: collection.assets.map(asset => asset.fileId),
        visible: collection.status !== "draft" && collection.status !== "archived",
      };
    } else if (action === "request-decision") {
      if (!management) return NextResponse.json({ ok: false, error: "only the delivery team can request decisions" }, { status: 403 });
      const title = cleanText(body?.title, 240);
      if (!workspace.pages[pageId] || !title) return NextResponse.json({ ok: false, error: "page and decision title required" }, { status: 400 });
      const decision: PortalWorkspaceDecision = {
        id: makeId("decision"),
        pageId,
        title,
        detail: cleanText(body?.detail, 2_000) || undefined,
        status: "pending",
        requestedAt: now,
        requestedBy: session.email,
      };
      workspace.decisions.unshift(decision);
    } else if (action === "respond-decision") {
      if (management) return NextResponse.json({ ok: false, error: "open the customer portal to answer a client decision" }, { status: 403 });
      const decisionId = cleanText(body?.decisionId, 120);
      const decision = workspace.decisions.find(item => item.id === decisionId);
      const status = body?.status === "approved" || body?.status === "changes-requested" ? body.status : null;
      if (!decision || decision.status !== "pending" || !status) return NextResponse.json({ ok: false, error: "pending decision and response required" }, { status: 400 });
      decision.status = status;
      decision.respondedAt = now;
      decision.respondedBy = session.email;
      decision.responseNote = cleanText(body?.responseNote, 2_000) || undefined;
    } else {
      return NextResponse.json({ ok: false, error: "unsupported workspace action" }, { status: 400 });
    }

    workspace.updatedAt = now;
    const commit = await withProductWorkspaceTransaction({
      agencyId: session.agencyId,
      clientId,
      productId,
    }, () => mutateClientProductWorkspaceVersioned({
        agencyId: session.agencyId,
        clientId,
        productId,
        expectedRevision,
        change: current => {
          let files: ClientFileRef[] | undefined;
          if (fileVisibility?.fileIds.length) {
            const ids = new Set(fileVisibility.fileIds);
            const currentFiles = Array.isArray(current.client.metadata?.files)
              ? current.client.metadata.files as ClientFileRef[]
              : [];
            files = currentFiles.map(file => ids.has(file.id)
              ? {
                  ...file,
                  customerVisible: fileVisibility!.visible,
                  ...(fileVisibility!.attachmentState ? { workspaceAttachmentState: fileVisibility!.attachmentState } : {}),
                }
              : file);
          }
          return {
            workspace,
            ...(files ? { metadata: { files } } : {}),
          };
        },
      }));
    if (commit.status === "not-found") {
      return NextResponse.json({ ok: false, error: "workspace could not be saved" }, { status: 500 });
    }
    if (commit.status === "conflict") {
      return NextResponse.json({
        ok: false,
        error: "This workspace changed in another session. The latest version has been loaded; review it and try again.",
        workspace: commit.workspace,
      }, { status: 409 });
    }
    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: action === "asset-response" || action === "respond-decision" ? "feedback" : "fulfillment",
      action: `product_workspace.${action}`,
      message: customerMessage(action, workspace.productName),
      metadata: {
        productId,
        pageId,
        collectionId: cleanText(body?.collectionId, 120) || undefined,
      },
    });
    return NextResponse.json({ ok: true, workspace: commit.workspace });
  } catch (error) {
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
