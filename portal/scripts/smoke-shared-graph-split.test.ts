import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import { AGENCY_SIDEBAR_PLUGIN_CATALOG } from "../src/lib/chrome/agencySidebarPluginCatalog";
import type { PluginInstall } from "../src/server/types";

// `import.meta.dirname` is undefined when this file is loaded through tsx's
// CJS transform, which threw before a single assertion ran. `import.meta.url`
// is populated in both loaders.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENCY_LAYOUT = join(ROOT, "src/app/portal/agency/layout.tsx");
const AGENCY_PAGE = join(ROOT, "src/app/portal/agency/page.tsx");
const SIDEBAR_LAYOUT = join(ROOT, "src/lib/chrome/sidebarLayout.ts");
const LEADS_REPAIR = join(ROOT, "src/lib/server/plugins/ensureLeadsPipelineInstall.ts");
const OPERATIONAL_ALERTS = join(ROOT, "src/lib/server/inbox/operationalAlerts.ts");
const BUSINESS_ISSUE_RADAR = join(ROOT, "src/engines/data/server/radar/businessIssueRadar.ts");
const ACCESS_CONTROL = join(ROOT, "src/server/accessControl.ts");
const WORKSPACE_ELEMENT_ACCESS = join(ROOT, "src/lib/server/access/workspaceElementAccess.ts");
const DEV_DOCS = join(ROOT, "src/lib/server/dev/devDocs.ts");
const DEV_TEAM_BOARD = join(ROOT, "src/lib/server/dev/devTeamBoard.ts");
const SANDBOX_ENVIRONMENT = join(ROOT, "src/lib/server/sandbox/sandboxEnvironment.ts");
const PLUGIN_REGISTRY = join(ROOT, "src/built-ins/runtime/_registry.ts");
const PLUGIN_RUNTIME = join(ROOT, "src/built-ins/runtime/_runtime.ts");
const DEMO_SEED = join(ROOT, "src/lib/server/seeds/demoSeed.ts");
const WEBSITE_EDITOR_ROOT = `${normalize(join(ROOT, "src/built-ins/modules/website-editor"))}${sep}`;

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const TS_PATHS = JSON.parse(readFileSync(join(ROOT, "tsconfig.json"), "utf8"))
  .compilerOptions.paths as Record<string, string[]>;

function aliasCandidates(specifier: string): string[] {
  const candidates: string[] = [];
  for (const [pattern, targets] of Object.entries(TS_PATHS)) {
    const wildcard = pattern.indexOf("*");
    let captured = "";
    if (wildcard < 0) {
      if (specifier !== pattern) continue;
    } else {
      const prefix = pattern.slice(0, wildcard);
      const suffix = pattern.slice(wildcard + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
      captured = specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    for (const target of targets) {
      candidates.push(resolve(ROOT, wildcard < 0 ? target : target.replace("*", captured)));
    }
  }
  return candidates;
}

function resolveCandidate(candidate: string): string | null {
  const candidates = extname(candidate)
    ? [candidate]
    : [
        ...SOURCE_EXTENSIONS.map(extension => `${candidate}${extension}`),
        ...SOURCE_EXTENSIONS.map(extension => join(candidate, `index${extension}`)),
      ];
  return candidates.find(file => existsSync(file)) ?? null;
}

function resolveSource(fromFile: string, specifier: string): string | null {
  const candidates = specifier.startsWith(".")
    ? [resolve(dirname(fromFile), specifier)]
    : aliasCandidates(specifier);
  for (const candidate of candidates) {
    const resolved = resolveCandidate(candidate);
    if (resolved) return resolved;
  }
  return null;
}

function localImports(file: string, includeDynamic: boolean): string[] {
  const source = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
  const imports = new Set<string>();
  const add = (specifier: string) => {
    const target = resolveSource(file, specifier);
    if (target) imports.add(normalize(target));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text);
    } else if (includeDynamic && ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0].text);
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return [...imports];
}

function collectGraph(entry: string, includeDynamic: boolean): Map<string, string | null> {
  const parents = new Map<string, string | null>([[normalize(entry), null]]);
  const pending = [normalize(entry)];
  while (pending.length > 0) {
    const file = pending.pop()!;
    for (const imported of localImports(file, includeDynamic)) {
      if (parents.has(imported)) continue;
      parents.set(imported, file);
      pending.push(imported);
    }
  }
  return parents;
}

