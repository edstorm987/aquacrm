import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const aquaSource = readFileSync("public/business-os/lib/aqua-ai.js", "utf8");
const recommendSource = readFileSync("public/business-os/lib/recommend.js", "utf8");
const phaseAdvanceSource = readFileSync("public/business-os/lib/phase-advance.js", "utf8");
const welcomeSource = readFileSync("public/business-os/lib/welcome.js", "utf8");
const assistantUiSource = readFileSync("public/business-os/lib/aqua-ai-ui.js", "utf8");
const bosSource = readFileSync("public/business-os/bos.js", "utf8");
const toolsSource = readFileSync("public/business-os/tools.html", "utf8");

type Action = { label: string; href: string; kind?: string };

const knownAppRoutes: Record<string, string> = {
  "/client-centre": "src/app/(website)/client-centre/page.tsx",
  "/health-check": "public/health-check/index.html",
  "/tools": "src/app/(website)/tools/page.tsx",
};

function assertLiveDestination(href: string) {
  if (href.startsWith("#ai:")) return;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
  if (/^https:\/\/wa\.me\//.test(href)) {
    assert.match(href, /^https:\/\/wa\.me\/\d+$/, `WhatsApp target must include its recipient: ${href}`);
    return;
  }
  assert.ok(!/^https?:/.test(href), `Unexpected external action target: ${href}`);

  const path = new URL(href, "http://localhost/business-os/app.html").pathname.replace(/\/$/, "") || "/";
  const appFile = knownAppRoutes[path];
  if (appFile) {
    assert.ok(existsSync(appFile), `Missing app route backing ${href}: ${appFile}`);
    return;
  }
  const publicFile = `public${path}`;
  assert.ok(existsSync(publicFile), `Missing public destination ${href}: ${publicFile}`);
}

function aquaApi() {
  const values = new Map<string, string>();
  const window = {} as {
    AquaAI?: {
      respondTo(message: string, context?: Record<string, unknown>): { reply: string; suggestedActions: Action[] };
    };
  };
  vm.runInNewContext(aquaSource, {
    window,
    localStorage: {
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
    },
  });
  assert.ok(window.AquaAI);
  return window.AquaAI;
}

test("every scripted Business OS assistant action resolves to a mounted destination", () => {
  const aqua = aquaApi();
  const prompts = [
    "what phase am I", "epic intro", "blueprint phase", "diagnostics phase", "brand builder",
    "advance", "live portal", "skip phase", "how long", "phase order", "stuck", "overwhelmed",
    "where to start", "what next", "finished my lesson", "what should I do today", "biggest leak",
    "health check", "rerun", "leak estimate", "low score", "which lesson", "core principles",
    "super sales", "referral", "ops", "talk to human", "call", "urgent", "are you ai", "upgrade",
    "hello", "an unmatched request",
  ];
  const phases = ["epic-intro", "blueprint", "diagnostics", "brand-builder"];
  const actions: Action[] = [];
  for (const prompt of prompts) {
    for (const phase of phases) {
      actions.push(...aqua.respondTo(prompt, {
        phase,
        phaseLabel: phase,
        hc: { topics: [{ name: "Visibility & Search", score: 20 }] },
        hcLowest: "Visibility & Search",
        hcLowestScore: 20,
      }).suggestedActions);
    }
  }
  assert.ok(actions.length > 100, "expected the full assistant catalogue to be inventoried");
  for (const action of actions) assertLiveDestination(action.href);
});

test("Health Check recommendations and Toolbox expose only live routes", () => {
  const document = { addEventListener() {} };
  const window = {} as {
    IncubatorRecommend?: {
      fromHC(hc: unknown): Array<{ deepLinkTo: Action }>;
    };
  };
  vm.runInNewContext(recommendSource, { window, document, localStorage: { getItem() { return null; } } });
  assert.ok(window.IncubatorRecommend);
  const recommendations = window.IncubatorRecommend.fromHC({
    topics: [
      { name: "Visibility & Search", score: 10 },
      { name: "Your Website", score: 11 },
      { name: "Where Customers Come From", score: 12 },
      { name: "My Business", score: 13 },
      { name: "Keeping Them", score: 14 },
    ],
  });
  assert.ok(recommendations.length >= 3);
  for (const recommendation of recommendations) assertLiveDestination(recommendation.deepLinkTo.href);

  const toolsCatalogue = toolsSource.slice(toolsSource.indexOf("var TOOLS = ["), toolsSource.indexOf("];", toolsSource.indexOf("var TOOLS = [")));
  const toolHrefs = Array.from(toolsCatalogue.matchAll(/href:\s*'([^']+)'/g), match => match[1]);
  assert.deepEqual(toolHrefs, ["/health-check", "diagnostic.html", "quick-wins.html"]);
  for (const href of toolHrefs) assertLiveDestination(href);
});

test("retired Incubator pages, absent resources and recipient-less WhatsApp targets stay out of mounted BOS emitters", () => {
  const mountedEmitters = [aquaSource, recommendSource, phaseAdvanceSource, welcomeSource, assistantUiSource, toolsSource].join("\n");
  assert.doesNotMatch(mountedEmitters, /phase-[1-4]-[a-z-]+\.html|portal-bridge\.html|company\.html/);
  assert.doesNotMatch(mountedEmitters, /\/resources\//);
  assert.doesNotMatch(mountedEmitters, /https:\/\/wa\.me\/(?:["'\s]|$)/);
  assert.match(bosSource, /suggestedActions = res\.suggestedActions \|\| \[\]/);
  assert.match(bosSource, /actions: suggestedActions/);
});
