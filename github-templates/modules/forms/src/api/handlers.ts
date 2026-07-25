// HTTP handlers for the forms plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CreateFormInput,
  CreateTemplateInput,
  RecordSubmissionInput,
  UpdateFormPatch,
  UpdateSubmissionPatch,
} from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const unprocessable = (m: string): Response => json({ ok: false, error: m }, 422);
function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });

// ─── Forms (admin) ───────────────────────────────────────────────────────

export async function listFormsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  return json({
    ok: true,
    forms: await buildContainer(ctx).forms.list({
      status: (url.searchParams.get("status") ?? undefined) as never,
      query: url.searchParams.get("q") ?? undefined,
    }),
  });
}

export async function createFormHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateFormInput>(req);
  if (!body || !body.name || !body.fields || !body.submitAction) {
    return badRequest("name + fields + submitAction required.");
  }
  try {
    const form = await buildContainer(ctx).forms.create(body, ctx.actor);
    return json({ ok: true, form }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateFormHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateFormPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const form = await buildContainer(ctx).forms.update(body.id, body.patch ?? {}, ctx.actor);
    return form ? json({ ok: true, form }) : notFound("form not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteFormHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  try {
    const ok = await buildContainer(ctx).forms.delete(id, ctx.actor);
    return ok ? json({ ok: true }) : notFound("form not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function publishFormHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const form = await buildContainer(ctx).forms.publish(body.id, ctx.actor);
    return form ? json({ ok: true, form }) : notFound("form not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Submissions (admin) ─────────────────────────────────────────────────

export async function listSubmissionsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  return json({
    ok: true,
    submissions: await buildContainer(ctx).submissions.list({
      formId: url.searchParams.get("formId") ?? undefined,
      status: (url.searchParams.get("status") ?? undefined) as never,
    }),
  });
}

export async function updateSubmissionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateSubmissionPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  const out = await buildContainer(ctx).submissions.update(body.id, body.patch ?? {}, ctx.actor);
  return out ? json({ ok: true, submission: out }) : notFound("submission not found");
}

export async function deleteSubmissionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const ok = await buildContainer(ctx).submissions.delete(id, ctx.actor);
  return ok ? json({ ok: true }) : notFound("submission not found");
}

// ─── Templates (admin) ───────────────────────────────────────────────────

export async function listTemplatesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, templates: await buildContainer(ctx).templates.list() });
}

export async function createTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateTemplateInput>(req);
  if (!body?.name || !body.fields || !body.submitAction) {
    return badRequest("name + fields + submitAction required.");
  }
  try {
    const tpl = await buildContainer(ctx).templates.create(body, ctx.actor);
    return json({ ok: true, template: tpl }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// Instantiate a form from a template — copies fields + submitAction
// into a new draft Form.
export async function formFromTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ templateId: string; name?: string }>(req);
  if (!body?.templateId) return badRequest("templateId required.");
  const c = buildContainer(ctx);
  const tpl = await c.templates.get(body.templateId);
  if (!tpl) return notFound("template not found");
  try {
    const form = await c.forms.create({
      name: body.name ?? tpl.name,
      description: tpl.description,
      fields: tpl.fields,
      submitAction: tpl.submitAction,
    }, ctx.actor);
    return json({ ok: true, form }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Public submit + render endpoints (no auth) ─────────────────────────

export async function publicSubmitHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  // The catch-all dispatcher passes the formId via the URL after the
  // plugin's mount path. We recover it from the request URL.
  const url = new URL(req.url);
  const m = url.pathname.match(/\/public\/submit\/([^/]+)$/);
  const formId = m?.[1];
  if (!formId) return badRequest("formId required in URL.");
  const body = await safeJson<RecordSubmissionInput>(req);
  if (!body || !body.values) return badRequest("values required.");

  const c = buildContainer(ctx);
  const result = await c.submissions.record({
    ...body,
    formId,
    meta: {
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      submittedAt: body.meta?.submittedAt,
    },
  });
  if (!result.ok) {
    return json({ ok: false, errors: result.errors }, 422);
  }
  // Best-effort notification dispatch — failure shouldn't block the
  // submitter's response.
  const form = await c.forms.getPublishedForm(formId);
  if (form) {
    await c.notifications.dispatch(form, result.submission);
  }
  return json({
    ok: true,
    duplicate: result.duplicate,
    submissionId: result.submission.id,
    submitAction: form?.submitAction ?? null,
  });
}

export async function publicFormHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const m = url.pathname.match(/\/public\/form\/([^/]+)$/);
  const formId = m?.[1];
  if (!formId) return badRequest("formId required in URL.");
  const form = await buildContainer(ctx).forms.getPublishedForm(formId);
  if (!form) return notFound("form not found or not published");
  // Strip server-only metadata from the public view.
  return json({
    ok: true,
    form: {
      id: form.id,
      name: form.name,
      description: form.description,
      fields: form.fields,
      submitAction: form.submitAction.kind === "external-webhook"
        ? { kind: form.submitAction.kind, redirectUrl: form.submitAction.redirectUrl, thankYouMessage: form.submitAction.thankYouMessage }
        : form.submitAction,
    },
  });
}
