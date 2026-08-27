import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MILESYMEDIA_CONTACT_PATH,
  MILESYMEDIA_HOME_PATH,
  MILESYMEDIA_SERVICES_PATH,
} from "../src/lib/public/milesymediaRoutes";

const read = (path: string) => readFileSync(path, "utf8");

const reactMilesymediaSurfaces = [
  "src/app/(website)/WebsiteShell.tsx",
  "src/app/(website)/WebsitePageUpdating.tsx",
  "src/app/(website)/client-centre/page.tsx",
  "src/app/(website)/portfolio/page.tsx",
  "src/app/(website)/portfolio/ocean-boulevard/page.tsx",
  "src/app/(website)/portfolio/beast-commerce/page.tsx",
];

const staticBusinessOsSurfaces = [
  "public/business-os/app.html",
  "public/business-os/tools.html",
  "public/business-os/quick-wins.html",
  "public/business-os/diagnostic.html",
  "public/business-os/auth-sync.js",
  "public/business-os/bos.js",
];

test("Milesymedia has explicit canonical local home, services and contact routes", () => {
  assert.equal(MILESYMEDIA_HOME_PATH, "/milesymedia");
  assert.equal(MILESYMEDIA_SERVICES_PATH, "/milesymedia#services");
  assert.equal(MILESYMEDIA_CONTACT_PATH, "/milesymedia/contact");

  const page = read("src/app/(website)/milesymedia/page.tsx");
  assert.match(page, /Milesymedia studio/);
  assert.match(page, /id="services"/);
  assert.match(page, /id="contact"/);
  assert.match(page, /mailto:hello@milesymedia\.co/);
  assert.match(page, /tel:\+447707020250/);
  const contactPage = read("src/app/(website)/milesymedia/contact/page.tsx");
  assert.match(contactPage, /Contact Milesymedia/);
  assert.match(contactPage, /mailto:hello@milesymedia\.co/);
  assert.match(contactPage, /tel:\+447707020250/);
});

test("Milesymedia-labelled React surfaces never send home or contact into AquaCRM root", () => {
  for (const path of reactMilesymediaSurfaces) {
    const source = read(path);
    assert.doesNotMatch(source, /href=(?:\{|)["']\/(?:["']|#(?:contact|services))/, `${path} still targets AquaCRM root`);
  }
  const shell = read(reactMilesymediaSurfaces[0]);
  assert.match(shell, /href=\{MILESYMEDIA_HOME_PATH\}/);
  assert.match(shell, /href=\{MILESYMEDIA_SERVICES_PATH\}/);
  assert.match(shell, /href=\{MILESYMEDIA_CONTACT_PATH\}/);
});

test("Business OS handoffs use the same explicit Milesymedia hub", () => {
  for (const path of staticBusinessOsSurfaces) {
    const source = read(path);
    assert.doesNotMatch(source, /href=["']\/["']|href=["']\/#contact["']/, `${path} still silently switches to AquaCRM`);
  }
  const combined = staticBusinessOsSurfaces.map(read).join("\n");
  assert.match(combined, /href=["']\/milesymedia["']/);
  assert.match(combined, /href=["']\/milesymedia\/contact["']/);
});

test("AquaCRM root remains explicitly separate from the Milesymedia hub", () => {
  const config = read("next.config.ts");
  assert.match(config, /source: "\/"[\s\S]*destination: "\/aquacrm-site\/index\.html"/);
  assert.doesNotMatch(read("src/app/(website)/milesymedia/page.tsx"), /AquaCRM/);
});
