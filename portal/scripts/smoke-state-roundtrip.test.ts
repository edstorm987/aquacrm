import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every PortalState collection must survive a hydration.
//
// `parseBlob` rebuilds state field by field with NO `...parsed` spread, so a
// collection missing from that object literal is silently DESTROYED on load and
// then written back out empty on the next save. Four were missing —
// `agencyMasterTagKeys`, `websiteSources`, `websiteSiteConfigs` and
// `enquiryContactDetails` — which meant the whole Aqua Tag routing layer (the
// master site key per agency, where each tagged site's submissions go, and the
// per-site config) had never once survived a server restart. Proven by sentinel
// round-trip on 2026-08-20 and fixed the same day.
//
// The list is DERIVED from the type, not typed out here, so collection 79
// cannot be added without either being handled or failing this test.

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function portalStateKeys(): string[] {
  const source = readFileSync(join(ROOT, "src/server/types.ts"), "utf8");
  const start = source.indexOf("export interface PortalState {");
  assert.ok(start >= 0, "PortalState interface not found");
  let depth = 0;
  let end = start;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = source.slice(start, end);
  return [...new Set(
    [...body.matchAll(/^ {2}([a-zA-Z][A-Za-z0-9]*)\??:/gm)].map(m => m[1]),
  )].sort();
}

test("every PortalState collection is rebuilt by parseBlob", () => {
  const storage = readFileSync(join(ROOT, "src/server/storage.ts"), "utf8");
  const start = storage.indexOf("function parseBlob");
  assert.ok(start >= 0, "parseBlob not found");
  const segment = storage.slice(start, start + 12_000);

  // A spread would make this test unnecessary — if someone adds one, say so
  // rather than silently passing for the wrong reason.
  const spreads = /\.\.\.parsed\b/.test(segment);

  const missing = portalStateKeys().filter(key =>
    !new RegExp(`^\\s+${key}:`, "m").test(segment));

  assert.deepEqual(
    missing,
    [],
    spreads
      ? `parseBlob spreads parsed but still omits: ${missing.join(", ")}`
      : `parseBlob rebuilds state field by field with no spread, so these are DESTROYED on every ` +
        `hydration: ${missing.join(", ")}. Add a line for each.`,
  );
});

test("every PortalState collection has an empty() default", () => {
  const storage = readFileSync(join(ROOT, "src/server/storage.ts"), "utf8");
  const start = storage.indexOf("const empty = (): PortalState => ({");
  assert.ok(start >= 0, "empty() not found");
  const segment = storage.slice(start, storage.indexOf("\n});", start));

  const missing = portalStateKeys().filter(key =>
    !new RegExp(`^\\s+${key}:`, "m").test(segment));

  // `radarInfraHealth` is a single optional snapshot, not a collection — an
  // absent snapshot is meaningful, so it is the one legitimate omission.
  assert.deepEqual(
    missing,
    ["radarInfraHealth"],
    `empty() must give every collection a starting value. Unexpected omissions: ` +
    `${missing.filter(k => k !== "radarInfraHealth").join(", ")}`,
  );
});

test("a blob's additive collections survive hydration end to end", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  const dir = mkdtempSync(join(tmpdir(), "state-roundtrip-"));
  const file = join(dir, "state.json");
  writeFileSync(file, JSON.stringify({
    agencies: {}, clients: {}, users: {},
    agencyMasterTagKeys: { "agency-1": "aqua_master_SENTINEL" },
    websiteSources: { "src-1": { id: "src-1", agencyId: "agency-1" } },
    websiteSiteConfigs: { "src-1": { injections: ["SENTINEL"] } },
    enquiryContactDetails: { "enq-1": { phone: "SENTINEL" } },
    operationalAlertSourceEpisodes: {
      "agency-1|website-enquiries": { agencyId: "agency-1", sourceId: "website-enquiries", startedAt: 123 },
    },
  }));

  // Point THIS process at its own file before storage is first imported.
  process.env.PORTAL_DATA_FILE = file;
  process.env.PORTAL_BACKEND = "file";

  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  const state = storage.getState() as unknown as Record<string, Record<string, unknown>>;

  for (const key of ["agencyMasterTagKeys", "websiteSources", "websiteSiteConfigs", "enquiryContactDetails", "operationalAlertSourceEpisodes"]) {
    assert.equal(
      Object.keys(state[key] ?? {}).length,
      1,
      `${key} was dropped during hydration — the Aqua Tag routing layer does not survive a restart`,
    );
  }
  assert.equal(state.agencyMasterTagKeys["agency-1"], "aqua_master_SENTINEL");
  assert.equal(
    (state.operationalAlertSourceEpisodes["agency-1|website-enquiries"] as { startedAt?: unknown }).startedAt,
    123,
  );
});
