import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CheckedMutationError,
  checkedJsonMutation,
} from "../src/lib/client/checkedMutation";

function fetcher(response: Response): typeof fetch {
  return async () => response;
}

describe("checked client mutations", () => {
  it("returns a validated 2xx JSON outcome", async () => {
    const result = await checkedJsonMutation<{ ok: true; record: { id: string } }>(
      "/mutation",
      { method: "POST" },
      {
        fallback: "Could not save.",
        fetcher: fetcher(Response.json({ ok: true, record: { id: "one" } })),
        validate: payload => Boolean(payload.record),
      },
    );
    assert.equal(result.record.id, "one");
  });

  it("rejects non-2xx and preserves the safe server diagnostic", async () => {
    await assert.rejects(
      checkedJsonMutation("/mutation", { method: "POST" }, {
        fallback: "Could not save.",
        fetcher: fetcher(Response.json({ error: "That record changed. Reload and retry." }, { status: 409 })),
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "http"
        && error.status === 409
        && error.message === "That record changed. Reload and retry.",
    );
  });

  it("rejects a 2xx domain refusal", async () => {
    await assert.rejects(
      checkedJsonMutation("/mutation", { method: "POST" }, {
        fallback: "Could not save.",
        fetcher: fetcher(Response.json({ ok: false, error: "Provider unavailable." })),
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "domain"
        && error.message === "Provider unavailable.",
    );
  });

  it("turns transport and malformed JSON failures into retryable UI copy", async () => {
    await assert.rejects(
      checkedJsonMutation("/mutation", { method: "POST" }, {
        fallback: "Could not save.",
        fetcher: async () => { throw new TypeError("socket detail"); },
      }),
      /Could not save\. Check your connection and try again\./,
    );
    await assert.rejects(
      checkedJsonMutation("/mutation", { method: "POST" }, {
        fallback: "Could not save.",
        fetcher: fetcher(new Response("not-json", { status: 200 })),
      }),
      /server returned an unreadable response/i,
    );
  });

  it("keeps the migrated mutation cohort on the checked boundary", () => {
    const files = [
      "src/built-ins/modules/agency-hr/src/components/LeaveBoard.tsx",
      "src/built-ins/modules/memberships/src/components/SubscribersList.tsx",
      "src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx",
      "src/built-ins/modules/memberships/src/components/BenefitsList.tsx",
      "src/built-ins/modules/memberships/src/components/NewPlanModal.tsx",
      "src/built-ins/modules/ecommerce/src/components/admin/InventoryTable.tsx",
      "src/built-ins/modules/ecommerce/src/components/admin/DiscountsEditor.tsx",
      "src/built-ins/modules/ecommerce/src/components/admin/ProductsList.tsx",
      "src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx",
      "src/app/portal/agency/inbox/_MasterInbox.tsx",
      "src/app/portal/team/_TeamWorkspace.tsx",
      "src/built-ins/modules/affiliates/src/components/AffiliatesList.tsx",
      "src/built-ins/modules/affiliates/src/components/AttributionsList.tsx",
      "src/built-ins/modules/affiliates/src/components/PayoutsList.tsx",
      "src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx",
      "src/built-ins/modules/affiliates/src/components/CodesList.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      assert.match(source, /checkedJsonMutation/, `${file} must use the checked mutation boundary`);
      assert.doesNotMatch(source, /await\s+fetch\s*\(/, `${file} must not bypass checked mutation handling`);
    }

    const taskTemplates = readFileSync(
      join(process.cwd(), "src/components/attention/TaskTemplates.tsx"),
      "utf8",
    );
    assert.ok(
      [...taskTemplates.matchAll(/checkedJsonMutation/g)].length >= 3,
      "task template apply/delete/save mutations must use the checked boundary",
    );
    const removeStart = taskTemplates.indexOf("async function remove(");
    const removeEnd = taskTemplates.indexOf("\n  return (", removeStart);
    assert.ok(removeStart >= 0 && removeEnd > removeStart);
    assert.doesNotMatch(taskTemplates.slice(removeStart, removeEnd), /await\s+fetch\s*\(/);
  });
});
