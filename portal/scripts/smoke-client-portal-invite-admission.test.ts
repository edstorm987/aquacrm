// Client-portal admission is a capability, not knowledge of a client id.
//
// These regressions drive the real public signup, magic request, magic verify,
// protected setup, and authenticated invitation-issuer route handlers. They
// pin the exploit boundary that matters: no caller-selected clientId can create
// a membership or session, while an exact, purpose-bound invitation still can.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { after, before, beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "client-portal-invite-admission-secret";
process.env.NODE_ENV = "test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");
type Auth = typeof import("../src/lib/server/auth/auth");
type Magic = typeof import("../src/lib/server/auth/magicLink");
type Nonces = typeof import("../src/lib/server/auth/nonceStore");
type SignupRoute = typeof import("../src/app/api/auth/end-customer/signup/route");
type RequestRoute = typeof import("../src/app/api/auth/magic/request/route");
type VerifyRoute = typeof import("../src/app/api/auth/magic/verify/route");
type SetupRoute = typeof import("../src/app/api/portal/customer/setup/route");
type ControlRoute = typeof import("../src/app/api/tenants/customer-portal-control/route");
type LoginRoute = typeof import("../src/app/api/auth/login/route");
type SupabaseAdmin = typeof import("../src/lib/supabase/admin");

let storage: Storage;
let tenants: Tenants;
let users: Users;
let auth: Auth;
let magic: Magic;
let nonces: Nonces;
let signupRoute: SignupRoute;
let requestRoute: RequestRoute;
let verifyRoute: VerifyRoute;
let setupRoute: SetupRoute;
let controlRoute: ControlRoute;
let loginRoute: LoginRoute;
let supabaseAdmin: SupabaseAdmin;
let supabaseServer: Server | undefined;

interface StubSupabaseUser {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  factors: unknown[];
  passwordMarker?: string;
}

let remoteUsers: StubSupabaseUser[] = [];
let remoteCreates = 0;
let remotePasswordUpdates = 0;

const ORIGIN = "http://localhost:3099";
const savedEnv: Record<string, string | undefined> = {};
let ipSequence = 10;

async function startAbsentSupabaseAdmin(): Promise<string> {
  supabaseServer = createServer(async (req, res) => {
    const pathname = req.url?.split("?")[0] ?? "";
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const readBody = async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      return chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
        : {};
    };

    if (pathname === "/auth/v1/admin/users" && req.method === "GET") {
      return send(200, { users: remoteUsers, aud: "authenticated" });
    }
    if (pathname === "/auth/v1/admin/users" && req.method === "POST") {
      remoteCreates += 1;
      const body = await readBody();
      const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
      if (remoteUsers.some(user => user.email.toLowerCase() === email)) {
        return send(422, { code: "email_exists", msg: "A user with this email already exists" });
      }
      const created: StubSupabaseUser = {
        id: crypto.randomUUID(),
        email,
        app_metadata: typeof body.app_metadata === "object" && body.app_metadata
          ? body.app_metadata as Record<string, unknown>
          : {},
        user_metadata: typeof body.user_metadata === "object" && body.user_metadata
          ? body.user_metadata as Record<string, unknown>
          : {},
        factors: [],
        passwordMarker: typeof body.password === "string" ? body.password : undefined,
      };
      remoteUsers.push(created);
      return send(200, { user: created });
    }
    const userMatch = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(pathname);
    if (userMatch) {
      const id = decodeURIComponent(userMatch[1]!);
      const found = remoteUsers.find(user => user.id === id);
      if (!found) return send(404, { msg: "User not found" });
      if (req.method === "GET") return send(200, { user: found });
      if (req.method === "PUT") {
        remotePasswordUpdates += 1;
        const body = await readBody();
        if (typeof body.password === "string") found.passwordMarker = body.password;
        return send(200, { user: found });
      }
      if (req.method === "DELETE") {
        remoteUsers = remoteUsers.filter(user => user.id !== id);
        return send(200, { user: found });
      }
    }
    if (pathname === "/auth/v1/token" && req.method === "POST") {
      const body = await readBody();
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const found = remoteUsers.find(user =>
        user.email.toLowerCase() === email && user.passwordMarker === password);
      if (!found) {
        return send(400, {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        });
      }
      return send(200, {
        access_token: "stub-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "stub-refresh-token",
        user: {
          ...found,
          aud: "authenticated",
          role: "authenticated",
          created_at: new Date(0).toISOString(),
        },
      });
    }
    // Supabase profile upsert for a newly-created portal identity.
    if (pathname === "/rest/v1/profiles") {
      if (req.method === "GET") {
        const authHeader = req.headers.authorization ?? "";
        const found = remoteUsers.find(user => authHeader.includes(user.id)) ?? remoteUsers[0];
        return send(200, found ? [{ role: found.app_metadata.aqua_profile_role ?? "client" }] : []);
      }
      return send(200, {});
    }
    return send(200, {});
  });
  await new Promise<void>(resolve => supabaseServer!.listen(0, "127.0.0.1", resolve));
  const address = supabaseServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

