// The destination registry, and the drift that would make it useless.
//
// Ed, 2026-08-29, on the app being hard to navigate. The fix was to stop search
// reading the sidebar and give it the app's own list of destinations. That only
// works while the list is TRUE — a registry quietly one release out of date is
// worse than none, because it looks authoritative.
//
// So this walks the real route tree and compares. A page added without a
// registry entry fails here, on the day it is added, with the line to paste.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PORTAL_DESTINATIONS, destinationSearchItems } from "../src/lib/chrome/destinations";

function walk(dir: string, test: (entry: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, test, out);
    else if (test(entry)) out.push(full);
  }
  return out;
}

function staticRoutes(): string[] {
  return walk("src/app/portal", entry => entry === "page.tsx")
    .map(file => file.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/")
    .filter(route => !route.includes("["))
    .sort();
}

describe("the registry matches the app", () => {
  it("walks a real route tree, so a broken walk cannot pass this file", () => {
    assert.ok(staticRoutes().length > 50, "expected the portal routes");
  });

  it("lists every static portal route", () => {
    const listed = new Set(PORTAL_DESTINATIONS.map(destination => destination.href));
    const missing = staticRoutes().filter(route => !listed.has(route));
    assert.deepEqual(missing, [],
      "these pages exist and are not in the destination registry, so search cannot find them:\n  "
      + missing.map(route => `{ href: "${route}", label: "…", area: "…" },`).join("\n  "));
  });

  it("lists nothing that does not exist", () => {
    // A dead entry sends somebody to a 404 from the one control meant to help.
    const routes = new Set(staticRoutes());
    const stale = PORTAL_DESTINATIONS.map(d => d.href).filter(href => !routes.has(href));
    assert.deepEqual(stale, [], `these registry entries have no page:\n  ${stale.join("\n  ")}`);
  });

  it("has no duplicate hrefs", () => {
    const hrefs = PORTAL_DESTINATIONS.map(destination => destination.href);
    assert.equal(new Set(hrefs).size, hrefs.length, "one destination, one row");
  });

  it("gives every destination a label and an area", () => {
    // A blank label is a search row nobody can read or match against.
    for (const destination of PORTAL_DESTINATIONS) {
      assert.ok(destination.label.trim(), `${destination.href} has no label`);
      assert.ok(destination.area.trim(), `${destination.href} has no area`);
    }
  });
});

describe("search rows", () => {
  it("carry the area, so two same-named pages are tellable apart", () => {
    // There are two "Contacts" and several "Website". A flat result list with
    // bare labels would offer the same word twice and no way to choose.
    const rows = destinationSearchItems();
    assert.ok(rows.every(row => row.label.includes(" · ")));
    assert.equal(new Set(rows.map(row => row.label)).size, rows.length,
      "two identical search rows is a coin flip, not a result");
  });
});

describe("the topbar actually uses it", () => {
  const source = readFileSync("src/components/chrome/Topbar.tsx", "utf8");

  it("no longer searches the sidebar alone — and no longer over-shares", () => {
    // The original defect: nav and search had the same blind spot. The fix for
    // that then over-corrected (Ed, 2026-08-30): the WHOLE registry went into
    // search for every role, so staff and freelancers were shown owner and
    // Dev Team doors their role cannot open. The role-aware variant is the
    // required call now; the unfiltered one must not come back here.
    assert.match(source, /destinationSearchItemsFor\(role, /);
    assert.doesNotMatch(source, /destinationSearchItems\(\)/,
      "the unfiltered registry is back in the topbar — every role sees every door again");
  });

  it("tells roles apart in the registry half", async () => {
    const { destinationSearchItemsFor } = await import("../src/lib/chrome/destinations");
    const owner = destinationSearchItemsFor("agency-owner", true);
    const staff = destinationSearchItemsFor("agency-staff", false);
    const freelancer = destinationSearchItemsFor("freelancer", false);
    assert.ok(owner.some(item => item.href.startsWith("/portal/agency/")), "owners lost their own surfaces");
    assert.ok(!staff.some(item => item.href.startsWith("/portal/agency/settings")),
      "delegated staff are offered the agency settings door again");
    assert.ok(!staff.some(item => item.label.includes("· Dev Team")),
      "staff are offered Dev Team destinations");
    assert.ok(!freelancer.some(item => item.href.startsWith("/portal/agency/")),
      "freelancers are offered agency destinations");
    // Dev surfaces ride the same visibility the dev icon earns.
    assert.ok(!destinationSearchItemsFor("agency-owner", false).some(item => item.label.includes("· Dev Team")),
      "Dev Team shows without the dev gate");
  });

  it("keeps nav rows first and dedupes by href", () => {
    // Nav rows carry the person's own labels and plugin-contributed entries;
    // a page in both must appear once, not twice.
    assert.match(source, /navHrefs\.has\(item\.href\)/);
  });
});
