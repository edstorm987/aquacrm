// Containment isolation suite — proves the assume-breach posture with REAL
// per-user JWTs against the LOCAL stack's PostgREST and Storage APIs.
//
// Two tenants (agency-one, agency-two); four authenticated identities:
//   ownerA  — profile role 'owner', agency-one   (the strongest browser identity)
//   staffB  — profile role 'staff', agency-two
//   clientC — profile role 'client'
//   staffD  — profile role 'staff', no agency     (the pre-stamp steady state)
// plus the anonymous key.
//
// The old posture let ANY of A/B/D read and rewrite every tenant's PortalState
// (app_datastores), every profile, the cross-agency audit log, all enquiries
// and all eight storage buckets. Every one of those paths must now be DENIED,
// while the public website reads, the consented anonymous enquiry INSERT, the
// own-row profile read (milesymedia login) and the service-role server paths
// keep working.
//
// Run via run-containment-tests.sh (local stack + db reset first).

import assert from "node:assert/strict";
import test from "node:test";

const URL_BASE = process.env.SUPABASE_LOCAL_URL;
const ANON = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE = process.env.SUPABASE_LOCAL_SERVICE_KEY;
if (!URL_BASE || !ANON || !SERVICE) {
  throw new Error("run via run-containment-tests.sh (needs SUPABASE_LOCAL_URL/ANON_KEY/SERVICE_KEY)");
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_BASE)) {
  throw new Error(`refusing non-local Supabase URL: ${URL_BASE}`);
}

const users = {
  ownerA: { email: "owner-a@tenant-one.test", password: "containment-A-2026!", role: "owner", agency: "agency-one" },
  staffB: { email: "staff-b@tenant-two.test", password: "containment-B-2026!", role: "staff", agency: "agency-two" },
  clientC: { email: "client-c@tenant-one.test", password: "containment-C-2026!", role: "client", agency: null },
  staffD: { email: "staff-d@unstamped.test", password: "containment-D-2026!", role: "staff", agency: null },
};

