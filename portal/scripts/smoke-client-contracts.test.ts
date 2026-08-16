import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("contracts support writing, private uploads, reusable templates, and amendments", () => {
  const model = read("src/lib/clientContracts.ts");
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
  assert.match(clientPage, /ensureDefaultAgencyProducts\(session\.agencyId\)/);
  assert.match(clientPage, /product\.contractBody/);
  assert.match(templateRoute, /createContractTemplate/);
  assert.match(templateRoute, /updateContractTemplate/);
  assert.match(templateRoute, /deleteContractTemplate/);
});
