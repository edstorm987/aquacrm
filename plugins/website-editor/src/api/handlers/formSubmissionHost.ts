// R047 — Form submission host route + webhook dispatch wiring.
//
// Public POST endpoint for form-block submissions. Resolves the
// form's `submitTo` configuration, dispatches to the right backend:
//
//   - "internal" → persist to forms-plugin storage (stub today; T2
//     forms plugin owns the actual persistence schema).
//   - "webhook"  → dispatchWebhook(target, payload) via R043 helper.
//   - null (target deleted / invalid) → fall back to internal so
//     submissions don't drop on the floor; surface the issue in the
//     webhook log so the operator notices.
//
// Webhook outcomes are logged to a per-tenant ringbuffer that mirrors
// R016 integrations plugin's shape so the operator's existing
// `WebhooksPage` renders these entries unchanged once foundation
// wires the storage key.

import type { PluginCtx, PluginStorage } from "../../lib/aquaPluginTypes";
import { listPages, getPage } from "../../server/pages";
import { listSites } from "../../server/sites";
import {
  resolveFormSubmission,
  dispatchWebhook,
  type FormSubmitTo,
} from "../../lib/webhookBlock";
import { fail, ok, requireClientScope } from "../helpers";
import type { BlockTreeJSON } from "../../types/block";

// ─── Webhook log ringbuffer ──────────────────────────────────────────

const MAX_LOG_ENTRIES = 200;

export interface FormWebhookLogEntry {
  ts: number;
  formBlockId: string;
  pageId: string;
  outcome: "internal" | "webhook-ok" | "webhook-failed" | "webhook-missing";
  url?: string;
  status?: number;
  error?: string;
}

function logKey(agencyId: string, clientId: string): string {
  return `webhook-log:form-submissions:${agencyId}:${clientId}`;
}

async function appendLog(
  storage: PluginStorage,
  agencyId: string,
  clientId: string,
  entry: FormWebhookLogEntry,
): Promise<void> {
  const key = logKey(agencyId, clientId);
  const existing =
    (await storage.get<FormWebhookLogEntry[]>(key)) ?? [];
  existing.unshift(entry);
  if (existing.length > MAX_LOG_ENTRIES) {
    existing.length = MAX_LOG_ENTRIES;
  }
  await storage.set(key, existing);
}

export async function readFormWebhookLog(
  storage: PluginStorage,
  agencyId: string,
  clientId: string,
): Promise<FormWebhookLogEntry[]> {
  return (await storage.get<FormWebhookLogEntry[]>(logKey(agencyId, clientId))) ?? [];
}

// ─── Internal storage stub ───────────────────────────────────────────

const SUBMISSIONS_KEY_PREFIX = "form-submissions";

