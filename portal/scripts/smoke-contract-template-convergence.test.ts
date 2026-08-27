import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { withSession } from "./dev-console-request-scope";

// A private file backend lets this test force an actual persistence reload
// without ever touching the shared port-3032 sandbox.
const sandbox = mkdtempSync(join(tmpdir(), "aqua-contract-template-"));
process.env.PORTAL_BACKEND = "file";
process.env.PORTAL_DATA_FILE = join(sandbox, "portal-state.json");
process.env.PORTAL_SESSION_SECRET = "contract-template-convergence-secret";
process.env.NODE_ENV = "test";

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Auth = typeof import("../src/lib/server/auth/auth");
type Users = typeof import("../src/server/users");
type ContractRoute = typeof import("../src/app/api/tenants/client-contracts/route");
type TemplateRoute = typeof import("../src/app/api/portal/contracts/templates/route");
type Templates = typeof import("../src/server/contractTemplates");

let storage: Storage;
let tenants: Tenants;
let auth: Auth;
let users: Users;
let contractRoute: ContractRoute;
let templateRoute: TemplateRoute;
let templateStore: Templates;

before(async () => {
  [storage, tenants, auth, users, contractRoute, templateRoute, templateStore] = await Promise.all([
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/users"),
    import("../src/app/api/tenants/client-contracts/route"),
    import("../src/app/api/portal/contracts/templates/route"),
    import("../src/server/contractTemplates"),
  ]);
  await storage.ensureHydrated();
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("contract save, failed template step, retry and reload converge to one contract and one template", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Contract convergence", ownerEmail: "contracts@example.com" });
  const client = tenants.createClient(agency.id, { name: "One Draft Ltd" });
  const owner = users.createUser({
    email: "contracts@example.com",
    name: "Contract owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "test-password",
  });
  const token = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    sessionRev: owner.sessionRev ?? 0,
  });
  const operationId = "contract-create:convergence-0001";
  const contractBody = {
    clientId: client.id,
    action: "create",
    operationId,
    title: "Website delivery agreement",
    summary: "One durable draft and one reusable template.",
    body: "The supplier will deliver the agreed website scope.",
  };

  const first = await withSession(token, () => contractRoute.POST(request(
    "http://localhost/api/tenants/client-contracts",
    contractBody,
  )));
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { contract: { id: string }; replayed: boolean };
  assert.equal(firstPayload.replayed, false);
  assert.match(firstPayload.contract.id, /^ctr_[a-f0-9]{24}$/);

  // Force the old second-request boundary to fail after the contract is durable.
  const failedTemplate = await withSession(token, () => templateRoute.POST(request(
    "http://localhost/api/portal/contracts/templates",
    { action: "create", clientId: client.id, sourceContractId: "ctr_missing" },
  )));
  assert.equal(failedTemplate.status, 404);
  assert.equal(templateStore.listContractTemplates(agency.id).length, 0);

  // A fresh hydration stands in for closing/reloading the browser or landing
  // on another server process. Replaying the SAME browser operation adopts the
  // first contract instead of adding another draft.
  await storage.ensureHydrated({ fresh: true });
  const retriedContract = await withSession(token, () => contractRoute.POST(request(
    "http://localhost/api/tenants/client-contracts",
    contractBody,
  )));
  assert.equal(retriedContract.status, 200);
  const retryPayload = await retriedContract.json() as { contract: { id: string }; replayed: boolean };
  assert.equal(retryPayload.replayed, true);
  assert.equal(retryPayload.contract.id, firstPayload.contract.id);

  const conflictingRetry = await withSession(token, () => contractRoute.POST(request(
    "http://localhost/api/tenants/client-contracts",
    { ...contractBody, title: "Different terms under the same operation" },
  )));
  assert.equal(conflictingRetry.status, 409, "one operation id cannot silently adopt different terms");

  const afterRetry = tenants.getClientForAgency(agency.id, client.id);
  const contracts = (afterRetry?.metadata?.contracts ?? []) as Array<{ id: string }>;
  assert.deepEqual(contracts.map(contract => contract.id), [firstPayload.contract.id]);

  const template = await withSession(token, () => templateRoute.POST(request(
    "http://localhost/api/portal/contracts/templates",
    { action: "create", clientId: client.id, sourceContractId: firstPayload.contract.id },
  )));
  assert.equal(template.status, 201);
  const templatePayload = await template.json() as { template: { id: string }; replayed: boolean };
  assert.equal(templatePayload.replayed, false);

  await storage.ensureHydrated({ fresh: true });
  const replayedTemplate = await withSession(token, () => templateRoute.POST(request(
    "http://localhost/api/portal/contracts/templates",
    { action: "create", clientId: client.id, sourceContractId: firstPayload.contract.id },
  )));
  assert.equal(replayedTemplate.status, 200);
  const replayedTemplatePayload = await replayedTemplate.json() as { template: { id: string }; replayed: boolean };
  assert.equal(replayedTemplatePayload.replayed, true);
  assert.equal(replayedTemplatePayload.template.id, templatePayload.template.id);

  const finalContracts = (tenants.getClientForAgency(agency.id, client.id)?.metadata?.contracts ?? []) as unknown[];
  const finalTemplates = templateStore.listContractTemplates(agency.id);
  assert.equal(finalContracts.length, 1, "reload/retry leaves exactly one contract draft");
  assert.equal(finalTemplates.length, 1, "reload/retry leaves exactly one reusable template");
  assert.equal(finalTemplates[0]?.sourceContractId, firstPayload.contract.id);
  assert.equal(storage.getState().activity.filter(item => item.action === "contract.created").length, 1);
  assert.equal(storage.getState().activity.filter(item => item.action === "contract.template_created").length, 1);
});

test("the mounted editor adopts the contract before template I/O and exposes reload recovery", () => {
  const panel = readFileSync("src/app/portal/clients/[clientId]/_ContractsPanel.tsx", "utf8");
  const adoption = panel.indexOf("contractId: savedContract!.id");
  const templateRequest = panel.indexOf("await saveTemplateFromContract(savedContract)");
  assert.ok(adoption >= 0 && templateRequest > adoption, "contract identity must be adopted before template I/O");
  assert.match(panel, /operationId: editor\.operationId/);
  assert.match(panel, /editor\.templatePending && editor\.contractId/);
  assert.match(panel, /Save as template/);
  assert.match(panel, /sourceContractId: contract\.id/);
  assert.doesNotMatch(panel, /body: JSON\.stringify\(\{ action: "create", title: editor\.title/);
});
