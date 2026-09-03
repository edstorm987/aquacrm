import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

type Access = typeof import("../src/lib/server/access/websiteEnquiryAccess");
let access: Access;

before(async () => {
  access = await import("../src/lib/server/access/websiteEnquiryAccess");
});

describe("website enquiry semantic access", () => {
  it("recognises old and current client links and fails closed on disagreement", () => {
    assert.deepEqual(access.websiteEnquiryLinkedClientIds({
      metadata: {
        clientId: "client-current",
        identityResolution: { clientId: "client-older" },
      },
    }), ["client-current", "client-older"]);
    assert.deepEqual(access.websiteEnquiryLinkedClientIds({
      metadata: { clientId: " client-a ", identityResolution: { clientId: "client-a" } },
    }), ["client-a"]);
  });

  it("gates every enquiry mutation through Inbox Use and a live actor-aware load", () => {
    for (const name of ["classification", "reply", "lead", "calls", "communications", "contact-details"]) {
      const source = readFileSync(`src/app/api/portal/website-enquiries/${name}/route.ts`, "utf8");
      assert.match(source, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "use"\)/, `${name} lost Inbox Use`);
      assert.match(source, /loadActorWebsiteEnquiry/, `${name} lost live enquiry authorization`);
      assert.doesNotMatch(source, /agencyId: session\.agencyId/, `${name} writes through the cookie tenant instead of the active resource realm`);
    }
  });

  it("rechecks before provider delivery and private file staging", () => {
    const communications = readFileSync("src/app/api/portal/website-enquiries/communications/route.ts", "utf8");
    const deliveryLoad = communications.indexOf("const deliveryEnquiry = await loadActorWebsiteEnquiry");
    const delivery = communications.indexOf("const result = channel ===");
    assert.ok(deliveryLoad >= 0 && delivery > deliveryLoad, "communication provider runs before the live association check");

    const recording = readFileSync("src/app/api/portal/website-enquiries/calls/recording/route.ts", "utf8");
    const stagingLoad = recording.indexOf("const stagingData = await loadActorWebsiteEnquiry");
    const staging = recording.indexOf("const stored = await storePrivateUpload");
    assert.ok(stagingLoad >= 0 && staging > stagingLoad, "recording bytes are staged before the live association check");

    const media = readFileSync("src/app/api/portal/inbox/media/route.ts", "utf8");
    const targetLoad = media.indexOf("inboxMediaTargetExistsForActor(actor, targetKind, targetId, \"use\")");
    const begin = media.indexOf("await beginStagedPrivateUpload");
    assert.ok(targetLoad >= 0 && begin > targetLoad, "inbox media is staged before resolving its live target");
  });

  it("requires Inbox View and live target authorization for private reads", () => {
    for (const path of [
      "src/app/api/portal/website-enquiries/calls/recording/content/route.ts",
      "src/app/api/portal/inbox/media/content/route.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      assert.match(source, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "view"\)/);
      assert.match(source, /required: "view"|, "view"\)/);
    }
  });
});
