// ═══════════════════════════════════════════════════════════════════════════
// aqua-form-read — client-owned Supabase Edge Function (Deno).
//
// The bounded, server-to-server read Aqua uses to fetch ONE submission on
// demand — replacing the old anonymous PostgREST SELECT (which required the
// public key to have table SELECT, contradicting the INSERT-only/no-access RLS).
// There is NO anon access to the table; only this function (service role) reads
// it, and only after verifying Aqua's request with the per-site READ secret
// (distinct from the webhook secret), a fresh timestamp, and a single-use nonce.
// It returns exactly one row's ALLOWLISTED fields, never the whole row.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// Shared, Node-tested HMAC + constant-time compare — the same code the intake
// function uses, so the read secret is verified identically on both sides.
import { hmacHex, timingSafeEqualHex } from "../_shared/intake-logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_SKEW_MS = 300_000; // 5 minutes
const GENERIC = { ok: false, error: "unavailable" };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(GENERIC, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(GENERIC, 503);

  const rawBytes = new Uint8Array(await req.arrayBuffer());
  if (rawBytes.length > 8192) return json(GENERIC, 413);
  const rawText = new TextDecoder().decode(rawBytes);
  let body: { siteId?: unknown; submissionId?: unknown; ts?: unknown; nonce?: unknown; signature?: unknown };
  try { body = JSON.parse(rawText); } catch { return json(GENERIC, 400); }

  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
  const ts = typeof body.ts === "string" ? body.ts : "";
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!siteId || !submissionId || !ts || !nonce || !signature) return json(GENERIC, 400);
  if (nonce.length < 16 || nonce.length > 200) return json(GENERIC, 400);

  // Fresh timestamp (bounded skew) BEFORE any DB work.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) return json(GENERIC, 401);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: link } = await db.schema("aqua_intake").from("link").select("read_secret, active").eq("site_id", siteId).maybeSingle();
  if (!link || link.active !== true || !link.read_secret) return json(GENERIC, 403);

  // Verify Aqua's HMAC over (ts.nonce.submissionId) with the READ secret.
  const expected = await hmacHex(link.read_secret, `${ts}.${nonce}.${submissionId}`);
  if (!timingSafeEqualHex(signature, expected)) return json(GENERIC, 401);

  // Single-use nonce: first insert wins; a replay hits the unique PK and is refused.
  const { error: nonceErr } = await db.schema("aqua_intake").from("read_nonces").insert({ nonce });
  if (nonceErr) return json(GENERIC, 401); // replay (or a genuine collision) — refuse

  const { data: submission } = await db.schema("aqua_intake").from("form_submissions")
    .select("id, form_id, fields, created_at").eq("id", submissionId).maybeSingle();
  if (!submission) return json({ ok: true, status: "missing" }, 200);

  // Return ONLY the fields the form's allowlist declares — never the raw row.
  const { data: config } = await db.schema("aqua_intake").from("form_configs")
    .select("allowed_fields, site_id").eq("form_id", submission.form_id).maybeSingle();
  if (!config || config.site_id !== siteId) return json(GENERIC, 403); // cross-site guard
  const allowedKeys = new Set((Array.isArray(config.allowed_fields) ? config.allowed_fields : []).map((f: { key: string }) => f.key));
  const rawFields = (submission.fields && typeof submission.fields === "object") ? submission.fields as Record<string, unknown> : {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (allowedKeys.has(k) && typeof v === "string") fields[k] = v;
  }

  return json({ ok: true, status: "ok", submission: { id: submission.id, createdAt: submission.created_at, fields } }, 200);
});
