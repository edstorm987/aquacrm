import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAquaEmbedToken,
  verifyAquaEmbedToken,
} from "../src/lib/server/aquaEmbedToken";

test("Aqua embed tokens are scoped, short lived and tamper resistant", () => {
  const issued = createAquaEmbedToken({
    agencyId: "agency_test",
    clientId: "cli_test",
    credentialId: "int_embed_test",
    credentialVersion: "a".repeat(64),
    mode: "admin",
    origin: "http://localhost:3037",
    ttlSeconds: 60,
    now: 1_000,
  });
  const payload = verifyAquaEmbedToken(issued.token, 1_001);
  assert.equal(payload?.clientId, "cli_test");
  assert.equal(payload?.agencyId, "agency_test");
  assert.equal(payload?.credentialId, "int_embed_test");
  assert.equal(payload?.credentialVersion, "a".repeat(64));
  assert.equal(payload?.mode, "admin");
  assert.equal(payload?.origin, "http://localhost:3037");
  assert.equal(verifyAquaEmbedToken(`${issued.token}x`, 1_001), null);
  assert.equal(verifyAquaEmbedToken(issued.token, 1_061), null);
});

test("new integrations use the Aqua namespace while the old route remains an alias", () => {
  const source = readFileSync("src/lib/integrations/aquaTagSource.ts", "utf8");
  const currentRoute = readFileSync("src/app/aqua-tag.js/route.ts", "utf8");
  const compatibilityRoute = readFileSync("src/app/milesy-tag.js/route.ts", "utf8");
  const consumeRoute = readFileSync("src/app/api/v1/embed/consume/route.ts", "utf8");
  const handlers = readFileSync("src/lib/server/embedSessionHandlers.ts", "utf8");
  assert.match(source, /window\.Aqua = tracker/);
  assert.match(source, /data-aqua-conversion/);
  assert.match(currentRoute, /aquaTagResponse/);
  assert.match(compatibilityRoute, /successor-version/);
  assert.match(consumeRoute, /handleEmbedSessionConsume/);
  assert.match(handlers, /sessionCookie/);
  assert.match(handlers, /"\/embed\/account"/);
});