before(async () => {
  for (const key of [
    "NEXT_PUBLIC_PORTAL_BASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) savedEnv[key] = process.env[key];

  process.env.NEXT_PUBLIC_PORTAL_BASE_URL = ORIGIN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = await startAbsentSupabaseAdmin();
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-role-key";

  [
    storage,
    tenants,
    users,
    auth,
    magic,
    nonces,
    signupRoute,
    requestRoute,
    verifyRoute,
    setupRoute,
    controlRoute,
    loginRoute,
    supabaseAdmin,
  ] = await Promise.all([
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/lib/server/auth/auth"),
    import("../src/lib/server/auth/magicLink"),
    import("../src/lib/server/auth/nonceStore"),
    import("../src/app/api/auth/end-customer/signup/route"),
    import("../src/app/api/auth/magic/request/route"),
    import("../src/app/api/auth/magic/verify/route"),
    import("../src/app/api/portal/customer/setup/route"),
    import("../src/app/api/tenants/customer-portal-control/route"),
    import("../src/app/api/auth/login/route"),
    import("../src/lib/supabase/admin"),
  ]);
});

after(() => {
  magic.registerMagicLinkDelivery(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  supabaseServer?.close();
});

beforeEach(async () => {
  await storage.reset();
  await nonces._swapStoreForTests(nonces._createMemoryAdapterForTests());
  magic.registerMagicLinkDelivery(null);
  remoteUsers = [];
  remoteCreates = 0;
  remotePasswordUpdates = 0;
});

describe("admin-only Supabase recovery provenance", () => {
  it("rejects forged user_metadata for agency signup, unbound reset, staff, and freelancer adoption", async () => {
    const cases = [
      { label: "agency-signup", role: "owner" as const },
      { label: "unbound-reset", role: "owner" as const },
      { label: "staff", role: "staff" as const },
      { label: "freelancer", role: "client" as const },
    ];
    for (const item of cases) {
      const operationId = `${item.label}-operation`;
      const email = `${item.label}@example.test`;
      remoteUsers = [{
        id: `remote-${item.label}`,
        email,
        app_metadata: {},
        // Every recovery marker is forged in the subject-editable namespace.
        user_metadata: {
          full_name: "Forged Subject",
          aqua_subject_kind: item.role === "owner" ? "agency-owner" : "agency-staff",
          aqua_provisioning_operation_id: operationId,
          aqua_agency_id: "agency-admin-provenance",
          aqua_profile_role: item.role,
        },
        factors: [],
        passwordMarker: "victim-password-before",
      }];
      const updatesBefore = remotePasswordUpdates;
      await assert.rejects(supabaseAdmin.provisionOrAdoptSupabaseIdentity({
        email,
        password: "Attacker-selected-password-123",
        name: "Expected Subject",
        role: item.role,
        agencyId: "agency-admin-provenance",
        operationId,
      }), /was not created by this provisioning operation/);
      assert.equal(remotePasswordUpdates, updatesBefore, item.label);
      assert.equal(remoteUsers[0]?.passwordMarker, "victim-password-before", item.label);
    }
  });

  it("writes operation authority only to app_metadata and adopts only that exact admin marker", async () => {
    const operationId = "legitimate-staff-operation";
    const created = await supabaseAdmin.provisionOrAdoptSupabaseIdentity({
      email: "legitimate-staff@example.test",
      password: "First-password-123",
      name: "Legitimate Staff",
      role: "staff",
      agencyId: "agency-legitimate-staff",
      operationId,
    });
    assert.equal(created.adopted, false);
    const remote = remoteUsers[0]!;
    assert.equal(remote.app_metadata.aqua_subject_kind, "agency-staff");
    assert.equal(remote.app_metadata.aqua_provisioning_operation_id, operationId);
    assert.equal(remote.app_metadata.aqua_agency_id, "agency-legitimate-staff");
    assert.equal(remote.app_metadata.aqua_profile_role, "staff");
    assert.equal(remote.user_metadata.full_name, "Legitimate Staff");
    assert.equal(remote.user_metadata.aqua_provisioning_operation_id, undefined);
    assert.equal(remote.user_metadata.aqua_agency_id, undefined);
    assert.equal(remote.user_metadata.aqua_profile_role, undefined);

    const adopted = await supabaseAdmin.provisionOrAdoptSupabaseIdentity({
      email: remote.email,
      password: "Resumed-password-456",
      name: "Legitimate Staff",
      role: "staff",
      agencyId: "agency-legitimate-staff",
      operationId,
    });
    assert.equal(adopted.adopted, true);
    assert.equal(remotePasswordUpdates, 1);
    assert.equal(remote.passwordMarker, "Resumed-password-456");
  });
});

async function fixture() {
  const agency = tenants.createAgency({ name: "Invite admission agency" });
  const foreignAgency = tenants.createAgency({ name: "Foreign invite agency" });
  const client = tenants.createClient(agency.id, {
    name: "Invited client",
    endCustomers: { signupsEnabled: true, postLoginReturnUrl: "/portal/customer" },
    metadata: { portalBuiltAt: Date.now() },
  });
  const sibling = tenants.createClient(agency.id, {
    name: "Sibling client",
    endCustomers: { signupsEnabled: true },
    metadata: { portalBuiltAt: Date.now() },
  });
  const foreignClient = tenants.createClient(foreignAgency.id, {
    name: "Foreign client",
    endCustomers: { signupsEnabled: true },
    metadata: { portalBuiltAt: Date.now() },
  });
  const owner = users.createUser({
    email: `owner-${agency.id}@invite.test`,
    password: "Owner-access-password",
    role: "agency-owner",
    agencyId: agency.id,
  });
  const ownerToken = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
  // The control route's governance gate deliberately fresh-loads the live
  // realm. Flush the fixture so that check sees the same authoritative rows.
  await storage.flushPendingWrites();
  return { agency, foreignAgency, client, sibling, foreignClient, owner, ownerToken };
}

function publicPost(pathname: string, body: unknown): NextRequest {
  ipSequence += 1;
  return new NextRequest(`${ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${ipSequence}`,
    },
    body: JSON.stringify(body),
  });
}

function verifyRequest(token: string, returnUrl = "/setup"): NextRequest {
  const url = new URL("/api/auth/magic/verify", ORIGIN);
  url.searchParams.set("token", token);
  url.searchParams.set("return", returnUrl);
  return new NextRequest(url, { method: "GET" });
}

function loginRequest(email: string, password: string): NextRequest {
  return publicPost("/api/auth/login", { email, password });
}

function sessionCookieOf(response: Response): string | undefined {
  return response.headers.getSetCookie().find(value => value.startsWith(`${auth.SESSION_COOKIE_NAME}=`));
}

function errorOf(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location, ORIGIN).searchParams.get("magic_error") : null;
}

