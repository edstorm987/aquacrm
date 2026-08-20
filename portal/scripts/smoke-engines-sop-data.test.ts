import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Structural pin: the SOP engine and the Data engine (Radar + KPI) live under src/engines/,
// their old homes are gone, and the @/engines/* paths resolve to the moved modules.
// See docs/development/STRUCTURE.md (Ed's #1 structural ask: consolidate engines into src/engines/).
// NOTE: old/new paths are built from path segments (join) so a re-run of the manifest
// move-script's string rewriter cannot silently clobber these assertions.

const ROOT = process.cwd();
const at = (...seg: string[]) => existsSync(join(ROOT, ...seg));

test("SOP engine lives under src/engines/sop/server/, old home gone", () => {
  assert.ok(at("src", "engines", "sop", "server", "sops.ts"), "sops.ts should be under src/engines/sop/server/");
  assert.ok(at("src", "engines", "sop", "server", "sopGuides.ts"), "sopGuides.ts should be under src/engines/sop/server/");
  assert.ok(!at("src", "server", "sops.ts"), "old src/server/sops.ts should be gone");
  assert.ok(!at("src", "server", "sopGuides.ts"), "old src/server/sopGuides.ts should be gone");
});

test("Data engine (Radar) lives under src/engines/data/{radar,server/radar}/, old homes gone", () => {
  assert.ok(at("src", "engines", "data", "radar", "businessRadar.ts"), "radar client should be under src/engines/data/radar/");
  assert.ok(at("src", "engines", "data", "server", "radar", "businessIssueRadar.ts"), "radar server should be under src/engines/data/server/radar/");
  assert.ok(!at("src", "lib", "radar"), "old src/lib/radar/ should be gone");
  assert.ok(!at("src", "lib", "server", "radar"), "old src/lib/server/radar/ should be gone");
});

test("Data engine (KPI) lives under src/engines/data/server/kpi/, old home gone", () => {
  assert.ok(at("src", "engines", "data", "server", "kpi", "companyHealthSnapshot.ts"), "kpi should be under src/engines/data/server/kpi/");
  assert.ok(!at("src", "lib", "server", "kpi"), "old src/lib/server/kpi/ should be gone");
});

test("@/engines/* paths resolve to the moved modules with expected exports", async () => {
  const sops = await import("@/engines/sop/server/sops");
  assert.equal(typeof sops.createWrittenSop, "function", "sops should export createWrittenSop");

  const radarClient = await import("@/engines/data/radar/radarRuleCatalog");
  assert.ok(radarClient.RADAR_SIGNAL_FAMILIES, "radar catalog should export RADAR_SIGNAL_FAMILIES");

  const radarServer = await import("@/engines/data/server/radar/businessIssueRadar");
  assert.equal(typeof radarServer.buildBusinessIssueRadar, "function", "radar server should export buildBusinessIssueRadar");

  const kpi = await import("@/engines/data/server/kpi/companyHealthSnapshot");
  assert.equal(typeof kpi.buildCompanyHealthSnapshot, "function", "kpi should export buildCompanyHealthSnapshot");
});