const collectReachableGraph = (entry: string) => collectGraph(entry, true);
const collectStaticGraph = (entry: string) => collectGraph(entry, false);

function importTrace(graph: Map<string, string | null>, target: string): string {
  const normalizedTarget = normalize(target);
  if (!graph.has(normalizedTarget)) return "not in graph";
  const chain: string[] = [];
  let cursor: string | null = normalizedTarget;
  while (cursor) {
    chain.unshift(cursor.slice(ROOT.length + 1));
    cursor = graph.get(cursor) ?? null;
  }
  return chain.join(" -> ");
}

function emailSenderInstall(enabled: boolean): PluginInstall {
  return {
    id: "agency-1|_agency|email-sender",
    pluginId: "email-sender",
    agencyId: "agency-1",
    enabled,
    config: {},
    features: {},
    installedAt: 1,
  };
}

test("shared agency chrome has no reachable path to the executable plugin registry/runtime/editor", () => {
  const sidebarGraph = collectReachableGraph(SIDEBAR_LAYOUT);
  assert.equal(
    sidebarGraph.has(normalize(PLUGIN_REGISTRY)),
    false,
    `sidebar pulled the registry through ${importTrace(sidebarGraph, PLUGIN_REGISTRY)}`,
  );

  const agencyGraph = collectReachableGraph(AGENCY_LAYOUT);
  assert.equal(
    agencyGraph.has(normalize(PLUGIN_REGISTRY)),
    false,
    `agency layout pulled the registry through ${importTrace(agencyGraph, PLUGIN_REGISTRY)}`,
  );
  assert.equal(
    agencyGraph.has(normalize(PLUGIN_RUNTIME)),
    false,
    `agency layout pulled the runtime through ${importTrace(agencyGraph, PLUGIN_RUNTIME)}`,
  );
  const editorModules = [...agencyGraph.keys()]
    .filter(file => file.startsWith(WEBSITE_EDITOR_ROOT))
    .map(file => file.slice(ROOT.length + 1));
  assert.deepEqual(editorModules, [], "agency layout still reaches website-editor modules");

  const agencySource = readFileSync(AGENCY_LAYOUT, "utf8");
  assert.doesNotMatch(agencySource, /built-ins\/runtime\/_runtime/, "layout has a dynamic runtime escape hatch again");
  assert.match(agencySource, /ensureLeadsPipelineInstall\(agency\.id, session\.userId\)/);
});

test("owner and manager agency chrome retain the personal My Radar destination", () => {
  for (const role of ["agency-owner", "agency-manager"] as const) {
    const panels = buildSidebar({ role, scope: "agency", installedPlugins: [] });
    const myRadar = panels.flatMap(panel => panel.items).filter(item => item.id === "my-radar");
    assert.equal(myRadar.length, 1);
    assert.equal(myRadar[0]?.href, "/portal/agency/my-radar");
  }
});

