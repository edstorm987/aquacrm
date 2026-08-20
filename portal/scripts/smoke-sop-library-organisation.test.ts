import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createSopCategory, createWrittenSop, deleteSopCategory, getSop, listSopCategories, updateSop } from "../src/engines/sop/server/sops";
import { mutate } from "../src/server/storage";

const AGENCY_ID = `ag_sop_organisation_${Date.now()}`;
const ACTOR_ID = "usr_sop_test";
const PRODUCT_ID = `prod_sop_organisation_${Date.now()}`;
const createdSopIds: string[] = [];

after(() => {
  mutate(state => {
    for (const id of createdSopIds) delete state.sops[id];
    delete state.agencyProducts[PRODUCT_ID];
    delete state.agencySettings[AGENCY_ID];
  });
});

describe("SOP library organisation", () => {
  it("keeps one primary folder, additional categories, and searchable tags", () => {
    createSopCategory(AGENCY_ID, "Onboarding", ACTOR_ID);
    createSopCategory(AGENCY_ID, "Training", ACTOR_ID);
    createSopCategory(AGENCY_ID, "Client delivery", ACTOR_ID);
    const sop = createWrittenSop({
      agencyId: AGENCY_ID,
      title: "Welcome call",
      content: "Prepare the agenda and confirm the expected outcome.",
      category: "Onboarding",
      categories: ["Training", "Client delivery"],
      tags: ["welcome", "client", "welcome"],
      actorUserId: ACTOR_ID,
    });
    createdSopIds.push(sop.id);

    assert.equal(sop.category, "Onboarding");
    assert.deepEqual(sop.categories, ["Client delivery", "Onboarding", "Training"]);
    assert.deepEqual(sop.tags, ["welcome", "client"]);
    assert.deepEqual(listSopCategories(AGENCY_ID), ["Client delivery", "Onboarding", "Training"]);

    const moved = updateSop(AGENCY_ID, sop.id, {
      category: "Training",
      categories: ["Training", "Client delivery"],
      tags: ["training", "client-facing"],
    }, ACTOR_ID);
    assert.equal(moved?.category, "Training");
    assert.deepEqual(moved?.categories, ["Client delivery", "Training"]);
    assert.deepEqual(moved?.tags, ["training", "client-facing"]);
  });

  it("deletes a folder, relocates affected SOPs, and updates product category links", () => {
    const source = createWrittenSop({
      agencyId: AGENCY_ID,
      title: "Project handover",
      content: "Package the final files and walk the client through ownership.",
      category: "Onboarding",
      categories: ["Client delivery"],
      tags: ["handover"],
      actorUserId: ACTOR_ID,
    });
    createdSopIds.push(source.id);
    mutate(state => {
      state.agencyProducts[PRODUCT_ID] = {
        id: PRODUCT_ID,
        agencyId: AGENCY_ID,
        kind: "product",
        name: "SOP test product",
        category: "Service",
        portalRequirement: "none",
        includedProductIds: [],
        welcomePackItems: [],
        pricing: "custom",
        deliverables: [],
        sopIds: [source.id],
        sopCategories: ["Onboarding", "Client delivery"],
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    const result = deleteSopCategory(AGENCY_ID, "Onboarding", "Training", ACTOR_ID);
    assert.equal(result?.affectedSopCount, 1);
    assert.equal(getSop(AGENCY_ID, source.id)?.category, "Training");
    assert.deepEqual(getSop(AGENCY_ID, source.id)?.categories, ["Client delivery", "Training"]);

    let productCategories: string[] = [];
    mutate(state => { productCategories = state.agencyProducts[PRODUCT_ID]?.sopCategories ?? []; });
    assert.deepEqual(productCategories, ["Client delivery", "Training"]);
    assert.ok(!listSopCategories(AGENCY_ID).includes("Onboarding"));

    const removedSecondary = deleteSopCategory(AGENCY_ID, "Client delivery", undefined, ACTOR_ID);
    assert.equal(removedSecondary?.affectedSopCount, 2);
    assert.deepEqual(getSop(AGENCY_ID, source.id)?.categories, ["Training"]);
    assert.deepEqual(getSop(AGENCY_ID, source.id)?.tags, ["handover"]);
  });

  it("wires category deletion, direct organisation, and rich media uploads into the UI and API", async () => {
    const [library, categoriesRoute, uploadRoute] = await Promise.all([
      readFile(new URL("../src/app/portal/agency/sop-library/_SopLibrary.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/sops/categories/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/sops/upload/route.ts", import.meta.url), "utf8"),
    ]);

    assert.match(library, /Delete category/);
    assert.match(library, /Move, categorise or tag SOP/);
    assert.match(library, /Also appears in/);
    assert.match(library, /Filter by tag/);
    assert.match(library, /\.pptx/);
    assert.match(library, /\.mp4/);
    assert.match(categoriesRoute, /deleteSopCategory/);
    assert.match(uploadRoute, /resourceTypeFor/);
    assert.match(uploadRoute, /250 \* MB/);
    assert.match(uploadRoute, /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/);
    assert.match(uploadRoute, /video\/mp4/);
  });
});
