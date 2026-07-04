// Smoke — R041 slug redirect helper.

import {
  buildRedirectMap,
  resolveRedirect,
  normalizeSlug,
  withSlugRename,
  type SlugRedirectPage,
} from "../lib/slugRedirects";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  console.log("§ Slug redirects");

  // ─── A: normalizeSlug ────────────────────────────────────────────────
  expect("normalizes leading slash", normalizeSlug("about") === "/about");
  expect("strips trailing slash", normalizeSlug("/about/") === "/about");
  expect("preserves root /", normalizeSlug("/") === "/");
  expect("empty → /", normalizeSlug("") === "/");

  // ─── B: buildRedirectMap basics ──────────────────────────────────────
  {
    const pages: SlugRedirectPage[] = [
      { slug: "/about-us", status: "published", redirectSourceSlugs: ["/about", "/team"] },
      { slug: "/blog", status: "published" },
    ];
    const m = buildRedirectMap(pages);
    expect("/about → /about-us", m.forward["/about"] === "/about-us");
    expect("/team → /about-us (multi sources to one target)",
      m.forward["/team"] === "/about-us");
    expect("/blog has no incoming until added",
      m.forward["/blog"] === undefined);
    expect("no issues on clean map", m.issues.length === 0);
  }

  // ─── C: drafts excluded by default ───────────────────────────────────
  {
    const pages: SlugRedirectPage[] = [
      { slug: "/draft-page", status: "draft", redirectSourceSlugs: ["/old"] },
    ];
    const m = buildRedirectMap(pages);
    expect("draft page contributes no redirect by default",
      m.forward["/old"] === undefined);
    const m2 = buildRedirectMap(pages, { publishedOnly: false });
    expect("publishedOnly:false includes drafts",
      m2.forward["/old"] === "/draft-page");
  }

  // ─── D: self-redirect issue ─────────────────────────────────────────
  {
    const pages: SlugRedirectPage[] = [
      { slug: "/x", status: "published", redirectSourceSlugs: ["/x"] },
    ];
    const m = buildRedirectMap(pages);
    expect("self-redirect flagged + dropped",
      m.issues.some(i => i.code === "self") && m.forward["/x"] === undefined);
  }

  // ─── E: conflict — two pages claim same old slug ────────────────────
  {
    const pages: SlugRedirectPage[] = [
      { slug: "/a", status: "published", redirectSourceSlugs: ["/old"] },
      { slug: "/b", status: "published", redirectSourceSlugs: ["/old"] },
    ];
    const m = buildRedirectMap(pages);
    expect("conflict flagged",
      m.issues.some(i => i.code === "conflict"));
    expect("first claim wins",
      m.forward["/old"] === "/a");
  }

  // ─── F: cycle detection (A→B + B→A) ─────────────────────────────────
  {
    const pages: SlugRedirectPage[] = [
      { slug: "/a", status: "published", redirectSourceSlugs: ["/b"] },
      { slug: "/b", status: "published", redirectSourceSlugs: ["/a"] },
    ];
    const m = buildRedirectMap(pages);
    expect("2-cycle flagged",
      m.issues.some(i => i.code === "cycle"));
  }

  // ─── G: resolveRedirect ──────────────────────────────────────────────
  {
    const pages: SlugRedirectPage[] = [
      { slug: "/about-us", status: "published", redirectSourceSlugs: ["/about"] },
    ];
    const m = buildRedirectMap(pages);
    const r = resolveRedirect("/about", m);
    expect("resolveRedirect emits 301 + new slug",
      r !== null && r.to === "/about-us" && r.status === 301);
    expect("non-redirect slug returns null",
      resolveRedirect("/contact", m) === null);
    expect("normalisation: /about/ resolves",
      resolveRedirect("/about/", m)?.to === "/about-us");
    expect("accepts plain Record map (no .forward wrapper)",
      resolveRedirect("/about", { "/about": "/about-us" })?.to === "/about-us");
  }

  // ─── H: chain resolution A→B→C ───────────────────────────────────────
  {
    const pages: SlugRedirectPage[] = [
      { slug: "/c", status: "published", redirectSourceSlugs: ["/b"] },
      { slug: "/b-alias", status: "published", redirectSourceSlugs: ["/a"] },
    ];
    // Manually wire A→B-alias and B→C; then resolve A
    const map = { "/a": "/b", "/b": "/c" };
    const r = resolveRedirect("/a", map);
    expect("chain A→B→C resolves to /c in one hop",
      r?.to === "/c");
  }

  // ─── I: withSlugRename ───────────────────────────────────────────────
  {
    const page: SlugRedirectPage = { slug: "/about" };
    const renamed = withSlugRename(page, "/about-us");
    expect("withSlugRename adds old slug to sources",
      renamed.slug === "/about-us" &&
      renamed.redirectSourceSlugs.includes("/about"));
    // Idempotent
    const renamedAgain = withSlugRename(
      { slug: "/about-us", redirectSourceSlugs: ["/about"] },
      "/about-us-2",
    );
    expect("withSlugRename appends, doesn't duplicate prior",
      renamedAgain.redirectSourceSlugs.includes("/about") &&
      renamedAgain.redirectSourceSlugs.includes("/about-us"));
    // No-op rename
    const same = withSlugRename({ slug: "/x" }, "/x");
    expect("rename to same slug → no-op",
      same.slug === "/x" && same.redirectSourceSlugs.length === 0);
    // Renaming back to a slug that was a previous source drops it
    const ping = withSlugRename(
      { slug: "/b", redirectSourceSlugs: ["/a"] },
      "/a",
    );
    expect("rename back to prior source drops self-redirect",
      !ping.redirectSourceSlugs.includes("/a") &&
      ping.redirectSourceSlugs.includes("/b"));
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
