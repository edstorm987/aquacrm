import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createClientDelight, deleteClientDelight, listClientDelight, updateClientDelight } from "../src/server/clientDelight";
import { createExperiencePackage, deleteExperiencePackage, listExperiencePackages, updateExperiencePackage } from "../src/server/experiencePackages";
import { mutate } from "../src/server/storage";

test("curated packages become independent, operable client or staff experiences", () => {
  const agencyId = `agency_experience_test_${Date.now()}`;
  const actor = "experience-test";

  const item = createExperiencePackage(agencyId, {
    name: "Founder recognition day",
    category: "Staff reward",
    summary: "A flexible day of recognition chosen around the recipient.",
    audience: "staff",
    deliveryMethod: "in-person",
    priceCents: 42500,
    currency: "GBP",
    leadTimeDays: 21,
    supplier: "Aqua experience desk",
    includedItems: ["Travel", "Lunch", "Personal thank-you"],
    fulfilmentSteps: ["Confirm preferences", "Book the day", "Capture feedback"],
  }, actor);

  const plan = createClientDelight(agencyId, {
    packageId: item.id,
    audience: "staff",
    recipientName: "Aqua team member",
    occasion: "milestone",
    title: "",
    status: "planned",
  }, actor);

  assert.equal(plan.packageId, item.id);
  assert.equal(plan.packageName, "Founder recognition day");
  assert.equal(plan.title, "Founder recognition day");
  assert.equal(plan.budgetCents, 42500);
  assert.equal(plan.audience, "staff");
  assert.deepEqual(plan.includedItems, ["Travel", "Lunch", "Personal thank-you"]);
  assert.equal(plan.fulfilmentSteps.length, 3);

  updateExperiencePackage(agencyId, item.id, { includedItems: ["A different future version"] }, actor);
  assert.deepEqual(listClientDelight(agencyId).find(record => record.id === plan.id)?.includedItems, ["Travel", "Lunch", "Personal thank-you"]);

  const completedSteps = plan.fulfilmentSteps.map((step, index) => ({ ...step, completed: index === 0 }));
  const progressed = updateClientDelight(agencyId, plan.id, { fulfilmentSteps: completedSteps }, actor);
  assert.equal(progressed?.fulfilmentSteps[0]?.completed, true);
  assert.equal(progressed?.fulfilmentSteps[0]?.completedAt != null, true);

  const archived = updateExperiencePackage(agencyId, item.id, { active: false }, actor);
  assert.equal(archived?.active, false);
  assert.equal(listExperiencePackages(agencyId).length, 0);
  assert.equal(listExperiencePackages(agencyId, true).length, 1);

  deleteClientDelight(agencyId, plan.id);
  deleteExperiencePackage(agencyId, item.id);
  mutate(state => { state.activity = state.activity.filter(entry => entry.agencyId !== agencyId); });
});

test("Experience command centre wires catalogue, staff rewards and live fulfilment to authenticated routes", () => {
  const workspace = readFileSync("src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx", "utf8");
  const page = readFileSync("src/app/portal/agency/you-deserve-it/page.tsx", "utf8");
  const packageRoute = readFileSync("src/app/api/tenants/experience-packages/route.ts", "utf8");
  const planRoute = readFileSync("src/app/api/tenants/client-delight/route.ts", "utf8");

  assert.match(workspace, /Curated experience catalogue/);
  assert.match(workspace, /Internal experience and staff rewards/);
  assert.match(workspace, /Fulfilment checklist/);
  assert.match(workspace, /\/api\/tenants\/experience-packages/);
  assert.match(workspace, /\/api\/tenants\/client-delight/);
  assert.match(page, /listExperiencePackages/);
  assert.match(page, /listUsersForAgency/);
  assert.match(packageRoute, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
  assert.match(planRoute, /recipientUserId/);
  assert.match(planRoute, /fulfilmentSteps/);
});
