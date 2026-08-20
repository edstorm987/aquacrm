// SOP Engine — guides (Phase 3) smoke.
//
// A GUIDE is an ordered sequence of existing SOPs (by sopId) composed in the
// SOP library. These prove the additive contract: a guide round-trips through
// create → get → reorder → delete; a guide that references a SOP which does not
// exist for the agency is REFUSED; and the HTTP CRUD is owner/manager gated so
// agency-staff cannot compose guides. The `sopGuides` collection surviving a
// state save/load is proven generically by `smoke-state-roundtrip.test.ts`
// (it derives the collection list from the PortalState type).
//
// Everything below drives the SHIPPED server functions and the REAL exported
// route handlers in-process (a minted session + a NextRequest), against the
// memory backend.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "sop-guides-smoke-secret";

import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { NextRequest } = require("next/server") as typeof import("next/server");
const route = require("../src/app/api/portal/sop-guides/route") as typeof import("../src/app/api/portal/sop-guides/route");
const { issueSession } = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const { ensureHydrated } = require("../src/server/storage") as typeof import("../src/server/storage");
const { createWrittenSop } = require("../src/server/sops") as typeof import("../src/server/sops");
const guides = require("../src/server/sopGuides") as typeof import("../src/server/sopGuides");

let seq = 0;

async function seedAgencyWithSops(count: number): Promise<{ agencyId: string; sopIds: string[] }> {
  await ensureHydrated();
  seq += 1;
  const agencyId = `ag_sopguides_${Date.now()}_${seq}`;
  const sopIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const sop = createWrittenSop({ agencyId, title: `SOP ${i + 1}`, content: `Body ${i + 1}`, actorUserId: "usr_seed" });
    sopIds.push(sop.id);
  }
  return { agencyId, sopIds };
}

test("a guide round-trips: create ordered, get, reorder, delete", async () => {
  const { agencyId, sopIds } = await seedAgencyWithSops(3);
  const [a, b, c] = sopIds;

  const created = guides.createSopGuide({
    agencyId,
    title: "New starter onboarding",
    description: "Walk a new hire through the essentials.",
    sopIds: [a, b, c],
    actorUserId: "usr_owner",
  });
  assert.deepEqual(created.sopIds, [a, b, c], "order is preserved on create");
  assert.equal(created.quizEnabled, undefined, "quiz is opt-in and off by default");

  const fetched = guides.getSopGuide(agencyId, created.id);
  assert.ok(fetched, "guide should be retrievable");
  assert.deepEqual(fetched?.sopIds, [a, b, c]);

  const reordered = guides.updateSopGuide(agencyId, created.id, { sopIds: [c, a, b] }, "usr_owner");
  assert.deepEqual(reordered?.sopIds, [c, a, b], "reorder replaces the ordered sequence");

  const list = guides.listSopGuides(agencyId);
  assert.equal(list.length, 1);

  const deleted = guides.deleteSopGuide(agencyId, created.id);
  assert.ok(deleted, "delete returns the removed guide");
  assert.equal(guides.getSopGuide(agencyId, created.id), null, "guide is gone after delete");
  assert.equal(guides.listSopGuides(agencyId).length, 0);
});

test("a guide referencing a non-existent SOP is refused", async () => {
  const { agencyId, sopIds } = await seedAgencyWithSops(1);
  assert.throws(
    () => guides.createSopGuide({ agencyId, title: "Bad guide", sopIds: [sopIds[0], "sop_does_not_exist"], actorUserId: "usr_owner" }),
    /does not exist/,
    "an unknown sopId must be rejected on create",
  );

  // A SOP owned by ANOTHER agency must not be composable either.
  await ensureHydrated();
  const foreign = createWrittenSop({ agencyId: `${agencyId}_other`, title: "Foreign SOP", content: "x", actorUserId: "usr_seed" });
  assert.throws(
    () => guides.createSopGuide({ agencyId, title: "Cross-tenant", sopIds: [foreign.id], actorUserId: "usr_owner" }),
    /does not exist/,
    "a SOP from another agency must be rejected",
  );

  // Reorder/patch to an unknown id is refused too.
  const ok = guides.createSopGuide({ agencyId, title: "Good guide", sopIds: [sopIds[0]], actorUserId: "usr_owner" });
  assert.throws(
    () => guides.updateSopGuide(agencyId, ok.id, { sopIds: ["sop_missing"] }, "usr_owner"),
    /does not exist/,
    "patching to an unknown sopId must be rejected",
  );
});

function guideRequest(method: string, body: unknown, cookie: string, query = ""): InstanceType<typeof NextRequest> {
  return new NextRequest(`http://localhost/api/portal/sop-guides${query}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: `lk_session_v1=${cookie}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("the HTTP CRUD is owner/manager gated — agency-staff is refused", async () => {
  const { agencyId, sopIds } = await seedAgencyWithSops(2);

  const ownerCookie = issueSession({ userId: "usr_owner", email: "owner@example.com", role: "agency-owner" as never, agencyId });
  const staffCookie = issueSession({ userId: "usr_staff", email: "staff@example.com", role: "agency-staff" as never, agencyId });

  // Owner can create.
  const ownerCreate = await route.POST(guideRequest("POST", { title: "Owner guide", sopIds }, ownerCookie));
  assert.equal(ownerCreate.status, 201, "owner may create a guide");
  const ownerBody = await ownerCreate.json() as { ok?: boolean; guide?: { id: string } };
  assert.ok(ownerBody.guide?.id, "created guide is returned");

  // Staff cannot create.
  const staffCreate = await route.POST(guideRequest("POST", { title: "Staff guide", sopIds }, staffCookie));
  assert.equal(staffCreate.status, 401, "agency-staff must be refused on create");

  // Staff cannot delete either.
  const staffDelete = await route.DELETE(guideRequest("DELETE", undefined, staffCookie, `?id=${encodeURIComponent(ownerBody.guide!.id)}`));
  assert.equal(staffDelete.status, 401, "agency-staff must be refused on delete");

  // Staff CAN read (the staff view lists guides).
  const staffList = await route.GET(guideRequest("GET", undefined, staffCookie));
  assert.equal(staffList.status, 200, "agency-staff may read guides");
  const listBody = await staffList.json() as { ok?: boolean; guides?: unknown[] };
  assert.ok(Array.isArray(listBody.guides), "guides list is returned to staff");
});