function exactMember(email: string, clientId: string) {
  return users.getUser(email, { clientId, role: "end-customer" });
}

async function assertNoPortalSession(response: Response): Promise<void> {
  assert.equal(sessionCookieOf(response), undefined, "a refused admission must not mint a cookie");
  const protectedResponse = await setupRoute.POST(new NextRequest(`${ORIGIN}/api/portal/customer/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ password: "A-valid-password-123" }),
  }));
  assert.equal(protectedResponse.status, 401, "without a minted session, client portal routes remain inaccessible");
}

function resignPayload(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.PORTAL_SESSION_SECRET!)
    .update(b64)
    .digest("base64url");
  return `${b64}.${signature}`;
}

function rewriteSignedPayload(token: string, changes: Record<string, unknown>): string {
  const [body, signature] = token.split(".");
  assert.ok(body && signature);
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
  return resignPayload({ ...payload, ...changes });
}

function substituteClaim(token: string, key: "email" | "clientId", value: string): string {
  const [b64, signature] = token.split(".");
  assert.ok(b64 && signature);
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as Record<string, unknown>;
  payload[key] = value;
  return `${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${signature}`;
}

describe("client portal admission", () => {
  it("requires exact JSON and the configured browser Origin before client setup", async () => {
    const home = await fixture();
    const member = users.createUser({
      email: "setup-origin@example.com",
      password: "Before-password-123",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.client.id,
    });
    users.markEmailVerified(member.id);
    const token = auth.issueSession({
      userId: member.id,
      email: member.email,
      role: member.role,
      agencyId: member.agencyId,
      clientId: member.clientId,
      sessionRev: member.sessionRev ?? 0,
      aal: "aal1",
    });
    const invoke = (contentType: string, origin: string) => setupRoute.POST(new NextRequest(
      `${ORIGIN}/api/portal/customer/setup`,
      {
        method: "POST",
        headers: {
          "content-type": contentType,
          origin,
          cookie: `${auth.SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ password: "Chosen-password-456" }),
      },
    ));
    assert.equal((await invoke("text/plain", ORIGIN)).status, 415);
    assert.equal((await invoke("application/jsonp", ORIGIN)).status, 415);
    assert.equal((await invoke("application/json", "https://attacker.example")).status, 403);
    assert.equal(remoteCreates, 0);
    assert.equal(remotePasswordUpdates, 0);
  });

  it("rejects pre-password-change magic and existing-member invite epochs before nonce consumption", async () => {
    const home = await fixture();
    const email = "epoch-bound-member@example.com";
    const member = users.createUser({
      email,
      password: "Before-password-123",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.client.id,
    });
    const magicToken = magic.signMagicToken({
      email,
      clientId: home.client.id,
      agencyId: home.agency.id,
      sessionRev: member.sessionRev ?? 0,
    });
    const inviteToken = magic.signClientPortalInviteToken({
      email,
      clientId: home.client.id,
      agencyId: home.agency.id,
      sessionRev: member.sessionRev ?? 0,
    });
    assert.ok(users.setUserPasswordById(member.id, "After-password-456", member.sessionRev ?? 0));

    assert.equal(errorOf(await verifyRoute.GET(verifyRequest(magicToken.token))), "session_epoch_changed");
    assert.equal(errorOf(await verifyRoute.GET(verifyRequest(inviteToken.token))), "session_epoch_changed");
    assert.equal(await magic.consumeMagicNonce(magicToken.payload.nonce, magicToken.payload.exp), true,
      "epoch rejection occurs before the durable nonce is consumed");
    assert.equal(await magic.consumeClientPortalInviteNonce(inviteToken.payload.nonce, inviteToken.payload.exp), true);
  });

  it("closes direct signup even when an attacker supplies a real active client id", async () => {
    const home = await fixture();
    const email = "attacker-selected-client@invite.test";
    const response = await signupRoute.POST(publicPost("/api/auth/end-customer/signup", {
      clientId: home.client.id,
      email,
      password: "Attacker-password-123",
    }));

    assert.equal(response.status, 403);
    assert.equal(exactMember(email, home.client.id), null);
    await assertNoPortalSession(response);
  });

  it("does not send public magic links or create users for an unknown membership", async () => {
    const home = await fixture();
    const email = "not-a-member@invite.test";
    let deliveries = 0;
    magic.registerMagicLinkDelivery(async () => { deliveries += 1; });

    const response = await requestRoute.POST(publicPost("/api/auth/magic/request", {
      clientId: home.client.id,
      email,
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, sent: true });
    assert.equal(deliveries, 0, "a generic accepted response must not conceal a real delivery");
    assert.equal(exactMember(email, home.client.id), null);
  });

  it("keeps public magic sign-in working for an exact existing membership only", async () => {
    const home = await fixture();
    const email = "registered-customer@invite.test";
    users.createUser({
      email,
      password: "Registered-password-123",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.client.id,
    });
    let deliveredToken = "";
    magic.registerMagicLinkDelivery(async input => {
      deliveredToken = new URL(input.magicUrl).searchParams.get("token") ?? "";
    });

    const requested = await requestRoute.POST(publicPost("/api/auth/magic/request", {
      clientId: home.client.id,
      email,
    }));
    assert.equal(requested.status, 200);
    assert.ok(deliveredToken);
    const tokenCheck = magic.verifyMagicToken(deliveredToken);
    assert.equal(tokenCheck.ok, true);
    if (tokenCheck.ok) assert.equal(tokenCheck.payload.purpose, "sign-in");

    const verified = await verifyRoute.GET(verifyRequest(deliveredToken));
    assert.ok(sessionCookieOf(verified));
    assert.equal(exactMember(email, home.sibling.id), null, "sign-in never widens into a sibling client");
  });

  it("issues the membership-creating capability only from the authenticated portal control", async () => {
    const home = await fixture();
    const email = "legitimate-invite@example.com";
    let inviteUrl = "";
    magic.registerMagicLinkDelivery(async input => { inviteUrl = input.magicUrl; });

    // The route's ambient access gate normally cross-checks an agency session
    // against browser Supabase cookies. This in-process test has only Aqua's
    // signed cookie; temporarily hide the stub's public config while driving
    // the issuer, then restore it for the invitation verifier's MFA check.
    const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let issued: Response;
    try {
      issued = await withSession(home.ownerToken, () => controlRoute.POST(new NextRequest(
        `${ORIGIN}/api/tenants/customer-portal-control`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${auth.SESSION_COOKIE_NAME}=${home.ownerToken}`,
          },
          body: JSON.stringify({ clientId: home.client.id, action: "send-access", loginEmail: email }),
        },
      )));
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = publicUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
    }
    assert.equal(issued.status, 200, JSON.stringify(await issued.clone().json()));
    assert.ok(inviteUrl);

    const token = new URL(inviteUrl).searchParams.get("token") ?? "";
    const tokenCheck = magic.verifyMagicToken(token);
    assert.equal(tokenCheck.ok, true);
    if (tokenCheck.ok) {
      assert.equal(tokenCheck.payload.purpose, "client-portal-invite");
      assert.equal(tokenCheck.payload.email, email);
      assert.equal(tokenCheck.payload.clientId, home.client.id);
      assert.equal(tokenCheck.payload.agencyId, home.agency.id);
    }

    const accepted = await verifyRoute.GET(verifyRequest(token));
    const cookie = sessionCookieOf(accepted);
    assert.ok(cookie, "the exact invitation mints an exact customer session");
    const member = exactMember(email, home.client.id);
    assert.equal(member?.role, "end-customer");
    assert.equal(member?.agencyId, home.agency.id);
    assert.equal(member?.clientId, home.client.id);

    const setupReached = await setupRoute.POST(new NextRequest(`${ORIGIN}/api/portal/customer/setup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        cookie: cookie!.split(";")[0]!,
      },
      body: JSON.stringify({ password: "Legitimate-portal-password-123" }),
    }));
    assert.equal(setupReached.status, 200, JSON.stringify(await setupReached.clone().json()));
    const configured = exactMember(email, home.client.id);
    assert.ok(configured?.supabaseAuthUserId, "setup persists the exact returned Supabase subject id");
    assert.equal(configured?.welcomeCompletedAt !== undefined, true);
    const remote = remoteUsers.find(user => user.id === configured?.supabaseAuthUserId);
    assert.equal(remote?.app_metadata.aqua_local_user_id, configured?.id);
    assert.equal(remote?.app_metadata.aqua_agency_id, home.agency.id);
    assert.equal(remote?.app_metadata.aqua_client_id, home.client.id);

    assert.equal(remote?.passwordMarker, "Legitimate-portal-password-123");
    assert.equal(configured?.sessionRev, 1, "setup rotates the invitation session epoch");

    const passwordLogin = await loginRoute.POST(loginRequest(email, "Legitimate-portal-password-123"));
    assert.equal(passwordLogin.status, 200, JSON.stringify(await passwordLogin.clone().json()));
    const passwordLoginBody = await passwordLogin.clone().json() as {
      user?: { id?: string; role?: string; clientId?: string };
    };
    assert.equal(passwordLoginBody.user?.id, configured?.id);
    assert.equal(passwordLoginBody.user?.role, "end-customer");
    assert.equal(passwordLoginBody.user?.clientId, home.client.id);
    assert.ok(sessionCookieOf(passwordLogin), "the bound scoped customer can return with their password");
  });

  it("rejects email and client substitution without creating either membership", async () => {
    const home = await fixture();
    const email = "claim-owner@invite.test";
    const { token } = magic.signClientPortalInviteToken({
      email,
      clientId: home.client.id,
      agencyId: home.agency.id,
      sessionRev: null,
    });

    for (const [label, changed, unintendedClient] of [
      ["email", substituteClaim(token, "email", "substitute@invite.test"), home.client.id],
      ["client", substituteClaim(token, "clientId", home.sibling.id), home.sibling.id],
    ] as const) {
      const response = await verifyRoute.GET(verifyRequest(changed));
      assert.equal(errorOf(response), "invalid_signature", `${label} substitution must break the signature`);
      assert.equal(exactMember("substitute@invite.test", unintendedClient), null);
      await assertNoPortalSession(response);
    }
    assert.equal(exactMember(email, home.client.id), null);
  });

  it("rejects expired and replayed invitations", async () => {
    const home = await fixture();
    const expiredEmail = "expired-invite@invite.test";
    const expired = resignPayload({
      purpose: "client-portal-invite",
      email: expiredEmail,
      clientId: home.client.id,
      agencyId: home.agency.id,
      exp: Math.floor(Date.now() / 1000) - 1,
      nonce: "expired-invite-nonce",
      sessionRev: null,
    });
    const expiredResponse = await verifyRoute.GET(verifyRequest(expired));
    assert.equal(errorOf(expiredResponse), "expired");
    assert.equal(exactMember(expiredEmail, home.client.id), null);
    await assertNoPortalSession(expiredResponse);

    const replayEmail = "single-use-invite@invite.test";
    const { token } = magic.signClientPortalInviteToken({
      email: replayEmail,
      clientId: home.client.id,
      agencyId: home.agency.id,
      sessionRev: null,
    });
    const first = await verifyRoute.GET(verifyRequest(token));
    assert.ok(sessionCookieOf(first));
    const second = await verifyRoute.GET(verifyRequest(token));
    assert.equal(errorOf(second), "session_epoch_changed");
    const decodedReplay = magic.verifyMagicToken(token);
    assert.equal(decodedReplay.ok, true);
    if (decodedReplay.ok) {
      assert.equal(await magic.consumeClientPortalInviteNonce(
        decodedReplay.payload.nonce,
        decodedReplay.payload.exp,
      ), false, "the accepted invitation nonce remains single-use");
    }
    assert.equal(sessionCookieOf(second), undefined);
    assert.equal(exactMember(replayEmail, home.client.id)?.agencyId, home.agency.id);
  });

  it("rejects a signed cross-tenant mismatch and leaves portal data inaccessible", async () => {
    const home = await fixture();
    const email = "cross-tenant@invite.test";
    const { token } = magic.signClientPortalInviteToken({
      email,
      clientId: home.client.id,
      agencyId: home.foreignAgency.id,
      sessionRev: null,
    });

    const response = await verifyRoute.GET(verifyRequest(token));
    assert.equal(errorOf(response), "client_inactive");
    assert.equal(exactMember(email, home.client.id), null);
    assert.equal(exactMember(email, home.foreignClient.id), null);
    await assertNoPortalSession(response);
  });

  it("does not capture or widen an existing privileged account", async () => {
    const home = await fixture();
    const email = "existing-owner@invite.test";
    const privileged = users.createUser({
      email,
      password: "Existing-owner-password",
      role: "agency-owner",
      agencyId: home.agency.id,
      sessionRev: null,
    });
    const { token } = magic.signClientPortalInviteToken({
      email,
      clientId: home.client.id,
      agencyId: home.agency.id,
      sessionRev: null,
    });

    const response = await verifyRoute.GET(verifyRequest(token));
    assert.equal(errorOf(response), "account_conflict");
    assert.equal(sessionCookieOf(response), undefined);
    assert.equal(exactMember(email, home.client.id), null);
    assert.equal(users.getUser(email)?.id, privileged.id);
    assert.equal(users.getUser(email)?.role, "agency-owner");
  });

  it("cannot reset an agency owner's Supabase password through a same-email scoped customer", async () => {
    const home = await fixture();
    const email = "shared-owner-email@example.com";
    users.createUser({
      email,
      password: "Local-owner-password",
      role: "agency-owner",
      agencyId: home.agency.id,
    });
    users.createUser({
      email,
      password: "Local-customer-password",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.client.id,
    });
    remoteUsers = [{
      id: "sb_real_agency_owner",
      email,
      app_metadata: { aqua_profile_role: "owner" },
      user_metadata: {},
      factors: [],
      passwordMarker: "owner-password-before",
    }];

    // The customer proves mailbox access and gets only their exact scoped
    // Aqua session. Setup must still refuse to adopt/update the unrelated
    // global Supabase owner that happens to have the same email.
    const { token } = magic.signMagicToken({
      email,
      clientId: home.client.id,
      agencyId: home.agency.id,
      sessionRev: 0,
    });
    const verified = await verifyRoute.GET(verifyRequest(token));
    const cookie = sessionCookieOf(verified);
    assert.ok(cookie);

    const setup = await setupRoute.POST(new NextRequest(`${ORIGIN}/api/portal/customer/setup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        cookie: cookie!.split(";")[0]!,
      },
      body: JSON.stringify({ password: "Attempted-takeover-password-123" }),
    }));
    assert.equal(setup.status, 503, "an occupied global email must fail closed, not be adopted");
    assert.equal(remoteCreates, 0, "an occupied global email must be rejected before any sibling subject is created");
    assert.equal(remotePasswordUpdates, 0, "the owner's exact Supabase id was never updated");
    assert.equal(remoteUsers[0]?.passwordMarker, "owner-password-before");
    const customer = exactMember(email, home.client.id);
    assert.equal(customer?.supabaseAuthUserId, undefined);
    assert.equal(customer?.welcomeCompletedAt, undefined);
    assert.equal(users.getUser(email)?.role, "agency-owner");
  });

  it("never maps a bound client password to a same-email privileged local account", async () => {
    const home = await fixture();
    const email = "later-privileged-collision@example.com";
    const customer = users.createUser({
      email,
      password: "Local-customer-password",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.client.id,
    });
    const remoteId = crypto.randomUUID();
    assert.equal(users.bindSupabaseAuthIdentity(customer.id, remoteId)?.id, customer.id);
    const privileged = users.createUser({
      email,
      password: "Local-owner-password",
      role: "agency-owner",
      agencyId: home.foreignAgency.id,
    });
    remoteUsers = [{
      id: remoteId,
      email,
      app_metadata: {
        aqua_subject_kind: "client-portal",
        aqua_local_user_id: customer.id,
        aqua_agency_id: home.agency.id,
        aqua_client_id: home.client.id,
        aqua_profile_role: "client",
      },
      user_metadata: {},
      factors: [],
      passwordMarker: "Bound-customer-password-123",
    }];

    const response = await loginRoute.POST(loginRequest(email, "Bound-customer-password-123"));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const body = await response.clone().json() as { user?: { id?: string; role?: string; clientId?: string } };
    assert.equal(body.user?.id, customer.id);
    assert.equal(body.user?.role, "end-customer");
    assert.equal(body.user?.clientId, home.client.id);
    assert.notEqual(body.user?.id, privileged.id);

    tenants.updateClient(home.agency.id, home.client.id, { status: "archived" });
    const archived = await loginRoute.POST(loginRequest(email, "Bound-customer-password-123"));
    assert.equal(archived.status, 403, "an archived client's bound password must not retain access");
    assert.equal(sessionCookieOf(archived), undefined);
    tenants.updateClient(home.agency.id, home.client.id, { status: "active" });

    // An admin-only remote marker that points at the privileged account does
    // not retarget the binding; every marker must agree or login fails closed.
    remoteUsers[0]!.app_metadata.aqua_local_user_id = privileged.id;
    const mismatched = await loginRoute.POST(loginRequest(email, "Bound-customer-password-123"));
    assert.equal(mismatched.status, 403);
    assert.equal(sessionCookieOf(mismatched), undefined);
  });

  it("fails closed when a client Supabase subject has no unique local binding", async () => {
    const home = await fixture();
    const email = "unbound-client-subject@example.com";
    const customer = users.createUser({
      email,
      password: "Local-customer-password",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.client.id,
    });
    const remoteId = crypto.randomUUID();
    remoteUsers = [{
      id: remoteId,
      email,
      app_metadata: {
        aqua_subject_kind: "client-portal",
        aqua_local_user_id: customer.id,
        aqua_agency_id: home.agency.id,
        aqua_client_id: home.client.id,
        aqua_profile_role: "client",
      },
      user_metadata: {},
      factors: [],
      passwordMarker: "Unbound-customer-password-123",
    }];

    const response = await loginRoute.POST(loginRequest(email, "Unbound-customer-password-123"));
    assert.equal(response.status, 403);
    assert.equal(sessionCookieOf(response), undefined);

    // A corrupt persisted duplicate is equally non-authoritative: never pick
    // the first record returned by object iteration.
    assert.equal(users.bindSupabaseAuthIdentity(customer.id, remoteId)?.id, customer.id);
    const duplicate = users.createUser({
      email,
      password: "Other-local-password",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.sibling.id,
    });
    storage.mutate(state => {
      const row = Object.values(state.users).find(user => user.id === duplicate.id);
      assert.ok(row);
      row.supabaseAuthUserId = remoteId;
    });
    const ambiguous = await loginRoute.POST(loginRequest(email, "Unbound-customer-password-123"));
    assert.equal(ambiguous.status, 403);
    assert.equal(sessionCookieOf(ambiguous), undefined);
  });

  it("requires a fresh signed auth ceremony for password setup at both assurance levels", async () => {
    const home = await fixture();
    const email = "reauth-window@example.com";
    const member = users.createUser({
      email,
      password: "Local-customer-password",
      role: "end-customer",
      agencyId: home.agency.id,
      clientId: home.client.id,
    });
    const remoteId = crypto.randomUUID();
    assert.equal(users.bindSupabaseAuthIdentity(member.id, remoteId)?.supabaseAuthUserId, remoteId);
    remoteUsers = [{
      id: remoteId,
      email,
      app_metadata: {
        aqua_subject_kind: "client-portal",
        aqua_local_user_id: member.id,
        aqua_agency_id: home.agency.id,
        aqua_client_id: home.client.id,
        aqua_profile_role: "client",
      },
      user_metadata: {},
      factors: [],
      passwordMarker: "password-before",
    }];

    const postSetup = (token: string, password: string) => setupRoute.POST(new NextRequest(
      `${ORIGIN}/api/portal/customer/setup`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: `${auth.SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ password }),
      },
    ));

    for (const aal of ["aal1", "aal2"] as const) {
      const updatesBeforeAttempt = remotePasswordUpdates;
      const fresh = auth.issueSession({
        userId: users.getUserById(member.id)!.id,
        email: users.getUserById(member.id)!.email,
        role: users.getUserById(member.id)!.role,
        agencyId: users.getUserById(member.id)!.agencyId,
        clientId: users.getUserById(member.id)!.clientId,
        sessionRev: users.getUserById(member.id)!.sessionRev ?? 0,
        aal,
      });
      const stale = rewriteSignedPayload(fresh, {
        iat: Math.floor(Date.now() / 1000) - (15 * 60 + 1),
      });
      const refused = await postSetup(stale, `Stale-${aal}-password-123`);
      assert.equal(refused.status, 403, `${aal} must not outlive the reauthentication window`);
      assert.equal(remotePasswordUpdates, updatesBeforeAttempt,
        "a stale session must not reach the remote password update");

      const accepted = await postSetup(fresh, `Fresh-${aal}-password-123`);
      assert.equal(accepted.status, 200, JSON.stringify({
        response: await accepted.clone().json(),
        operations: storage.getState().clientPortalSetupOperations,
      }));
      assert.equal(remotePasswordUpdates, updatesBeforeAttempt + 1,
        "a fresh session should update the exact bound subject once");
    }

    assert.equal(remotePasswordUpdates, 2);
    assert.equal(remoteUsers[0]?.passwordMarker, "Fresh-aal2-password-123");
  });

  it("never lets an ordinary magic sign-in token auto-create membership", async () => {
    const home = await fixture();
    const email = "mailbox-only@invite.test";
    const { token } = magic.signMagicToken({
      email,
      clientId: home.client.id,
      agencyId: home.agency.id,
      sessionRev: 0,
    });

    const response = await verifyRoute.GET(verifyRequest(token));
    assert.equal(errorOf(response), "membership_required");
    assert.equal(exactMember(email, home.client.id), null);
    await assertNoPortalSession(response);
  });
});
