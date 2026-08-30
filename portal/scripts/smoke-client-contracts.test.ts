process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "client-contracts-smoke-secret";

// Installs the request-scope helpers before anything pulls in `next/` — see the
// note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("contracts support writing, private uploads, reusable templates, and amendments", () => {
  const model = read("src/lib/clients/clientContracts.ts");
  const route = read("src/app/api/tenants/client-contracts/route.ts");
  const panel = read("src/app/portal/clients/[clientId]/_ContractsPanel.tsx");

  assert.match(model, /interface ClientContractRevision/);
  assert.match(model, /interface ClientContractTemplate/);
  assert.match(model, /revisions\?: ClientContractRevision\[\]/);

  assert.match(route, /action === "update"/);
  assert.match(route, /status: "draft"/);
  assert.match(route, /version: priorVersion \+ 1/);
  assert.match(route, /revisions: \[\.\.\.\(current\.revisions \?\? \[\]\), revision\]/);
  assert.match(route, /write terms or attach a document before sending/);
  assert.match(route, /await flushPendingWrites\(\)/);

  assert.match(panel, /New contract/);
  assert.match(panel, /Contract terms/);
  assert.match(panel, /Upload contract document/);
  assert.match(panel, /Save new version/);
  assert.match(panel, /Contract templates/);
  assert.match(panel, /Version history/);
});

test("private contract documents remain authenticated and customer-visible", () => {
  const fileRoute = read("src/app/api/tenants/client-files/route.ts");
  const uploadRoute = read("src/app/api/tenants/client-files/upload/route.ts");
  const portalData = read("src/app/portal/customer/_portalData.ts");
  const customerActions = read("src/app/portal/customer/_CustomerPortalActions.tsx");

  assert.match(fileRoute, /"contract"/);
  assert.match(uploadRoute, /storePrivateUpload/);
  assert.match(uploadRoute, /MAX_FILE_BYTES = 50 \* 1024 \* 1024/);
  assert.match(portalData, /customerDocumentUrl/);
  assert.match(portalData, /body: contract\.body/);
  assert.match(customerActions, /Review the full terms/);
  assert.match(customerActions, /Version \{contract\.version \?\? 1\}/);
});

test("product contracts are available alongside the agency template library", () => {
  const clientPage = read("src/app/portal/clients/[clientId]/page.tsx");
  const templateRoute = read("src/app/api/portal/contracts/templates/route.ts");

  assert.match(clientPage, /listContractTemplates\(session\.agencyId\)/);
  assert.match(clientPage, /agencyProductsForRead\(session\.agencyId\)/);
  assert.match(clientPage, /product\.contractBody/);
  assert.match(templateRoute, /createContractTemplate/);
  assert.match(templateRoute, /updateContractTemplate/);
  assert.match(templateRoute, /deleteContractTemplate/);
});

// ─── Acceptance is a real agreement to a real, identified wording (issues #39) ─
//
// The static checks above prove the SEND gate is written down. These drive the
// real route to prove the two things that gate did not cover: an agreement that
// somehow reached "sent" without terms — which the one-button close used to
// mint directly — cannot be accepted, and an acceptance is bound to the exact
// version that was on screen rather than to whatever the wording later becomes.

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Auth = typeof import("../src/lib/server/auth/auth");
type Users = typeof import("../src/server/users");
type ContractRoute = typeof import("../src/app/api/tenants/client-contracts/route");
type ClientContract = import("../src/lib/clients/clientContracts").ClientContract;

let storage: Storage;
let tenants: Tenants;
let auth: Auth;
let users: Users;
let contractRoute: ContractRoute;

before(async () => {
  [storage, tenants, auth, users, contractRoute] = await Promise.all([
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/users"),
    import("../src/app/api/tenants/client-contracts/route"),
  ]);
  await storage.ensureHydrated();
});

let worldSeq = 0;

