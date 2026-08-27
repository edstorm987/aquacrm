import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const read = (path: string) => readFileSync(path, "utf8");

test("the static Health Check loads its question pack before constructing AREAS", () => {
  const page = read("public/health-check/index.html");
  const pack = '<script src="/health-check/hc-questions.js"></script>';
  assert.ok(page.includes(pack));
  assert.doesNotMatch(page, /<script\s+defer\s+src="\/health-check\/hc-questions\.js"/);
  assert.ok(page.indexOf(pack) < page.indexOf("var AREAS ="));
});

test("the Health Check question pack contains five complete three-tier topics", () => {
  const context = { window: {} as { HC_AREAS?: unknown } };
  vm.runInNewContext(read("public/health-check/hc-questions.js"), context);
  const areas = context.window.HC_AREAS as Array<{
    id: string;
    tiers: Record<string, { exercise?: unknown[] }>;
  }>;

  assert.equal(areas.length, 5);
  assert.equal(new Set(areas.map(area => area.id)).size, 5);
  for (const area of areas) {
    assert.deepEqual(Object.keys(area.tiers).sort(), ["beginner", "intermediate", "professional"]);
    for (const tier of Object.values(area.tiers)) {
      assert.ok(Array.isArray(tier.exercise) && tier.exercise.length > 0);
    }
  }
});

test("legacy deep links land on the feature they promise", () => {
  const clientPage = read("src/app/portal/clients/[clientId]/page.tsx");
  assert.match(read("src/app/portal/agency/sops/page.tsx"), /redirect\("\/portal\/agency\/sop-library"\)/);
  const preferences = read("src/app/portal/account/preferences/page.tsx");
  assert.match(preferences, /session\.publicShowcase\) redirect\("\/portal\/account\/permissions"\)/);
  assert.match(preferences, /redirect\("\/portal\/agency\/settings#notifications"\)/);
  assert.match(read("src/lib/clients/clientWorkspace.ts"), /\{ id: "systems", label: "Systems" \}/);
  assert.match(clientPage, /Systems is also the evidence destination[\s\S]*"systems"/);
});

test("showcase editor is read-only, omits Dev mode and never loads its assistant", () => {
  const page = read("src/app/portal/agency/portals/editor/page.tsx");
  const editor = read("src/engines/editor/DevEditor.tsx");
  assert.match(page, /session\.publicShowcase \? false : props\.canManage/);
  assert.match(page, /developerModeAvailable=\{!session\.publicShowcase\}/);
  assert.match(page, /session\.publicShowcase \? undefined : await loadEditorAssistant/);
  assert.match(editor, /available=\{!canManage \? \["visual"\] : developerModeAvailable \? undefined : \["assist", "visual"\]\}/);
  assert.match(editor, /if \(!canManage && next !== "visual"\) return/);
  assert.match(editor, /if \(next === "developer" && !developerModeAvailable\) return/);
  assert.match(editor, /Read-only preview/);
});

test("mobile editor chrome wraps into bounded rows before desktop", () => {
  const editor = read("src/engines/editor/DevEditor.tsx");
  const devices = read("src/components/editing/DeviceControl.tsx");
  assert.match(editor, /row-start-2 flex min-w-0 flex-wrap items-center/);
  assert.match(editor, /sm:flex-nowrap sm:overflow-x-auto/);
  assert.match(editor, /row-start-3 grid min-w-0 grid-cols-1/);
  assert.match(editor, /sm:grid-cols-2 xl:col-auto.*xl:flex/);
  assert.match(devices, /max-w-full min-w-0 items-center gap-1\.5 overflow-x-auto/);
});

test("showcase data adapters do not query live inbox, website or Radar sources", () => {
  const search = read("src/app/api/portal/search/route.ts");
  const client = read("src/app/portal/clients/[clientId]/page.tsx");
  assert.match(search, /if \(!isolatedShowcase\) \{/);
  assert.match(search, /Boolean\(session\.publicShowcase\)/);
  assert.match(client, /tab === "notes" && !session\.isDemo/);
});
