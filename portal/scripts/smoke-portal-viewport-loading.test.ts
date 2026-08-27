import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PortalViewportLoading } from "../src/components/ui/PortalViewportLoading";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("the portal slow-path is small, accessible, and safe on either React boundary", () => {
  const markup = renderToStaticMarkup(createElement(PortalViewportLoading, { label: "Preparing Contacts…" }));

  assert.match(markup, /data-aqua-viewport-loader="true"/);
  assert.match(markup, /data-testid="aqua-viewport-loader"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /aria-atomic="true"/);
  assert.doesNotMatch(markup, /aria-busy/);
  assert.match(markup, /data-loading-scope="route"/);
  assert.match(markup, /aqua-viewport-loading__spinner/);
  assert.match(markup, /Preparing Contacts…/);
  assert.doesNotMatch(markup, /animate-pulse|<img|<svg|<script/);
});

test("portal and Agency routes share the workspace-neutral viewport loader", async () => {
  const [component, portal, agency, layout, devTeam, client, customer, customerLayout, customerChrome, team, freelancer, styles] = await Promise.all([
    read("../src/components/ui/PortalViewportLoading.tsx"),
    read("../src/app/portal/loading.tsx"),
    read("../src/app/portal/agency/loading.tsx"),
    read("../src/app/portal/layout.tsx"),
    read("../src/app/portal/dev-team/loading.tsx"),
    read("../src/app/portal/clients/[clientId]/loading.tsx"),
    read("../src/app/portal/customer/loading.tsx"),
    read("../src/app/portal/customer/layout.tsx"),
    read("../src/app/portal/customer/_CustomerPortalChrome.tsx"),
    read("../src/app/portal/team/loading.tsx"),
    read("../src/app/portal/freelancer/loading.tsx"),
    read("../src/app/globals.css"),
  ]);

  assert.doesNotMatch(component, /^"use client"/m);
  assert.doesNotMatch(component, /lucide-react|next\/image|useEffect|useState/);
  assert.match(portal, /<PortalViewportLoading scope="workspace" \/>/);
  assert.match(agency, /<PortalViewportLoading \/>/);
  assert.match(agency, /workspace-neutral/);
  assert.doesNotMatch(agency, /Command Centre|animate-pulse|\.map\(|h-\[42rem\]/);
  assert.match(layout, /export default function PortalLayout/);
  assert.doesNotMatch(layout, /export default async function PortalLayout/);
  assert.match(layout, /<Suspense fallback=\{<PortalViewportLoading scope="workspace"/);
  assert.match(layout, /async function AuthenticatedPortalLayout/);
  for (const scoped of [devTeam, client, customer, team, freelancer]) {
    assert.match(scoped, /<PortalViewportLoading label=/);
    assert.doesNotMatch(scoped, /scope="workspace"/, "a nested workspace loader would cover its persistent chrome");
  }
  assert.match(customerLayout, /data-portal-loading-theme="client"[\s\S]*?<PortalLoadingCoordinator>/);
  assert.match(customerChrome, /mm-private-surface relative[\s\S]*?<PortalLoadingCoordinator>\{children\}<\/PortalLoadingCoordinator>/);
  assert.match(styles, /\.mm-route-canvas > \[data-aqua-loading-coordinator\] > \*\s*\{[\s\S]*?max-width:\s*100%;/);
});

test("the loader and exit curtain fill the route viewport beneath full-device cinematics", async () => {
  const [styles, devTeamLayout, coordinator, routeCanvas, portalLayout] = await Promise.all([
    read("../src/app/globals.css"),
    read("../src/app/portal/dev-team/layout.tsx"),
    read("../src/components/ui/PortalLoadingCoordinator.tsx"),
    read("../src/components/chrome/PortalRouteCanvas.tsx"),
    read("../src/app/portal/layout.tsx"),
  ]);

  assert.match(styles, /\.aqua-viewport-loading\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?z-index:\s*50;/);
  assert.match(styles, /min-height:\s*100%;/);
  assert.match(styles, /\.aqua-viewport-loading\[data-loading-scope="workspace"\]\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*9995;[\s\S]*?width:\s*100dvw;[\s\S]*?min-height:\s*100dvh;/);
  assert.match(styles, /--aqua-loading-from:\s*#071827;/);
  assert.match(styles, /linear-gradient\(145deg, var\(--aqua-loading-from\) 0%, var\(--aqua-loading-mid\) 50%, var\(--aqua-loading-to\) 100%\)/);
  assert.match(styles, /\.mm-route-canvas:has\(\[data-aqua-viewport-loader\]\),[\s\S]*?\.mm-route-canvas:has\(\[data-testid="aqua-loading-curtain"\]\)\s*\{[\s\S]*?animation:\s*none;[\s\S]*?position:\s*relative;[\s\S]*?isolation:\s*isolate;/);
  assert.match(styles, /\.mm-route-canvas:has\(\[data-aqua-loading-handover="complete"\]\)\s*\{\s*animation:\s*none;\s*\}/);
  assert.doesNotMatch(styles, /\.mm-route-canvas:has\(\[data-aqua-loading-handover="complete"\]\)\s*\{[^}]*isolation:/);
  assert.match(styles, /\.aqua-loading-curtain\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*51;[\s\S]*?height:\s*min\(100%, 100dvh\);[\s\S]*?pointer-events:\s*none;/);
  assert.match(styles, /\.aqua-loading-curtain\[data-loading-scope="workspace"\]\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*9996;[\s\S]*?width:\s*100dvw;[\s\S]*?min-height:\s*100dvh;/);
  assert.match(styles, /\.mm-command-transition\s*\{[\s\S]*?z-index:\s*10000;/);
  assert.match(styles, /\.mm-client-workspace-transition\s*\{[\s\S]*?z-index:\s*10001;/);
  assert.match(styles, /\.mm-command-transition\.mm-devmode-loadin\s*\{[\s\S]*?z-index:\s*10002;/);
  assert.match(devTeamLayout, /\.mm-dev-transition\s*\{[\s\S]*?z-index:\s*10000;/);
  assert.doesNotMatch(styles, /data-cinematic-mode="false"[^\n]*aqua-viewport-loading/);
  assert.match(coordinator, /const LOADER_REVEAL_DELAY_MS = 110;/);
  assert.match(coordinator, /const CURTAIN_DURATION_MS = 460;/);
  assert.match(coordinator, /useLayoutEffect\(\(\) =>/);
  assert.match(coordinator, /const mutationContainsLoader = \(node: Node\)/);
  assert.match(coordinator, /records\.some\(record =>[\s\S]*?addedNodes[\s\S]*?removedNodes[\s\S]*?some\(mutationContainsLoader\)/);
  assert.match(coordinator, /loader\.closest<HTMLElement>\("\[data-aqua-loading-coordinator\]"\) === root/);
  assert.match(coordinator, /performance\.now\(\) - startedAt < LOADER_REVEAL_DELAY_MS/);
  assert.match(coordinator, /setHandoverComplete\(true\)/);
  assert.match(coordinator, /data-aqua-loading-handover=\{handoverComplete \? "complete" : undefined\}/);
  assert.match(coordinator, /aqua-loading-curtain__half--left/);
  assert.match(coordinator, /aqua-loading-curtain__half--right/);
  assert.match(routeCanvas, /<PortalLoadingCoordinator>\{children\}<\/PortalLoadingCoordinator>/);
  assert.match(portalLayout, /<PortalLoadingCoordinator scope="workspace">/);
});

test("normal, Command, Dev Team, and client workspaces change only the loader palette", async () => {
  const styles = await read("../src/app/globals.css");

  assert.match(styles, /\.mm-route-canvas\[data-portal-shell="command"\] :is\(\.aqua-viewport-loading, \.aqua-loading-curtain\)\s*\{[\s\S]*?--aqua-loading-accent:\s*#62e8ff;/);
  assert.match(styles, /\.mm-dev-team-shell :is\(\.aqua-viewport-loading, \.aqua-loading-curtain\)\s*\{[\s\S]*?--aqua-loading-accent:\s*#d4ad76;/);
  assert.match(styles, /\.mm-client-workspace-shell :is\(\.aqua-viewport-loading, \.aqua-loading-curtain\),[\s\S]*?\.mm-customer-portal :is\(\.aqua-viewport-loading, \.aqua-loading-curtain\),[\s\S]*?\[data-portal-loading-theme="client"\] :is\(\.aqua-viewport-loading, \.aqua-loading-curtain\)\s*\{[\s\S]*?--aqua-loading-accent:\s*#78d7ee;/);
  assert.match(styles, /\.aqua-viewport-loading__label\s*\{[\s\S]*?color:\s*rgb\(255 255 255 \/ 0\.9\);/);
  assert.equal((styles.match(/\.aqua-viewport-loading__content\s*\{/g) ?? []).length, 1, "themes forked the loader markup");
});

test("the loader avoids flashes and respects reduced motion", async () => {
  const styles = await read("../src/app/globals.css");

  assert.match(styles, /animation:\s*aqua-viewport-loading-reveal 180ms ease-out 110ms both;/);
  assert.match(styles, /animation:\s*aqua-viewport-loading-spin 760ms linear infinite;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.aqua-viewport-loading\s*\{[\s\S]*?animation:\s*none;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.aqua-viewport-loading__spinner,[\s\S]*?\.aqua-inline-loading-spinner\s*\{[\s\S]*?animation:\s*none;/);
  assert.match(styles, /@keyframes aqua-loading-curtain-left\s*\{[\s\S]*?translateX\(-102%\)/);
  assert.match(styles, /@keyframes aqua-loading-curtain-right\s*\{[\s\S]*?translateX\(102%\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.aqua-loading-curtain\s*\{[\s\S]*?display:\s*none;/);
});

test("major streamed workspaces no longer paint placeholder blocks", async () => {
  const [dashboard, library, logs, automations, actions, advisor] = await Promise.all([
    read("../src/app/portal/dev-team/page.tsx"),
    read("../src/app/portal/dev-team/library/page.tsx"),
    read("../src/app/portal/dev-team/logs/_Section.tsx"),
    read("../src/app/portal/agency/automations/_AutomationsWorkspace.tsx"),
    read("../src/app/portal/agency/actions/_LazyActionsWorkspace.tsx"),
    read("../src/app/portal/agency/assistant/_LazyAssistantWorkspace.tsx"),
  ]);

  assert.match(dashboard, /DashboardFallback\(\)[\s\S]*?<PortalViewportLoading/);
  assert.doesNotMatch(dashboard.match(/function DashboardFallback\(\)[\s\S]*?\n\}/)?.[0] ?? "", /animate-pulse|h-36|h-40|\.map\(/);
  assert.match(library, /testId="dev-team-library-view-loading"/);
  assert.doesNotMatch(logs, /LogsSectionFallback|<Suspense/, "Logs gained a second full-viewport fallback");
  assert.match(automations, /function CanvasSkeleton\(\)[\s\S]*?<PortalViewportLoading/);
  assert.match(actions, /<PortalViewportLoading label="Preparing Command Centre Actions…"/);
  assert.match(advisor, /<PortalViewportLoading label="Preparing Aqua Advisor…"/);
});