async function seedWorld() {
  worldSeq += 1;
  const agency = tenants.createAgency({ name: `Contract gate ${worldSeq}`, ownerEmail: `gate${worldSeq}@example.com` });
  const client = tenants.createClient(agency.id, { name: `Signer Ltd ${worldSeq}`, stage: "live" });
  const owner = users.createUser({
    email: `gate${worldSeq}@example.com`,
    name: `Gate owner ${worldSeq}`,
    role: "agency-owner",
    agencyId: agency.id,
    password: "client-contracts-smoke-pass",
  });
  const cookie = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: "agency-owner",
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
  return { agencyId: agency.id, clientId: client.id, cookie, email: owner.email };
}

type World = Awaited<ReturnType<typeof seedWorld>>;

async function call(world: World, body: Record<string, unknown>) {
  const response = await withSession(world.cookie, () => contractRoute.POST(new Request(
    "http://localhost/api/tenants/client-contracts",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: world.clientId, ...body }) },
  )));
  return { status: response.status, data: await response.json() as { ok?: boolean; error?: string; contract?: ClientContract; contracts?: ClientContract[] } };
}

function storedContracts(world: World): ClientContract[] {
  const client = tenants.getClientForAgency(world.agencyId, world.clientId);
  return (client?.metadata?.contracts as ClientContract[] | undefined) ?? [];
}

test("an agreement with no terms cannot be accepted, however it reached 'sent'", async () => {
  const world = await seedWorld();
  const created = await call(world, { action: "create", title: "Handshake", operationId: `op-empty-${worldSeq}` });
  assert.equal(created.status, 200);
  const contractId = created.data.contract!.id;

  // The documented send gate.
  const refusedSend = await call(world, { action: "send", contractId });
  assert.equal(refusedSend.status, 409);
  assert.match(refusedSend.data.error ?? "", /write terms or attach a document/i);

  // Now the state the one-button close used to create directly, and which any
  // record written before this fix is still sitting in: status "sent", no terms.
  const legacy = storedContracts(world).map(contract =>
    contract.id === contractId ? { ...contract, status: "sent" as const, issuedAt: Date.now() } : contract);
  tenants.updateClient(world.agencyId, world.clientId, { metadata: { contracts: legacy } });

  const refusedAccept = await call(world, { action: "accept", contractId });
  assert.equal(refusedAccept.status, 409, "a title is not something anyone can agree to");
  assert.match(refusedAccept.data.error ?? "", /no terms/i);

  const after = storedContracts(world).find(contract => contract.id === contractId)!;
  assert.equal(after.status, "sent", "the refusal changed nothing");
  assert.equal(after.acceptedAt, undefined, "and recorded no acceptance");
});

test("acceptance is bound to the version on screen — an amendment does not inherit it", async () => {
  const world = await seedWorld();
  const created = await call(world, {
    action: "create",
    title: "Care plan",
    body: "Version one terms: monthly care, £400.",
    operationId: `op-terms-${worldSeq}`,
  });
  const contractId = created.data.contract!.id;

  assert.equal((await call(world, { action: "send", contractId })).status, 200);
  const accepted = await call(world, { action: "accept", contractId });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.contract?.status, "accepted");
  assert.equal(accepted.data.contract?.acceptedVersion, 1, "the accepted wording is identified by number");

  // Amend it. The route already bumps the version and resets to draft; what
  // must NOT survive is the acceptance of the wording nobody agreed to.
  const amended = await call(world, {
    action: "update",
    contractId,
    title: "Care plan",
    body: "Version two terms: monthly care, £650.",
    amendmentNote: "Price rise",
  });
  assert.equal(amended.status, 200);
  assert.equal(amended.data.contract?.version, 2);
  assert.equal(amended.data.contract?.status, "draft");
  assert.equal(amended.data.contract?.acceptedAt, undefined);
  assert.equal(amended.data.contract?.acceptedVersion, undefined, "version 1's acceptance cannot cover version 2");

  assert.equal((await call(world, { action: "send", contractId })).status, 200);
  const reaccepted = await call(world, { action: "accept", contractId });
  assert.equal(reaccepted.data.contract?.acceptedVersion, 2, "the new wording is accepted on its own terms");
});