export interface InternalSubmission {
  id: string;
  agencyId: string;
  clientId: string;
  pageId: string;
  formBlockId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

async function persistInternal(
  storage: PluginStorage,
  sub: InternalSubmission,
): Promise<void> {
  const key = `${SUBMISSIONS_KEY_PREFIX}:${sub.agencyId}:${sub.clientId}:${sub.id}`;
  await storage.set(key, sub);
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

// ─── Submit input shape ──────────────────────────────────────────────

export interface FormSubmitInput {
  pageId: string;
  formBlockId: string;
  // The form payload as sent by the storefront. Free-shape per form;
  // dispatcher passes it through to the webhook body or stores it as
  // the submission row.
  payload: Record<string, unknown>;
  // Form's `submitTo` configuration. Pulled from the form-block's
  // props on the storefront side; sent up so the host doesn't need
  // to re-walk the tree to find the form block. The handler still
  // verifies the submitTo target exists on the page tree for safety.
  submitTo?: FormSubmitTo;
}

function isValidInput(b: unknown): b is FormSubmitInput {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return typeof o.pageId === "string" && o.pageId.length > 0
    && typeof o.formBlockId === "string" && o.formBlockId.length > 0
    && o.payload !== null && typeof o.payload === "object" && !Array.isArray(o.payload);
}

// ─── Handler ─────────────────────────────────────────────────────────

export async function handleFormSubmit(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  let body: unknown;
  try { body = await req.json(); }
  catch { return fail("invalid JSON body", 400); }
  if (!isValidInput(body)) return fail("invalid form submission shape", 400);
  const input = body;

  // Resolve the page so we can walk its blocks for webhook targets.
  // The page must belong to the scoped tenant — if not found, fail
  // closed with 404 (don't leak existence of pages in other tenants).
  const sites = await listSites(ctx.storage, scope.agencyId, scope.clientId);
  let tree: BlockTreeJSON | null = null;
  for (const site of sites) {
    const page = await getPage(
      ctx.storage, scope.agencyId, scope.clientId, site.id, input.pageId,
    );
    if (page) {
      tree = (page.blocks ?? []) as BlockTreeJSON;
      break;
    }
  }
  if (!tree) return fail("page not found", 404);

  const resolved = resolveFormSubmission(tree, input.submitTo);

  // null → submitTo configured but target deleted; log + fall back
  // to internal so submissions don't drop.
  if (resolved === null) {
    await appendLog(ctx.storage, scope.agencyId, scope.clientId, {
      ts: Date.now(),
      formBlockId: input.formBlockId,
      pageId: input.pageId,
      outcome: "webhook-missing",
      error: "submitTo target not found on page; fell back to internal",
    });
    const sub: InternalSubmission = {
      id: makeId("sub"),
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      pageId: input.pageId,
      formBlockId: input.formBlockId,
      payload: input.payload,
      createdAt: Date.now(),
    };
    await persistInternal(ctx.storage, sub);
    return ok({ kind: "internal", id: sub.id, fallback: true });
  }

  if (resolved === "internal") {
    const sub: InternalSubmission = {
      id: makeId("sub"),
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      pageId: input.pageId,
      formBlockId: input.formBlockId,
      payload: input.payload,
      createdAt: Date.now(),
    };
    await persistInternal(ctx.storage, sub);
    await appendLog(ctx.storage, scope.agencyId, scope.clientId, {
      ts: Date.now(),
      formBlockId: input.formBlockId,
      pageId: input.pageId,
      outcome: "internal",
    });
    return ok({ kind: "internal", id: sub.id });
  }

  // Webhook path.
  const result = await dispatchWebhook({
    target: resolved,
    payload: input.payload,
  });
  await appendLog(ctx.storage, scope.agencyId, scope.clientId, {
    ts: Date.now(),
    formBlockId: input.formBlockId,
    pageId: input.pageId,
    outcome: result.ok ? "webhook-ok" : "webhook-failed",
    url: resolved.props.url,
    status: result.status,
    ...(result.error ? { error: result.error } : {}),
  });
  if (!result.ok) {
    // Don't surface webhook failure to the public submitter — they
    // already pressed submit and there's nothing they can do about
    // a misconfigured webhook. Operator sees the failure in the log.
    // We DO persist a fallback internal copy so the submission isn't
    // lost end-to-end.
    const sub: InternalSubmission = {
      id: makeId("sub"),
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      pageId: input.pageId,
      formBlockId: input.formBlockId,
      payload: input.payload,
      createdAt: Date.now(),
    };
    await persistInternal(ctx.storage, sub);
    return ok({
      kind: "webhook",
      ok: false,
      status: result.status,
      fallbackInternalId: sub.id,
    });
  }
  return ok({ kind: "webhook", ok: true, status: result.status });
}

// Dev-mode helper used by the diagnostics drawer + smoke. Returns
// the recent log entries for the scoped tenant.
export async function handleListFormWebhookLog(
  _req: Request,
  ctx: PluginCtx,
): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const entries = await readFormWebhookLog(
    ctx.storage, scope.agencyId, scope.clientId,
  );
  return ok({ entries });
}

// Resolution preview helper for the editor "Submit to" dropdown.
// Walks every page in the scoped tenant's sites collecting webhook
// targets so the editor inspector can list them.
export async function listAllWebhookTargets(
  ctx: PluginCtx,
  agencyId: string,
  clientId: string,
): Promise<Array<{ pageId: string; pageSlug: string; targetId: string; label: string; url: string }>> {
  const out: Array<{ pageId: string; pageSlug: string; targetId: string; label: string; url: string }> = [];
  const sites = await listSites(ctx.storage, agencyId, clientId);
  for (const site of sites) {
    const pages = await listPages(ctx.storage, agencyId, clientId, site.id);
    for (const p of pages) {
      const tree = (p.blocks ?? []) as BlockTreeJSON;
      const walk = (blocks: typeof tree): void => {
        for (const b of blocks) {
          if (b.type === "webhook-target") {
            const props = (b.props ?? {}) as Record<string, unknown>;
            const url = typeof props.url === "string" ? props.url : "";
            if (url.length > 0 && props.disabled !== true) {
              out.push({
                pageId: p.id,
                pageSlug: p.slug,
                targetId: b.id,
                label: typeof props.label === "string" ? props.label : url,
                url,
              });
            }
          }
          if (b.children && b.children.length) walk(b.children);
        }
      };
      walk(tree);
    }
  }
  return out;
}
