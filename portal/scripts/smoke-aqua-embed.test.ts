import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAquaEmbedToken,
  matchesEmbedApiToken,
  verifyAquaEmbedToken,
} from "../src/lib/server/aquaEmbedToken";

test("Aqua embed tokens are scoped, short lived and tamper resistant", () => {
  const issued = createAquaEmbedToken({
    clientId: "cli_test",
    mode: "admin",
    origin: "http://localhost:3037",
    ttlSeconds: 60,
    now: 1_000,
  });
  const payload = verifyAquaEmbedToken(issued.token, 1_001);
  assert.equal(payload?.clientId, "cli_test");
  assert.equal(payload?.mode, "admin");
  assert.equal(payload?.origin, "http://localhost:3037");
  assert.equal(verifyAquaEmbedToken(`${issued.token}x`, 1_001), null);
  assert.equal(verifyAquaEmbedToken(issued.token, 1_061), null);
});

test("local server-to-server credential remains unavailable to random callers", () => {
  assert.equal(matchesEmbedApiToken("local-aqua-embed"), true);
  assert.equal(matchesEmbedApiToken("wrong-token"), false);
});

test("new integrations use the Aqua namespace while the old route remains an alias", () => {
  const source = readFileSync("src/lib/integrations/aquaTagSource.ts", "utf8");
  const currentRoute = readFileSync("src/app/aqua-tag.js/route.ts", "utf8");
  const compatibilityRoute = readFileSync("src/app/milesy-tag.js/route.ts", "utf8");
  const consumeRoute = readFileSync("src/app/api/v1/embed/consume/route.ts", "utf8");
  assert.match(source, /window\.Aqua = tracker/);
  assert.match(source, /data-aqua-conversion/);
  assert.match(currentRoute, /aquaTagResponse/);
  assert.match(compatibilityRoute, /successor-version/);
  assert.match(consumeRoute, /sessionCookie/);
  assert.match(consumeRoute, /portal.customer/);
});
