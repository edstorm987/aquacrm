// ═══════════════════════════════════════════════════════════════════════════
// aqua-form-submit — client-owned Supabase Edge Function (Deno).
//
// The ONLY endpoint an exported Aqua static site posts to. It runs in the
// CLIENT'S own Supabase project. The exported page carries just this function's
// URL and a PUBLIC form id (plus a public Turnstile site key) — never a table,
// key, or secret. This function validates the submission and inserts it with the
// project's SERVICE-ROLE client (that credential is read from the function's env
// and never leaves this runtime), then notifies Aqua with a signed POINTER only
// (the new submission id, not the body).
//
// Everything here is fail-closed: an unknown/disabled form, an inactive link, a
// failed CAPTCHA, an oversize/unknown/PAN-bearing field, or a rate-limit breach
// all return a generic failure and write nothing.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// The pure security logic (PAN screening, the strict field allowlist, HMAC/hash)
// lives in _shared so it can be tested in Node without a Deno runtime.
import { hmacHex, sha256Hex, validateSubmission } from "../_shared/intake-logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IP_HASH_SALT = Deno.env.get("AQUA_INTAKE_IP_SALT") ?? "aqua-intake";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// A single generic error the outside world ever sees. Never leaks WHY.
const GENERIC = { ok: false, error: "This form could not be submitted." };

function json(body: unknown, status: number, origin: string | null): Response {
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  if (origin) { headers["access-control-allow-origin"] = origin; headers["vary"] = "Origin"; }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin ?? "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } });
  }
  if (req.method !== "POST") return json(GENERIC, 405, origin);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(GENERIC, 503, origin);

  // Bound the request body before parsing (defends allocation).
  const rawBytes = new Uint8Array(await req.arrayBuffer());
  if (rawBytes.length > 262144) return json(GENERIC, 413, origin);
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder().decode(rawBytes)) as Record<string, unknown>; }
  catch { return json(GENERIC, 400, origin); }

  const formId = typeof body.formId === "string" ? body.formId : "";
  if (!formId) return json(GENERIC, 400, origin);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Config + link lookup (server-side mapping; the caller never names a table) ──
  const { data: config } = await db.schema("aqua_intake").from("form_configs").select("*").eq("form_id", formId).maybeSingle();
  if (!config || config.intake_enabled !== true) return json(GENERIC, 403, origin);
  const { data: link } = await db.schema("aqua_intake").from("link").select("*").eq("site_id", config.site_id).maybeSingle();
  if (!link || link.active !== true) return json(GENERIC, 403, origin);

  // ── Origin allowlist — defence-in-depth ONLY, never the authentication ──
  const allowedOrigins: string[] = Array.isArray(config.allowed_origins) ? config.allowed_origins : [];
  if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) return json(GENERIC, 403, origin);

  // ── Honeypot: a hidden field that a human never fills ──
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true }, 200, origin);

  // ── Server-verified Turnstile ──
  if (config.turnstile_secret) {
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    if (!token) return json(GENERIC, 400, origin);
    try {
      const form = new FormData();
      form.append("secret", config.turnstile_secret);
      form.append("response", token);
      const verify = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
      const outcome = await verify.json() as { success?: boolean };
      if (!outcome.success) return json(GENERIC, 403, origin);
    } catch { return json(GENERIC, 503, origin); }
  }

  // ── Coarse IP hash (never store a raw IP) + rate limit / quota ──
  const fwd = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = await sha256Hex(`${IP_HASH_SALT}:${config.form_id}:${fwd}`);
  const windowStart = new Date(Date.now() - Number(config.window_seconds) * 1000).toISOString();
  const { count: recent } = await db.schema("aqua_intake").from("rate_events")
    .select("*", { count: "exact", head: true }).eq("form_id", formId).gte("occurred_at", windowStart);
  if ((recent ?? 0) >= Number(config.max_per_window)) return json(GENERIC, 429, origin);
  await db.schema("aqua_intake").from("rate_events").insert({ form_id: formId, ip_hash: ipHash });

  // ── Strict field allowlist: fixed keys, types, lengths, total bytes; unknown
  //    keys rejected; PAN screened out before anything is stored. The check is
  //    the shared, Node-tested `validateSubmission` — one place, one behaviour. ──
  const allowed = Array.isArray(config.allowed_fields) ? config.allowed_fields : [];
  const submitted = (body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)) ? body.fields as Record<string, unknown> : {};
  const validated = validateSubmission(allowed, submitted, Number(config.max_total_bytes));
  if (!validated.ok) return json(GENERIC, validated.status, origin);
  const clean = validated.clean;

  // ── Database-backed idempotency: identical replays collapse to one row ──
  const idem = typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8 && body.idempotencyKey.length <= 200
    ? body.idempotencyKey
    : crypto.randomUUID();

  const { data: inserted, error: insertErr } = await db.schema("aqua_intake").from("form_submissions")
    .insert({ form_id: formId, site_id: config.site_id, fields: clean, idempotency_key: idem, submitter_ip_hash: ipHash })
    .select("id").single();

  let submissionId: string;
  if (insertErr) {
    // Unique-violation on (form_id, idempotency_key) → the earlier row IS the answer.
    const { data: existing } = await db.schema("aqua_intake").from("form_submissions")
      .select("id").eq("form_id", formId).eq("idempotency_key", idem).maybeSingle();
    if (!existing) return json(GENERIC, 503, origin);
    submissionId = existing.id;
  } else {
    submissionId = inserted!.id;
    // ── Signed POINTER webhook to Aqua: the id, never the body. Failure here is
    //    non-fatal to the submitter (Aqua reconciles) and never leaks details. ──
    try {
      const ts = Date.now().toString();
      const payload = JSON.stringify({ connectionId: link.aqua_connection_id, rowKey: "id", rowId: submissionId, ts });
      const signature = await hmacHex(link.webhook_secret, `${ts}.${payload}`);
      await fetch(link.aqua_webhook_url, { method: "POST", headers: { "content-type": "application/json", "x-aqua-timestamp": ts, "x-aqua-signature": signature }, body: payload });
    } catch { /* pointer delivery is best-effort; the row stands */ }
  }

  return json({ ok: true, id: submissionId }, 200, origin);
});