async function svc(path, init = {}) {
  return fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function asUser(token, path, init = {}) {
  return fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function asAnon(path, init = {}) {
  return fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

/** PostgREST expresses "no privilege" as 401/403/404 with code 42501; RLS filtering as empty rows. Denied = no data escaped AND no write landed. */
function expectDenied(status, body, label) {
  const deniedStatus = status === 401 || status === 403 || status === 404;
  const emptyRead = status === 200 && Array.isArray(body) && body.length === 0;
  assert.ok(deniedStatus || emptyRead, `${label}: expected denial, got ${status} ${JSON.stringify(body).slice(0, 200)}`);
}
function expectHardDenied(status, body, label) {
  assert.ok(status === 401 || status === 403 || status === 404,
    `${label}: expected hard privilege denial (401/403/404), got ${status} ${JSON.stringify(body).slice(0, 200)}`);
}

const tokens = {};
const uids = {};

test("setup: seed tenants, users and artifacts via the service role", async () => {
  // Users (idempotent-ish: delete first by listing).
  const list = await (await svc("/auth/v1/admin/users?per_page=200")).json();
  for (const u of list?.users ?? []) {
    if (Object.values(users).some(x => x.email === u.email)) {
      await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  for (const [key, def] of Object.entries(users)) {
    const created = await svc("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: def.email, password: def.password, email_confirm: true }),
    });
    const payload = await created.json();
    assert.equal(created.status, 200, `create ${key}: ${JSON.stringify(payload).slice(0, 200)}`);
    uids[key] = payload.id;
    // Profile row: the auth trigger creates it; stamp role/agency via service role.
    const up = await svc(`/rest/v1/profiles?id=eq.${payload.id}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ role: def.role, agency_id: def.agency, full_name: key }),
    });
    const rows = await up.json();
    assert.equal(up.status, 200, `stamp profile ${key}`);
    assert.equal(rows.length, 1, `profile row exists for ${key} (auth trigger)`);
  }
  // Sign in each user with the password grant → real authenticated JWTs.
  for (const [key, def] of Object.entries(users)) {
    const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ email: def.email, password: def.password }),
    });
    const payload = await res.json();
    assert.equal(res.status, 200, `login ${key}: ${JSON.stringify(payload).slice(0, 160)}`);
    tokens[key] = payload.access_token;
  }

  // Tenant data. The PortalState sentinel is the crown jewel.
  const ds = await svc("/rest/v1/app_datastores", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ app_key: "aquacrm-portal-state", data: { sentinel: "TENANT-SECRETS", tenants: ["agency-one", "agency-two"] } }),
  });
  assert.ok(ds.status === 201 || ds.status === 200, `seed datastore: ${ds.status}`);

  for (const [agency, msg] of [["agency-one", "t1-secret-enquiry"], ["agency-two", "t2-secret-enquiry"]]) {
    const enq = await svc("/rest/v1/brand_enquiries", {
      method: "POST",
      body: JSON.stringify({ brand_slug: "aquacrm", name: `Seed ${agency}`, email: `seed@${agency}.test`, consent: true, message: msg, agency_id: agency }),
    });
    assert.equal(enq.status, 201, `seed enquiry ${agency}`);
  }

  const audit = await svc("/rest/v1/audit_events", {
    method: "POST",
    body: JSON.stringify({ event_type: "seed", event_summary: "containment-harness" }),
  });
  assert.equal(audit.status, 201, "seed audit event");

  // Storage: one private object per app bucket flavour + one public object.
  for (const [bucket, path] of [
    ["aquacrm-uploads", "tenants/agency-one/secret.txt"],
    ["milesymedia-uploads", `${"0".repeat(8)}-cross/app.txt`],
  ]) {
    const up = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "text/plain", "x-upsert": "true" },
      body: `PRIVATE:${bucket}`,
    });
    assert.ok(up.status === 200 || up.status === 201, `seed private object ${bucket}: ${up.status} ${await up.text()}`);
  }
  // The public bucket's MIME allowlist has no text type; declare PNG. (That a
  // declared MIME with arbitrary bytes is accepted is itself the Phase-2
  // content-trust finding — storage validates declarations, not content.)
  const pub = await fetch(`${URL_BASE}/storage/v1/object/aquacrm-public/site/logo.png`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "image/png", "x-upsert": "true" },
    body: "PUBLIC-ASSET",
  });
  assert.ok(pub.status === 200 || pub.status === 201, `seed public object: ${pub.status}`);
});

// ─── app_datastores: nobody but the service role ───────────────────────────

for (const who of ["ownerA", "staffB", "clientC", "staffD"]) {
  test(`app_datastores: ${who} cannot read any tenant state`, async () => {
    const res = await asUser(tokens[who], "/rest/v1/app_datastores?select=*");
    const body = await res.json().catch(() => null);
    expectHardDenied(res.status, body, `app_datastores SELECT as ${who}`);
    assert.ok(!JSON.stringify(body ?? "").includes("TENANT-SECRETS"), `no sentinel leak to ${who}`);
  });
  test(`app_datastores: ${who} cannot write tenant state`, async () => {
    const res = await asUser(tokens[who], "/rest/v1/app_datastores?app_key=eq.aquacrm-portal-state", {
      method: "PATCH",
      body: JSON.stringify({ data: { poisoned: true } }),
    });
    const body = await res.json().catch(() => null);
    expectHardDenied(res.status, body, `app_datastores PATCH as ${who}`);
  });
}
test("app_datastores: anon fully denied", async () => {
  const res = await asAnon("/rest/v1/app_datastores?select=*");
  expectHardDenied(res.status, await res.json().catch(() => null), "app_datastores SELECT as anon");
});
test("app_datastores: sentinel unchanged after write attempts", async () => {
  const res = await svc("/rest/v1/app_datastores?app_key=eq.aquacrm-portal-state&select=data");
  const rows = await res.json();
  assert.equal(rows[0]?.data?.sentinel, "TENANT-SECRETS", "state untouched");
  assert.ok(!("poisoned" in (rows[0]?.data ?? {})), "no poisoned write landed");
});

// ─── profiles: own row only, no writes, no self-promotion ──────────────────

test("profiles: ownerA sees exactly one row — their own", async () => {
  const res = await asUser(tokens.ownerA, "/rest/v1/profiles?select=id,role,full_name");
  const rows = await res.json();
  assert.equal(res.status, 200);
  assert.equal(rows.length, 1, `expected own row only, got ${rows.length}`);
  assert.equal(rows[0].id, uids.ownerA);
});
test("profiles: staffD cannot enumerate other profiles", async () => {
  const res = await asUser(tokens.staffD, `/rest/v1/profiles?id=eq.${uids.ownerA}&select=*`);
  const rows = await res.json();
  expectDenied(res.status, rows, "cross-profile read");
});
test("profiles: staffB cannot promote themselves to owner", async () => {
  const res = await asUser(tokens.staffB, `/rest/v1/profiles?id=eq.${uids.staffB}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "owner" }),
  });
  expectHardDenied(res.status, await res.json().catch(() => null), "self-promotion");
  const check = await svc(`/rest/v1/profiles?id=eq.${uids.staffB}&select=role`);
  assert.equal((await check.json())[0].role, "staff", "role unchanged");
});
test("profiles: ownerA cannot edit anyone (writes are server-mediated)", async () => {
  const res = await asUser(tokens.ownerA, `/rest/v1/profiles?id=eq.${uids.clientC}`, {
    method: "PATCH",
    body: JSON.stringify({ full_name: "owned" }),
  });
  expectHardDenied(res.status, await res.json().catch(() => null), "owner profile write");
});

// ─── brand_enquiries: FULLY SERVER-MEDIATED (corrective 20260908220000) ─────
// After the corrective migration browser roles have NO direct table access at
// all — not even INSERT. Public capture is server-mediated: the site forms and
// the Aqua tag POST to /api/public/brand-enquiry, which INSERTs via the service
// role behind rate limits. Internal triage is likewise service-role, with tenant
// ownership enforced in server code (loadOwnedEnquiry) — proven at the app layer
// by scripts/smoke-enquiry-tenant-isolation.test.ts. Here we prove the DB posture.

for (const who of ["ownerA", "staffB", "staffD"]) {
  test(`brand_enquiries: ${who} cannot read any tenant's enquiries`, async () => {
    const res = await asUser(tokens[who], "/rest/v1/brand_enquiries?select=message,agency_id");
    const body = await res.json().catch(() => null);
    expectHardDenied(res.status, body, `enquiry SELECT as ${who}`);
    assert.ok(!JSON.stringify(body ?? "").includes("secret-enquiry"), "no enquiry leak");
  });
}
for (const who of ["ownerA", "staffB", "staffD"]) {
  test(`brand_enquiries: ${who} cannot UPDATE or DELETE any enquiry`, async () => {
    const upd = await asUser(tokens[who], "/rest/v1/brand_enquiries?agency_id=eq.agency-one", {
      method: "PATCH", body: JSON.stringify({ message: "tampered" }),
    });
    expectHardDenied(upd.status, await upd.json().catch(() => null), `enquiry UPDATE as ${who}`);
    const del = await asUser(tokens[who], "/rest/v1/brand_enquiries?agency_id=eq.agency-one", { method: "DELETE" });
    expectHardDenied(del.status, await del.json().catch(() => null), `enquiry DELETE as ${who}`);
  });
}
test("brand_enquiries: anon INSERT is now DENIED (capture is server-mediated)", async () => {
  // The base migration kept a consented anon INSERT; the corrective migration
  // removes it because every real capture path already inserts via the service
  // role. A direct anonymous PostgREST INSERT must be refused.
  const res = await asAnon("/rest/v1/brand_enquiries", {
    method: "POST",
    body: JSON.stringify({ brand_slug: "aquacrm", name: "Visitor", email: "v@example.test", consent: true }),
  });
  assert.ok(res.status >= 400, `anon direct insert must be refused, got ${res.status} ${await res.text()}`);
});
test("brand_enquiries: authenticated INSERT is denied too", async () => {
  const res = await asUser(tokens.ownerA, "/rest/v1/brand_enquiries", {
    method: "POST",
    body: JSON.stringify({ brand_slug: "aquacrm", name: "Staff", email: "s@example.test", consent: true }),
  });
  assert.ok(res.status >= 400, `authenticated direct insert must be refused, got ${res.status}`);
});
test("brand_enquiries: anon cannot read submissions back", async () => {
  const res = await asAnon("/rest/v1/brand_enquiries?select=*");
  expectHardDenied(res.status, await res.json().catch(() => null), "anon enquiry read");
});
test("brand_enquiries: the SERVER-MEDIATED (service-role) path still does full CRUD", async () => {
  // This is the path the internal routes use via createEnquiryDataClient. It
  // must keep working after the full chain, or enquiry management breaks.
  const created = await svc("/rest/v1/brand_enquiries", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ brand_slug: "aquacrm", name: "SR", email: "sr@example.test", consent: true, message: "sr-roundtrip", agency_id: "agency-one" }),
  });
  assert.equal(created.status, 201, `service-role insert: ${created.status} ${await created.clone().text()}`);
  const [row] = await created.json();
  const read = await svc(`/rest/v1/brand_enquiries?id=eq.${row.id}&select=message`);
  assert.equal((await read.json())[0]?.message, "sr-roundtrip", "service-role read");
  const upd = await svc(`/rest/v1/brand_enquiries?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ message: "sr-updated" }) });
  assert.ok(upd.status < 300, `service-role update: ${upd.status}`);
  const del = await svc(`/rest/v1/brand_enquiries?id=eq.${row.id}`, { method: "DELETE" });
  assert.ok(del.status < 300, `service-role delete: ${del.status}`);
});

// ─── audit + consent logs: service role only ───────────────────────────────

test("audit_events: ownerA cannot read or write the audit log", async () => {
  const read = await asUser(tokens.ownerA, "/rest/v1/audit_events?select=*");
  expectHardDenied(read.status, await read.json().catch(() => null), "audit read");
  const write = await asUser(tokens.ownerA, "/rest/v1/audit_events", {
    method: "POST",
    body: JSON.stringify({ event_type: "forged", event_summary: "forged" }),
  });
  expectHardDenied(write.status, await write.json().catch(() => null), "audit write");
});
test("website_consent_events: browser roles denied", async () => {
  const res = await asUser(tokens.ownerA, "/rest/v1/website_consent_events?select=*");
  expectHardDenied(res.status, await res.json().catch(() => null), "consent events read");
});

// ─── public website content: reads preserved, writes denied ────────────────

test("brands: anonymous public read still works", async () => {
  const res = await asAnon("/rest/v1/brands?select=slug,name");
  const rows = await res.json();
  assert.equal(res.status, 200);
  assert.ok(rows.length >= 1, "brand metadata readable");
});
test("brands: ownerA cannot write brands", async () => {
  const res = await asUser(tokens.ownerA, "/rest/v1/brands", {
    method: "POST",
    body: JSON.stringify({ slug: "evil", name: "Evil" }),
  });
  expectHardDenied(res.status, await res.json().catch(() => null), "brand write");
});

// ─── legacy client tables: membership reads only ───────────────────────────

test("clients: unrelated authenticated user sees nothing and writes nothing", async () => {
  const read = await asUser(tokens.staffD, "/rest/v1/clients?select=*");
  expectDenied(read.status, await read.json().catch(() => null), "clients read");
  const write = await asUser(tokens.staffD, "/rest/v1/clients", {
    method: "POST",
    body: JSON.stringify({ display_name: "smuggled" }),
  });
  expectHardDenied(write.status, await write.json().catch(() => null), "clients write");
});

// ─── storage: private buckets server-mediated; public read preserved ───────

for (const who of ["ownerA", "staffB"]) {
  test(`storage: ${who} cannot read another app's private object`, async () => {
    const res = await asUser(tokens[who], "/storage/v1/object/milesymedia-uploads/00000000-cross/app.txt");
    assert.ok(res.status >= 400, `cross-app private read as ${who}: ${res.status}`);
  });
  test(`storage: ${who} cannot read AquaCRM private uploads directly`, async () => {
    const res = await asUser(tokens[who], "/storage/v1/object/aquacrm-uploads/tenants/agency-one/secret.txt");
    assert.ok(res.status >= 400, `private read as ${who}: ${res.status}`);
  });
  test(`storage: ${who} cannot write into any bucket`, async () => {
    for (const target of [`aquacrm-uploads/${uids[who]}/x.txt`, `zimante-group-uploads/${uids[who]}/x.txt`, "aquacrm-public/site/defaced.txt"]) {
      const res = await fetch(`${URL_BASE}/storage/v1/object/${target}`, {
        method: "POST",
        headers: { apikey: ANON, authorization: `Bearer ${tokens[who]}`, "content-type": "text/plain" },
        body: "smuggled",
      });
      assert.ok(res.status >= 400, `write ${target} as ${who}: ${res.status}`);
    }
  });
}
test("storage: public bucket read works for anon and authenticated", async () => {
  const anonRead = await asAnon("/storage/v1/object/aquacrm-public/site/logo.png");
  assert.equal(anonRead.status, 200, `anon public read: ${anonRead.status}`);
  assert.equal(await anonRead.text(), "PUBLIC-ASSET");
  const authRead = await asUser(tokens.clientC, "/storage/v1/object/aquacrm-public/site/logo.png");
  assert.equal(authRead.status, 200, `authenticated public read: ${authRead.status}`);
});