test("healthy owner chrome defers repair, alert sweep, and delegated-staff access graphs", () => {
  const staticGraph = collectStaticGraph(AGENCY_LAYOUT);
  for (const deferred of [LEADS_REPAIR, OPERATIONAL_ALERTS, BUSINESS_ISSUE_RADAR, ACCESS_CONTROL, WORKSPACE_ELEMENT_ACCESS]) {
    assert.equal(
      staticGraph.has(normalize(deferred)),
      false,
      `healthy owner shell still statically reaches ${deferred.slice(ROOT.length + 1)} through ${importTrace(staticGraph, deferred)}`,
    );
  }

  const agencySource = readFileSync(AGENCY_LAYOUT, "utf8");
  assert.match(agencySource, /!installs\.some\(install => install\.pluginId === "leads-pipeline" && install\.enabled\)[\s\S]*await import\("@\/lib\/server\/plugins\/ensureLeadsPipelineInstall"\)/);
  assert.match(agencySource, /if \(!perfMode && !session\.publicShowcase && !delegatedStaff && inboxAvailable\) \{\s*const \{ getRequestOperationalAlerts \} = await import\("@\/lib\/server\/inbox\/operationalAlerts"\)/);
  // The delegated-staff narrowing moved into the SHARED assembler on
  // 2026-08-30 (so the department-switch route could ask "which nav does this
  // session have" without forking the answer). The deferral guarantee is
  // unchanged — the assembler still reaches the access graphs through dynamic
  // import, and the static-graph walk above proves it — only the file holding
  // the pattern moved.
  const assemblerSource = readFileSync(join(ROOT, "src/lib/server/chrome/agencyBasePanels.ts"), "utf8");
  assert.match(assemblerSource, /if \(!delegatedStaff\) \{[\s\S]*import\("@\/server\/accessControl"\)[\s\S]*import\("@\/lib\/server\/access\/workspaceElementAccess"\)/);
  assert.match(agencySource, /assembleAgencyBasePanels\(session\)/,
    "the layout no longer uses the shared assembler — the route and the layout can fork again");

  for (const controlPath of [
    join(ROOT, "src/components/chrome/RadarQuickLookControl.tsx"),
    join(ROOT, "src/components/chrome/AdvisorDrawerControl.tsx"),
  ]) {
    const control = readFileSync(controlPath, "utf8");
    assert.match(control, /lightweight[\s\S]*buildPausedBusinessRadar/);
    assert.match(control, /await import\("@\/engines\/data\/server\/radar\/businessIssueRadar"\)/);
    assert.doesNotMatch(control, /^import \{ getCachedBusinessIssueRadar \}/m);
  }
  assert.match(agencySource, /<RadarQuickLookControl[^>]*lightweight=\{perfMode\}/);
  assert.match(agencySource, /<AdvisorDrawerControl[^>]*lightweight=\{perfMode\}/);
});

test("pristine Agency page keeps Dev Docs and the Dev Team board scanner outside its static graph", () => {
  const staticGraph = collectStaticGraph(AGENCY_PAGE);
  for (const deferred of [DEV_DOCS, DEV_TEAM_BOARD]) {
    assert.equal(
      staticGraph.has(normalize(deferred)),
      false,
      `pristine Agency page still reaches ${deferred.slice(ROOT.length + 1)} through ${importTrace(staticGraph, deferred)}`,
    );
  }

  const source = readFileSync(AGENCY_PAGE, "utf8");
  assert.match(source, /import \{ devTeamAccessible \} from "@\/lib\/server\/dev\/devTeamAccess"/);
  assert.doesNotMatch(source, /^import .*devDocs/m);
  assert.doesNotMatch(source, /^import .*devTeamBoard/m);
  assert.match(source, /if \(devTeamVisible && !lightweightMode\) \{\s*const \{ composeLanes, scanDevTeamBoard \} = await import\("@\/lib\/server\/dev\/devTeamBoard"\)/);
});

test("lightweight agency catalog preserves enabled Email Sender Logs exactly", async () => {
  const { default: emailSenderManifest } = await import("../src/built-ins/modules/email-sender/index");
  assert.deepEqual(
    AGENCY_SIDEBAR_PLUGIN_CATALOG.find(plugin => plugin.id === "email-sender")?.navItems,
    emailSenderManifest.navItems,
    "lightweight email navigation drifted from the executable manifest",
  );

  const panels = buildSidebar({
    role: "agency-owner",
    scope: "agency",
    installedPlugins: [emailSenderInstall(true)],
    pluginCatalog: AGENCY_SIDEBAR_PLUGIN_CATALOG,
  });
  const logs = panels.flatMap(panel => panel.items).filter(item => item.id === "email-sender.logs");
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.label, "Logs");
  assert.equal(logs[0]?.href, "/portal/agency/email-sender/logs");
  assert.equal(logs[0]?.panelId, "settings");

  const disabledPanels = buildSidebar({
    role: "agency-owner",
    scope: "agency",
    installedPlugins: [emailSenderInstall(false)],
    pluginCatalog: AGENCY_SIDEBAR_PLUGIN_CATALOG,
  });
  assert.equal(
    disabledPanels.flatMap(panel => panel.items).some(item => item.id === "email-sender.logs"),
    false,
  );
});

test("targeted leads repair mirrors the manifest without importing the global runtime", async () => {
  const { default: leadsManifest } = await import("../src/built-ins/modules/leads-pipeline/index");
  const repair = await import("../src/lib/server/plugins/ensureLeadsPipelineInstall");
  const manifestConfig = Object.fromEntries(
    leadsManifest.settings.groups.flatMap(group => group.fields)
      .filter(field => field.default !== undefined)
      .map(field => [field.id, field.default]),
  );
  const manifestFeatures = Object.fromEntries(leadsManifest.features.map(feature => [feature.id, feature.default]));
  assert.deepEqual(repair.LEADS_PIPELINE_DEFAULT_CONFIG, manifestConfig);
  assert.deepEqual(repair.LEADS_PIPELINE_DEFAULT_FEATURES, manifestFeatures);
  assert.equal(leadsManifest.requires, undefined, "targeted repair must learn about new dependencies before they ship");
  assert.equal(leadsManifest.conflicts, undefined, "targeted repair must learn about new conflicts before they ship");
  assert.equal(leadsManifest.onEnable, undefined, "targeted repair must learn about a new onEnable hook before it ships");
  assert.equal(leadsManifest.onDisable, undefined, "targeted repair must learn about a new onDisable hook before it ships");

  const graph = collectReachableGraph(LEADS_REPAIR);
  assert.equal(graph.has(normalize(PLUGIN_REGISTRY)), false, importTrace(graph, PLUGIN_REGISTRY));
  assert.equal(graph.has(normalize(PLUGIN_RUNTIME)), false, importTrace(graph, PLUGIN_RUNTIME));
  assert.deepEqual(
    [...graph.keys()].filter(file => file.startsWith(WEBSITE_EDITOR_ROOT)),
    [],
    "targeted leads repair reaches website-editor",
  );
});

test("targeted leads repair installs and re-enables legacy state with runtime-equivalent events", async () => {
  const storage = await import("../src/server/storage");
  const installs = await import("../src/server/pluginInstalls");
  const eventBus = await import("../src/server/eventBus");
  const repair = await import("../src/lib/server/plugins/ensureLeadsPipelineInstall");
  const realmId = `shared-graph-leads-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await storage.replaceDataRealmState(realmId, storage.createEmptyPortalState());

  await storage.runInDataRealm(realmId, async () => {
    await storage.ensureHydrated({ preserveExplicitRealm: true });
    const seen: string[] = [];
    const unsubscribe = eventBus.on("*", event => {
      if (event.name === "plugin.installed" || event.name === "plugin.enabled") seen.push(event.name);
    });
    try {
      const installed = repair.ensureLeadsPipelineInstall("agency-legacy", "user-owner");
      assert.equal(installed.ok, true);
      assert.equal(installed.ok && installed.changed, "installed");
      const row = installs.getInstall({ agencyId: "agency-legacy" }, repair.LEADS_PIPELINE_PLUGIN_ID);
      assert.ok(row?.enabled);
      assert.deepEqual(row.config, repair.LEADS_PIPELINE_DEFAULT_CONFIG);
      assert.deepEqual(row.features, repair.LEADS_PIPELINE_DEFAULT_FEATURES);

      installs.patchInstall({ agencyId: "agency-legacy" }, repair.LEADS_PIPELINE_PLUGIN_ID, { enabled: false });
      const enabled = repair.ensureLeadsPipelineInstall("agency-legacy", "user-owner");
      assert.equal(enabled.ok, true);
      assert.equal(enabled.ok && enabled.changed, "enabled");
      assert.equal(installs.getInstall({ agencyId: "agency-legacy" }, repair.LEADS_PIPELINE_PLUGIN_ID)?.enabled, true);

      await new Promise<void>(resolveDone => setImmediate(resolveDone));
      assert.deepEqual(seen, ["plugin.installed", "plugin.enabled"]);
    } finally {
      unsubscribe();
    }
  });
});

test("empty, snapshot and exit sandbox paths do not statically load demo seeding", () => {
  const graph = collectStaticGraph(SANDBOX_ENVIRONMENT);
  assert.equal(
    graph.has(normalize(DEMO_SEED)),
    false,
    `sandbox environment pulled demo seeding through ${importTrace(graph, DEMO_SEED)}`,
  );

  const source = readFileSync(SANDBOX_ENVIRONMENT, "utf8");
  assert.match(
    source,
    /async function prepareDemo\([\s\S]*?const demoSeed = await import\("@\/lib\/server\/seeds\/demoSeed"\)/,
    "demo seeding must remain a dynamic import inside prepareDemo",
  );
  assert.doesNotMatch(
    source,
    /^import[\s\S]*?from "@\/lib\/server\/seeds\/demoSeed";/m,
    "demoSeed returned to the sandbox module's static imports",
  );
});