// ─── intended server workflows keep working ────────────────────────────────

test("service role: datastore patch RPC still works (portal write path)", async () => {
  const res = await svc("/rest/v1/rpc/apply_app_datastore_patch", {
    method: "POST",
    body: JSON.stringify({
      p_app_key: "aquacrm-portal-state",
      p_operation_id: globalThis.crypto.randomUUID(),
      p_operations: [{ op: "set", path: ["harness"], value: "ok" }],
    }),
  });
  assert.ok(res.status === 200 || res.status === 204, `patch rpc: ${res.status} ${await res.text()}`);
  const check = await svc("/rest/v1/app_datastores?app_key=eq.aquacrm-portal-state&select=data");
  assert.equal((await check.json())[0]?.data?.harness, "ok", "patch applied");
});
test("service role: private storage round-trip still works (portal file path)", async () => {
  const res = await fetch(`${URL_BASE}/storage/v1/object/aquacrm-uploads/tenants/agency-one/secret.txt`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
  assert.equal(res.status, 200, `service private read: ${res.status}`);
  assert.equal(await res.text(), "PRIVATE:aquacrm-uploads");
});
test("milesymedia login path: own-row profile read works", async () => {
  const res = await asUser(tokens.clientC, `/rest/v1/profiles?id=eq.${uids.clientC}&select=full_name,role`);
  const rows = await res.json();
  assert.equal(res.status, 200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role, "client");
});
test("service role: profile administration still works (server routes)", async () => {
  const res = await svc(`/rest/v1/profiles?id=eq.${uids.clientC}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ full_name: "Server Managed" }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json())[0].full_name, "Server Managed");
});
